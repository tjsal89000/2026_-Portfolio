import CircuitBreaker from "opossum";

const PAYMENT_API_URL = process.env.PAYMENT_API_URL ?? "http://localhost:8080/payments";

interface ProxyResult {
  status: number;
  data: unknown;
}

async function callPaymentApi(body: unknown): Promise<ProxyResult> {
  const res = await fetch(PAYMENT_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(`payment-api responded ${res.status}`), { status: res.status, data });
  }
  return { status: res.status, data };
}

// payment-api(Java) 쪽은 이미 Resilience4j로 "Kafka 발행부"에 Retry/Circuit Breaker를 적용해뒀다.
// 여기(게이트웨이)는 그 위 계층에서 "payment-api 자체가 느려지거나 응답이 없을 때" 게이트웨이가
// 계속 대기하며 커넥션을 묶어두지 않도록 opossum으로 같은 개념을 Node.js 쪽에 대칭적으로 적용한다.
export const paymentBreaker = new CircuitBreaker(callPaymentApi, {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 10000,
  rollingCountTimeout: 10000,
});

paymentBreaker.fallback(() => {
  throw Object.assign(new Error("payment-api 일시 장애 - 서킷브레이커 open"), { status: 503 });
});
