/**
 * 관리자 기록 (접속, 행동, 로그인 시도, IP 위치)
 *
 * 모든 기록은 DB에 남는다.
 *  - page_visits: 메뉴 열람 (visits.ts)
 *  - activity_log: 행동(시연 주입, 리포트 생성), 로그인 성공/실패
 * IP 위치는 ip-api.com으로 한 번 조회해서 ip_geo 테이블에 캐시한다.
 * 비밀번호(토큰) 값은 어디에도 저장하지 않는다. 실패 기록에는 IP, 시각, 브라우저 정보만 남는다.
 */

import pg from "pg";
import { summarizeUserAgent } from "./visits.js";

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? "aiops",
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB ?? "aiops_db",
});

export type ActivityKind = "action" | "login_ok" | "login_fail";

export async function ensureAdminTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id          BIGSERIAL PRIMARY KEY,
      kind        TEXT NOT NULL,
      detail      TEXT NOT NULL,
      ip          TEXT NOT NULL,
      user_agent  TEXT NOT NULL,
      visitor_id  TEXT,
      at          TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS activity_log_at_idx ON activity_log (at)");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ip_geo (
      ip          TEXT PRIMARY KEY,
      country     TEXT NOT NULL,
      region      TEXT NOT NULL,
      city        TEXT NOT NULL,
      fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export interface ActivityInput {
  kind: ActivityKind | "action";
  detail: string;
  ip: string;
  userAgent: string;
  visitorId?: string;
}

// 기록 실패가 화면이나 요청을 망가뜨리면 안 되므로 호출하는 쪽은 await 하지 않고 catch 로만 남긴다
export function logActivity(input: ActivityInput): void {
  pool
    .query(
      "INSERT INTO activity_log (kind, detail, ip, user_agent, visitor_id) VALUES ($1, $2, $3, $4, $5)",
      [input.kind, input.detail.slice(0, 200), input.ip.slice(0, 64), input.userAgent.slice(0, 300), input.visitorId?.slice(0, 64) ?? null],
    )
    .catch((err) => console.error("[활동 기록 실패]", (err as Error).message));
}

// 내부망/루프백 주소는 위치를 찾을 수 없으니 따로 표시한다
export function isPrivateIp(ip: string): boolean {
  const clean = ip.replace(/^::ffff:/, "");
  return (
    clean === "127.0.0.1" ||
    clean === "::1" ||
    clean.startsWith("10.") ||
    clean.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(clean) ||
    clean.startsWith("fc") ||
    clean.startsWith("fd") ||
    clean.startsWith("fe80")
  );
}

const LOCK_WINDOW_MS = 10 * 60_000;
const LOCK_MAX_FAILURES = 5;
const failures = new Map<string, number[]>();

// 잠금 중이면 남은 밀리초, 아니면 0. 잠긴 동안의 요청은 실패로 세지 않아 잠금이 끝없이 늘어나지 않는다.
export function lockRemainingMs(ip: string): number {
  const now = Date.now();
  const recent = (failures.get(ip) ?? []).filter((t) => now - t < LOCK_WINDOW_MS);
  failures.set(ip, recent);
  if (recent.length < LOCK_MAX_FAILURES) return 0;
  return LOCK_WINDOW_MS - (now - recent[recent.length - 1]);
}

export function recordFailure(ip: string): void {
  failures.set(ip, [...(failures.get(ip) ?? []), Date.now()]);
}

// 30일 넘은 활동 기록과 IP 위치 캐시를 하루에 한 번 지운다
export function startAdminCleanup(): void {
  const run = () => {
    pool
      .query("DELETE FROM activity_log WHERE at < now() - interval '30 days'")
      .catch((err) => console.error("[활동 기록 정리 실패]", (err as Error).message));
    pool
      .query("DELETE FROM ip_geo WHERE fetched_at < now() - interval '30 days'")
      .catch((err) => console.error("[위치 캐시 정리 실패]", (err as Error).message));
  };
  run();
  setInterval(run, 24 * 60 * 60 * 1000).unref();
}

export interface Geo {
  country: string;
  region: string;
  city: string;
}

const UNKNOWN: Geo = { country: "알 수 없음", region: "", city: "" };
const INTERNAL: Geo = { country: "내부망", region: "", city: "" };

// 여러 IP의 위치를 한꺼번에 찾는다. 캐시에 있으면 외부 호출을 하지 않는다.
export async function lookupGeo(ips: string[]): Promise<Map<string, Geo>> {
  const unique = [...new Set(ips)];
  const result = new Map<string, Geo>();
  const cached = await pool.query<{ ip: string; country: string; region: string; city: string }>(
    "SELECT ip, country, region, city FROM ip_geo WHERE ip = ANY($1)",
    [unique],
  );
  for (const row of cached.rows) result.set(row.ip, { country: row.country, region: row.region, city: row.city });

  const missing = unique.filter((ip) => !result.has(ip));
  await Promise.all(
    missing.map(async (ip) => {
      if (isPrivateIp(ip)) {
        result.set(ip, INTERNAL);
        return;
      }
      try {
        const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city,query`, {
          signal: AbortSignal.timeout(3000),
        });
        const json = (await res.json()) as { status?: string; country?: string; regionName?: string; city?: string };
        if (json.status !== "success") {
          result.set(ip, UNKNOWN);
          return;
        }
        const geo = { country: json.country ?? "알 수 없음", region: json.regionName ?? "", city: json.city ?? "" };
        result.set(ip, geo);
        await pool.query(
          "INSERT INTO ip_geo (ip, country, region, city) VALUES ($1, $2, $3, $4) ON CONFLICT (ip) DO NOTHING",
          [ip, geo.country, geo.region, geo.city],
        );
      } catch {
        result.set(ip, UNKNOWN); // 위치 조회 실패는 화면에 "알 수 없음"으로 보여준다
      }
    }),
  );
  return result;
}

// ip-api는 한글을 지원하지 않아서, 자주 나오는 국가·지역·도시만 한글로 바꾼다. 나머지는 영문 그대로 둔다.
const KO_NAMES: Record<string, string> = {
  "South Korea": "대한민국",
  Japan: "일본",
  China: "중국",
  "Hong Kong": "홍콩",
  Taiwan: "대만",
  Singapore: "싱가포르",
  Vietnam: "베트남",
  Thailand: "태국",
  Philippines: "필리핀",
  Indonesia: "인도네시아",
  Malaysia: "말레이시아",
  India: "인도",
  Australia: "호주",
  "United States": "미국",
  Canada: "캐나다",
  Brazil: "브라질",
  "United Kingdom": "영국",
  Germany: "독일",
  France: "프랑스",
  Netherlands: "네덜란드",
  Ireland: "아일랜드",
  Sweden: "스웨덴",
  Finland: "핀란드",
  Russia: "러시아",
  Seoul: "서울",
  Busan: "부산",
  Incheon: "인천",
  Daegu: "대구",
  Daejeon: "대전",
  Gwangju: "광주",
  Ulsan: "울산",
  Sejong: "세종",
  "Gyeonggi-do": "경기도",
  "Gangwon-do": "강원도",
  "Chungcheongbuk-do": "충청북도",
  "Chungcheongnam-do": "충청남도",
  "Jeollabuk-do": "전라북도",
  "Jeollanam-do": "전라남도",
  "Gyeongsangbuk-do": "경상북도",
  "Gyeongsangnam-do": "경상남도",
  "Jeju-do": "제주특별자치도",
  Suwon: "수원",
  Seongnam: "성남",
  Yongin: "용인",
  Goyang: "고양",
  Bucheon: "부천",
  Ansan: "안산",
  Anyang: "안양",
  Hwaseong: "화성",
  Namyangju: "남양주",
  Cheongju: "청주",
  Cheonan: "천안",
  Changwon: "창원",
  Pohang: "포항",
  Jeonju: "전주",
  Gimhae: "김해",
  Jeju: "제주",
  Tokyo: "도쿄",
  Osaka: "오사카",
  Beijing: "베이징",
  Shanghai: "상하이",
  "New York": "뉴욕",
  "San Jose": "새너제이",
};

export function formatGeo(geo: Geo | undefined): string {
  if (!geo) return "알 수 없음";
  if (geo.country === "내부망") return "내부망";
  const ko = (s: string) => KO_NAMES[s] ?? s;
  return [...new Set([geo.country, geo.region, geo.city].filter(Boolean).map(ko))].join(" · ");
}

export interface AdminEvent {
  at: string;
  kind: "view" | "action" | "login_ok" | "login_fail";
  detail: string;
  ip: string;
  location: string;
  userAgent: string;
  visitor: string;
}

export interface AdminOverview {
  kpis: { todayVisitors: number; todayViews: number; weekLoginFail: number; weekActions: number };
  countries: { label: string; count: number }[];
  events: AdminEvent[];
}

export async function getAdminOverview(limit = 300): Promise<AdminOverview> {
  const [kpi, rows, countryRows] = await Promise.all([
    pool.query<{ today_visitors: number; today_views: number; week_fail: number; week_actions: number }>(
      `SELECT
         (SELECT COUNT(DISTINCT visitor_id)::int FROM page_visits WHERE visited_at >= date_trunc('day', now())) AS today_visitors,
         (SELECT COUNT(*)::int FROM page_visits WHERE visited_at >= date_trunc('day', now())) AS today_views,
         (SELECT COUNT(*)::int FROM activity_log WHERE kind = 'login_fail' AND at >= now() - interval '7 days') AS week_fail,
         (SELECT COUNT(*)::int FROM activity_log WHERE kind = 'action' AND at >= now() - interval '7 days') AS week_actions`,
    ),
    pool.query<{ kind: string; detail: string; ip: string; user_agent: string; visitor_id: string | null; at: Date }>(
      `SELECT * FROM (
         SELECT 'view'::text AS kind, view AS detail, ip, user_agent, visitor_id, visited_at AS at FROM page_visits
         UNION ALL
         SELECT kind, detail, ip, user_agent, visitor_id, at FROM activity_log
       ) t ORDER BY at DESC LIMIT $1`,
      [limit],
    ),
    pool.query<{ ip: string }>(
      `SELECT DISTINCT ip FROM page_visits WHERE visited_at >= now() - interval '7 days'
       UNION SELECT DISTINCT ip FROM activity_log WHERE at >= now() - interval '7 days'`,
    ),
  ]);

  // 화면에 보이는 IP 위치와 국가별 집계 (최근 7일 접속 IP 기준)
  const geo = await lookupGeo([...rows.rows.map((r) => r.ip), ...countryRows.rows.map((r) => r.ip)]);

  const countryCount = new Map<string, number>();
  for (const r of countryRows.rows) {
    const label = geo.get(r.ip)?.country ?? "알 수 없음";
    countryCount.set(label, (countryCount.get(label) ?? 0) + 1);
  }

  return {
    kpis: {
      todayVisitors: kpi.rows[0].today_visitors,
      todayViews: kpi.rows[0].today_views,
      weekLoginFail: kpi.rows[0].week_fail,
      weekActions: kpi.rows[0].week_actions,
    },
    countries: [...countryCount.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    events: rows.rows.map((r) => ({
      at: new Date(r.at).toISOString(),
      kind: r.kind as AdminEvent["kind"],
      detail: r.detail,
      ip: r.ip,
      location: formatGeo(geo.get(r.ip)),
      userAgent: summarizeUserAgent(r.user_agent),
      visitor: r.visitor_id ? r.visitor_id.slice(0, 8) : "-",
    })),
  };
}
