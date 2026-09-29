import { Redis } from "ioredis";

// k8s에서는 REDIS_HOST/REDIS_PORT 환경변수로 Redis Service 주소를 주입한다
const redis = new Redis({
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
});

// WebSocket 서버(Phase 10에서 구축 예정)가 구독할 채널. db-writer-consumer가 쓰는
// "payment:events:live"(개별 결제 이벤트)와 역할을 분리해 별도 채널로 발행한다 - 결제
// 이벤트 스트림과 이상탐지 알림 스트림은 대시보드에서 서로 다른 용도(트래픽 애니메이션 vs
// 알림 타임라인)로 쓰이기 때문에 처음부터 채널을 나눠두는 게 맞다.
const ALERT_CHANNEL = "payment:alerts:live";

export async function relayAlertToWebSocketChannel(payload: unknown): Promise<void> {
  await redis.publish(ALERT_CHANNEL, JSON.stringify(payload));
}
