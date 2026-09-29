import { Redis } from "ioredis";

// k8s에서는 REDIS_HOST/REDIS_PORT 환경변수로 Redis Service 주소를 주입한다
const redis = new Redis({
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
});

/**
 * db-writer-consumer(Java)가 초 단위로 쌓아둔 카운터(payment:count:{epoch}, payment:error:{epoch})를
 * 최근 windowSeconds만큼 MGET으로 한 번에 모아 합산한다.
 * 키 규칙은 PaymentMetricsService.java와 동일해야 함 - 이 MCP 서버는 그 규칙을 그대로 재사용하는 "소비자"다.
 */
export async function getRealtimeMetrics(windowSeconds = 60) {
  const now = Math.floor(Date.now() / 1000);
  const countKeys: string[] = [];
  const errorKeys: string[] = [];
  for (let i = 0; i < windowSeconds; i++) {
    const t = now - i;
    countKeys.push(`payment:count:${t}`);
    errorKeys.push(`payment:error:${t}`);
  }

  const [countValues, errorValues] = await Promise.all([
    redis.mget(...countKeys),
    redis.mget(...errorKeys),
  ]);

  const totalProcessed = countValues.reduce(
    (sum: number, v: string | null) => sum + (v ? Number(v) : 0),
    0
  );
  const totalErrors = errorValues.reduce(
    (sum: number, v: string | null) => sum + (v ? Number(v) : 0),
    0
  );

  return {
    windowSeconds,
    totalProcessed,
    totalErrors,
    tps: Number((totalProcessed / windowSeconds).toFixed(2)),
    errorRatePercent:
      totalProcessed > 0 ? Number(((totalErrors / totalProcessed) * 100).toFixed(2)) : 0,
  };
}
