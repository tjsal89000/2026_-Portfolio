/**
 * 인시던트 타임라인
 *
 * 이상탐지 알림은 Redis Pub/Sub으로만 흘러가서 저장되지 않았다. 그래서 타임라인을 만들려면
 * 알림을 받는 시점에 DB에 남겨야 한다. 저장 지점을 ws-server로 잡은 이유: 이미 Redis 구독자이면서
 * Postgres 접근도 하고 있어서, 이상탐지 에이전트나 게이트웨이를 고치지 않아도 된다.
 * AI 리포트는 원래 reports 테이블에 쌓이므로 알림과 같은 시간축에 합쳐서 보여준다.
 */

import pg from "pg";

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? "aiops",
  password: process.env.POSTGRES_PASSWORD ?? "aiops123",
  database: process.env.POSTGRES_DB ?? "aiops_db",
});

export async function ensureAlertTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS alert_log (
      id          BIGSERIAL PRIMARY KEY,
      alert_type  TEXT NOT NULL,
      payload     JSONB NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export async function saveAlert(payload: unknown): Promise<void> {
  const body = (payload ?? {}) as { type?: unknown };
  const alertType = typeof body.type === "string" ? body.type : "알림";
  await pool.query("INSERT INTO alert_log (alert_type, payload) VALUES ($1, $2)", [
    alertType,
    JSON.stringify(payload ?? {}),
  ]);
}

export interface TimelineEvent {
  kind: "alert" | "report";
  title: string;
  detail: string;
  at: string; // ISO 시각
}

interface TimelineRow {
  kind: "alert" | "report";
  title: string;
  detail: string | null;
  at: Date;
}

// DB 행을 화면에서 쓰는 모양으로 바꾼다. 리포트는 요약문이 길어서 첫 줄만 제목처럼 쓴다.
export function mapTimelineRow(row: TimelineRow): TimelineEvent {
  return {
    kind: row.kind,
    // 리포트 첫 줄은 마크다운 제목(## ...)이라 기호를 떼고 글자만 쓴다
    title: row.title.replace(/^#+\s*/, ""),
    detail: row.detail ?? "",
    at: new Date(row.at).toISOString(),
  };
}

export async function getTimeline(limit = 30): Promise<TimelineEvent[]> {
  // 두 테이블의 시각 타입이 다를 수 있어서 둘 다 timestamptz로 맞춘 뒤 합친다
  const result = await pool.query<TimelineRow>(
    `SELECT * FROM (
       SELECT 'alert'::text AS kind,
              alert_type AS title,
              payload::text AS detail,
              received_at::timestamptz AS at
         FROM alert_log
       UNION ALL
       SELECT 'report'::text AS kind,
              COALESCE(NULLIF(split_part(summary, E'\\n', 1), ''), 'AI 리포트') AS title,
              summary AS detail,
              generated_at::timestamptz AS at
         FROM reports
     ) t
     ORDER BY at DESC
     LIMIT $1`,
    [limit],
  );
  return result.rows.map(mapTimelineRow);
}
