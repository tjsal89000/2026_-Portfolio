/**
 * 방문 기록 (관리자 페이지용)
 *
 * 로그인 없이 들어오는 방문자를 알 수 있게, 메뉴를 열 때마다 방문 한 건을 남긴다.
 *  - visitorId: 브라우저에 저장된 임의 값. 같은 브라우저를 구분하는 용도일 뿐 개인을 식별하지 않는다.
 *  - ip: 접속 IP. 개인정보이므로 30일 뒤 자동 삭제한다.
 * 관리자 조회는 ADMIN_TOKEN이 맞을 때만 가능하다 (k8s Secret에서만 주입).
 */

import pg from "pg";
import { createHash, timingSafeEqual } from "node:crypto";

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? "aiops",
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB ?? "aiops_db",
});

export const RETENTION_DAYS = 30;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "";

// 화면에서 보내는 메뉴 이름만 받는다 (임의 문자열이 DB에 쌓이지 않게)
export const KNOWN_VIEWS = [
  "about",
  "overview",
  "ops",
  "stats",
  "progress",
  "tests",
  "infra",
  "architecture",
  "troubleshooting",
];

export async function ensureVisitTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS page_visits (
      id          BIGSERIAL PRIMARY KEY,
      visitor_id  TEXT NOT NULL,
      ip          TEXT NOT NULL,
      user_agent  TEXT NOT NULL,
      view        TEXT NOT NULL,
      visited_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS page_visits_at_idx ON page_visits (visited_at)");
}

export interface VisitInput {
  visitorId: string;
  ip: string;
  userAgent: string;
  view: string;
}

export async function recordVisit(v: VisitInput): Promise<void> {
  await pool.query(
    "INSERT INTO page_visits (visitor_id, ip, user_agent, view) VALUES ($1, $2, $3, $4)",
    [v.visitorId.slice(0, 64), v.ip.slice(0, 64), v.userAgent.slice(0, 300), v.view],
  );
}

// 30일 넘은 기록을 하루에 한 번 지운다
export function startVisitCleanup(): void {
  const run = () =>
    pool
      .query("DELETE FROM page_visits WHERE visited_at < now() - ($1::int * interval '1 day')", [RETENTION_DAYS])
      .catch((err) => console.error("[방문 기록 정리 실패]", (err as Error).message));
  run();
  setInterval(run, 24 * 60 * 60 * 1000).unref();
}

// User-Agent 문자열을 "Chrome · Windows" 같은 짧은 이름으로 줄인다 (원문 전체를 화면에 보이지 않게)
export function summarizeUserAgent(ua: string): string {
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "기타";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /iPhone|iPad/.test(ua)
      ? "iOS"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "기타";
  return `${browser} · ${os}`;
}

// 관리자 토큰 비교. 해시로 길이를 맞춘 뒤 timingSafeEqual로 비교해서 응답 시간으로 글자를 알아내지 못하게 한다.
export function isAdminToken(input: string | undefined): boolean {
  if (!ADMIN_TOKEN) return false; // 토큰이 설정되지 않으면 관리자 기능 자체를 끈다
  const given = createHash("sha256").update(input ?? "").digest();
  const expected = createHash("sha256").update(ADMIN_TOKEN).digest();
  return timingSafeEqual(given, expected);
}

export function isAdminEnabled(): boolean {
  return ADMIN_TOKEN.length > 0;
}

export interface VisitSummary {
  todayViews: number;
  todayVisitors: number;
  weekVisitors: number;
  topViews: { view: string; count: number }[];
  recent: { at: string; ip: string; browser: string; view: string; visitor: string }[];
}

export async function getVisitSummary(): Promise<VisitSummary> {
  const [today, week, views, recent] = await Promise.all([
    pool.query<{ views: number; visitors: number }>(
      `SELECT COUNT(*)::int AS views, COUNT(DISTINCT visitor_id)::int AS visitors
         FROM page_visits WHERE visited_at >= date_trunc('day', now())`,
    ),
    pool.query<{ visitors: number }>(
      `SELECT COUNT(DISTINCT visitor_id)::int AS visitors FROM page_visits WHERE visited_at >= now() - interval '7 days'`,
    ),
    pool.query<{ view: string; count: number }>(
      `SELECT view, COUNT(*)::int AS count FROM page_visits
        WHERE visited_at >= now() - interval '7 days' GROUP BY view ORDER BY count DESC`,
    ),
    pool.query<{ visited_at: Date; ip: string; user_agent: string; view: string; visitor_id: string }>(
      `SELECT visited_at, ip, user_agent, view, visitor_id FROM page_visits ORDER BY visited_at DESC LIMIT 50`,
    ),
  ]);

  return {
    todayViews: today.rows[0].views,
    todayVisitors: today.rows[0].visitors,
    weekVisitors: week.rows[0].visitors,
    topViews: views.rows,
    recent: recent.rows.map((r) => ({
      at: new Date(r.visited_at).toISOString(),
      ip: r.ip,
      browser: summarizeUserAgent(r.user_agent),
      view: r.view,
      // 방문자 식별값은 앞 8자리만 보여준다 (같은 브라우저끼리 구분하는 정도)
      visitor: r.visitor_id.slice(0, 8),
    })),
  };
}
