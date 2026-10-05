import pg from "pg";

// k8s에서는 POSTGRES_* 환경변수로 Postgres Service 주소를 주입한다
const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? "aiops",
  password: process.env.POSTGRES_PASSWORD, // 기본값 없음: k8s Secret이나 로컬 환경변수에서만 받는다
  database: process.env.POSTGRES_DB ?? "aiops_db",
});

/**
 * 읽기 전용 조회. account_id/country는 사용자(에이전트)가 넘긴 값이라
 * 문자열을 SQL에 직접 이어붙이지 않고 항상 파라미터 바인딩($1, $2...)으로 처리한다
 * (SQL 인젝션 방지 - 이 값들이 결국 LLM 에이전트가 채워 넣는 값이라 더 신경써야 함).
 */
export async function queryRecentPayments(limit = 20, accountId?: string, country?: string) {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (accountId) {
    params.push(accountId);
    conditions.push(`account_id = $${params.length}`);
  }
  if (country) {
    params.push(country);
    conditions.push(`country = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit);

  const sql = `
    SELECT idempotency_key, merchant_id, account_id, amount, currency, country, payment_method, requested_at, processed_at
    FROM payments
    ${where}
    ORDER BY processed_at DESC
    LIMIT $${params.length}
  `;

  const result = await pool.query(sql, params);
  return result.rows;
}

/** 국가별/결제수단별 집계 - Phase 8 AI 리포트 에이전트가 요약문을 만들 때 쓸 재료 */
export async function getPaymentSummary() {
  const [byCountry, byMethod, totals] = await Promise.all([
    pool.query(
      `SELECT country, COUNT(*)::int AS count, SUM(amount)::bigint AS total_amount
       FROM payments GROUP BY country ORDER BY count DESC`
    ),
    pool.query(
      `SELECT payment_method, COUNT(*)::int AS count
       FROM payments GROUP BY payment_method ORDER BY count DESC`
    ),
    pool.query(`SELECT COUNT(*)::int AS total_payments, SUM(amount)::bigint AS total_amount FROM payments`),
  ]);

  return {
    totalPayments: totals.rows[0]?.total_payments ?? 0,
    totalAmount: totals.rows[0]?.total_amount?.toString() ?? "0",
    byCountry: byCountry.rows,
    byPaymentMethod: byMethod.rows,
  };
}
