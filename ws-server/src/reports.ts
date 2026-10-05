import pg from "pg";

// k8s에서는 POSTGRES_* 환경변수로 Postgres Service 주소를 주입한다
const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? "aiops",
  password: process.env.POSTGRES_PASSWORD, // 기본값 없음: k8s Secret이나 로컬 환경변수에서만 받는다
  database: process.env.POSTGRES_DB ?? "aiops_db",
});

export interface ReportRow {
  id: number;
  summary: string;
  generated_at: string;
}

export async function getLatestReports(limit = 5): Promise<ReportRow[]> {
  const result = await pool.query<ReportRow>(
    "SELECT id, summary, generated_at FROM reports ORDER BY id DESC LIMIT $1",
    [limit]
  );
  return result.rows;
}
