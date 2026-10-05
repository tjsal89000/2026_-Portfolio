/**
 * "실시간 트래픽 플로우" 패널이 새로고침해도 비어있지 않도록, 페이지가 뜰 때 최근 결제
 * 내역을 DB에서 가져와 초기값으로 쓴다 (이후 실시간 갱신은 계속 WebSocket으로).
 *
 * 새 DB를 따로 만들지 않고 이미 db-writer-consumer가 저장해온 payments 테이블을 그대로
 * 읽는다 - Postgres를 "결제 이벤트의 기록"으로 쓰는 이 프로젝트의 원칙(ADR-2) 그대로이고,
 * MCP 서버(mcp-server/src/db.ts)도 이미 같은 테이블을 읽기 전용으로 조회하고 있어 새로운
 * 패턴이 아니다.
 */

import pg from "pg";

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? "aiops",
  password: process.env.POSTGRES_PASSWORD, // 기본값 없음: k8s Secret이나 로컬 환경변수에서만 받는다
  database: process.env.POSTGRES_DB ?? "aiops_db",
});

export interface PaymentRow {
  idempotencyKey: string;
  accountId: string;
  amount: number;
  country: string;
  paymentMethod: string;
  // payments 테이블에는 승인/중복/실패 상태가 따로 저장돼 있지 않다(db-writer-consumer가
  // 성공한 건만 여기 저장하고, 상태 구분은 Redis Pub/Sub 메시지에만 실려있음) - 새로고침
  // 직후 잠깐 보여주는 과거 내역이라 전부 "승인"으로 간주해도 실사용에 지장이 없다.
  status: "APPROVED";
  processedAt: string;
}

export async function getRecentPayments(limit = 20): Promise<PaymentRow[]> {
  const result = await pool.query(
    `SELECT idempotency_key, account_id, amount, country, payment_method, processed_at
     FROM payments
     ORDER BY processed_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows.map((row) => ({
    idempotencyKey: row.idempotency_key,
    accountId: row.account_id,
    amount: Number(row.amount),
    country: row.country,
    paymentMethod: row.payment_method,
    status: "APPROVED" as const,
    processedAt: row.processed_at.toISOString(),
  }));
}
