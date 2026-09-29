/**
 * API 게이트웨이 (Phase 9, MSA 보강)
 *
 * 단순 웹훅 수신기가 아니라 "외부에서 들어오는 모든 요청의 단일 진입점"으로 둔다.
 * 트래픽 생성 에이전트를 포함해 외부 클라이언트는 이제 payment-api를 직접 호출하지 않고
 * 이 게이트웨이(/api/payments)를 거친다 - 라우팅/회복력 같은 공통 관심사를 한 곳에 모으기 위함.
 *
 * WebSocket 서버는 별도 프로세스로 분리하기로 했으므로(Phase 10에서 구축), 이 게이트웨이는
 * WebSocket과 직접 연결하지 않고 Redis Pub/Sub 채널로만 relay한다 - 소비자가 아직 없어도
 * 발행자(게이트웨이)와 구독자(WebSocket 서버)가 서로를 몰라도 되는 느슨한 결합 구조.
 */

import express from "express";
import { paymentBreaker } from "./paymentProxy.js";
import { relayAlertToWebSocketChannel } from "./webhookRelay.js";

const PORT = 8095;

const app = express();
app.use(express.json());

app.post("/api/payments", async (req, res) => {
  try {
    const result = await paymentBreaker.fire(req.body);
    res.status(result.status).json(result.data);
  } catch (err) {
    const e = err as Error & { status?: number; data?: unknown };
    res.status(e.status ?? 502).json({ error: e.message, ...(e.data ? { detail: e.data } : {}) });
  }
});

// n8n 등 외부에서 오는 webhook을 받아 WebSocket 서버가 구독할 Redis 채널로 relay
app.post("/webhook/alert-relay", async (req, res) => {
  await relayAlertToWebSocketChannel(req.body);
  res.status(200).json({ relayed: true });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", circuitState: paymentBreaker.opened ? "open" : "closed" });
});

app.listen(PORT, () => {
  console.log(`[게이트웨이 시작] 포트 ${PORT} (POST /api/payments, POST /webhook/alert-relay)`);
});
