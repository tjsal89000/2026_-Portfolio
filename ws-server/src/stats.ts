/**
 * 통계 집계 (통계 화면용)
 *
 * 결제는 payments 테이블(db-writer-consumer가 저장), 알림은 alert_log(ws-server가 저장)에서 집계한다.
 * 화면이 자주 새로고침되어도 DB 부하를 줄이려고 1분 캐시를 둔다.
 */

import pg from "pg";

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? "aiops",
  password: process.env.POSTGRES_PASSWORD ?? "aiops123",
  database: process.env.POSTGRES_DB ?? "aiops_db",
});

export interface Share {
  label: string;
  count: number;
  percent: number; // 전체에서 차지하는 비율 (0~100)
}

export interface DayPoint {
  date: string; // YYYY-MM-DD
  count: number;
  amount: number; // 원
}

export interface StatsSummary {
  windowDays: number;
  totalPayments: number;
  totalAmount: number;
  totalAlerts: number;
  countries: Share[];
  paymentMethods: Share[];
  alertTypes: Share[];
  daily: DayPoint[];
}

// 개수 목록을 비율이 붙은 목록으로 바꾼다. 개수가 많은 순서로 정렬하고, 전체가 0이면 비율도 0이다.
export function toShares(rows: { label: string; count: number }[]): Share[] {
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return [...rows]
    .sort((a, b) => b.count - a.count)
    .map((r) => ({
      label: r.label,
      count: r.count,
      percent: total === 0 ? 0 : Math.round((r.count / total) * 1000) / 10,
    }));
}

const WINDOW_DAYS = 14;
const REFRESH_MS = 60_000;

// 집계 결과를 메모리에 들고 있다. 집계는 백그라운드에서 주기적으로 다시 하고, 화면 요청에는 바로 돌려준다.
// (결제 100만 건을 매번 훑으면 한 번에 수 초가 걸려서, 요청마다 계산하지 않게 했다)
let latest: { value: StatsSummary; computedAt: string } | null = null;
let refreshing: Promise<void> | null = null;

export async function refreshStats(): Promise<void> {
  if (refreshing) return refreshing; // 이미 집계 중이면 같은 작업을 기다린다
  refreshing = (async () => {
    try {
      const value = await computeStats();
      latest = { value, computedAt: new Date().toISOString() };
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// 서버가 뜨면 바로 한 번 집계하고, 이후 1분마다 다시 집계한다
export function startStatsRefresh(): void {
  refreshStats().catch((err) => console.error("[통계] 집계 실패:", (err as Error).message));
  setInterval(() => {
    refreshStats().catch((err) => console.error("[통계] 집계 실패:", (err as Error).message));
  }, REFRESH_MS).unref();
}

// 화면 요청: 집계 결과가 이미 있으면 즉시 반환, 없으면(서버 시작 직후) 집계가 끝날 때까지 기다린다
export async function getStats(): Promise<StatsSummary & { computedAt: string }> {
  if (!latest) await refreshStats();
  if (!latest) throw new Error("집계 결과가 없습니다");
  return { ...latest.value, computedAt: latest.computedAt };
}

async function computeStats(): Promise<StatsSummary> {
  const [countries, methods, alerts, daily, totals, alertTotal] = await Promise.all([
    pool.query<{ label: string; count: number }>(
      `SELECT country AS label, COUNT(*)::int AS count FROM payments GROUP BY country`,
    ),
    pool.query<{ label: string; count: number }>(
      `SELECT payment_method AS label, COUNT(*)::int AS count FROM payments GROUP BY payment_method`,
    ),
    pool.query<{ label: string; count: number }>(
      `SELECT alert_type AS label, COUNT(*)::int AS count FROM alert_log GROUP BY alert_type`,
    ),
    pool.query<{ date: string; count: number; amount: string }>(
      `SELECT to_char(date_trunc('day', processed_at), 'YYYY-MM-DD') AS date,
              COUNT(*)::int AS count,
              COALESCE(SUM(amount), 0)::text AS amount
         FROM payments
        WHERE processed_at >= date_trunc('day', now()) - ($1::int - 1) * interval '1 day'
        GROUP BY 1 ORDER BY 1`,
      [WINDOW_DAYS],
    ),
    pool.query<{ count: number; amount: string }>(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0)::text AS amount FROM payments`,
    ),
    pool.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM alert_log`),
  ]);

  // 빈 날짜도 0으로 채워서 그래프 축이 끊기지 않게 한다
  const byDate = new Map(daily.rows.map((r) => [r.date, r]));
  const days: DayPoint[] = [];
  const today = new Date();
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    const hit = byDate.get(d);
    days.push({ date: d, count: hit?.count ?? 0, amount: Number(hit?.amount ?? 0) });
  }

  const value: StatsSummary = {
    windowDays: WINDOW_DAYS,
    totalPayments: totals.rows[0].count,
    totalAmount: Number(totals.rows[0].amount),
    totalAlerts: alertTotal.rows[0].count,
    countries: toShares(countries.rows),
    paymentMethods: toShares(methods.rows),
    alertTypes: toShares(alerts.rows),
    daily: days,
  };
  return value;
}
