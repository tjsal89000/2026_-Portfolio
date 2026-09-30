/**
 * 대시보드 WebSocket 서버 (Phase 10)
 *
 * Redis Pub/Sub 구독자 역할만 한다 - db-writer-consumer가 발행하는 "payment:events:live"
 * (개별 결제 이벤트)와 게이트웨이가 발행하는 "payment:alerts:live"(이상탐지 알림)를 구독해서
 * 연결된 모든 브라우저 클라이언트에게 그대로 브로드캐스트한다.
 *
 * 게이트웨이와 같은 프로세스로 합치지 않은 이유(Phase 9에서 결정): "요청 처리"(게이트웨이)와
 * "다수의 실시간 커넥션을 오래 물고 있는 것"(WebSocket)은 부하 특성이 다른 별개의 책임이라
 * 독립적으로 스케일/배포할 수 있게 분리하는 것이 실무에서도 흔한 방식.
 */

import http from "node:http";
import express from "express";
import { Redis } from "ioredis";
import { WebSocket, WebSocketServer } from "ws";
import { getLatestReports } from "./reports.js";
import { listEc2Instances, listPods } from "./infra.js";
import { getRecentPayments } from "./payments.js";

const PORT = 8096;

const app = express();

// 다른 세 엔드포인트와 달리 이 라우트만 try/catch가 없었던 게 실제 장애로 드러났다 - Postgres가
// 잠깐 죽었을 때 getLatestReports()가 던진 예외가 처리되지 않은 Promise 거부로 남아
// ws-server 프로세스 전체를 죽여버렸다(WebSocket 연결까지 전부 끊김).
// 응답 형태는 배열 그대로 유지한다 - 대시보드(OverviewPage.tsx)가 이 엔드포인트만큼은
// { reports: [...] } 래퍼 없이 배열을 바로 받는다고 가정하고 있어서, 에러 시에도 빈 배열을
// 반환해 타입을 그대로 맞춘다(다른 세 엔드포인트처럼 error 필드를 얹으면 프론트가 깨짐).
app.get("/reports/latest", async (req, res) => {
  const limit = Number(req.query.limit ?? 5);
  try {
    res.json(await getLatestReports(limit));
  } catch (err) {
    console.error("[/reports/latest] 조회 실패:", (err as Error).message);
    res.json([]);
  }
});

// "인프라 현황" 페이지가 쓰는 엔드포인트 - EC2/Pod 조회가 실패해도(로컬 개발 환경처럼
// 자격증명/클러스터가 없는 경우) 500으로 죽이지 않고 빈 배열 + 에러 메시지로 응답해서
// 대시보드 쪽은 "이 환경에서는 조회 불가"만 보여주면 되게 한다.
app.get("/infra/ec2", async (_req, res) => {
  try {
    res.json({ instances: await listEc2Instances() });
  } catch (err) {
    res.json({ instances: [], error: (err as Error).message });
  }
});

app.get("/payments/recent", async (req, res) => {
  const limit = Number(req.query.limit ?? 20);
  try {
    res.json({ payments: await getRecentPayments(limit) });
  } catch (err) {
    res.json({ payments: [], error: (err as Error).message });
  }
});

app.get("/infra/pods", async (_req, res) => {
  try {
    res.json({ pods: await listPods() });
  } catch (err) {
    res.json({ pods: [], error: (err as Error).message });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

function broadcast(message: unknown): void {
  const payload = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// k8s에서는 REDIS_HOST/REDIS_PORT 환경변수로 Redis Service 주소를 주입한다
const subscriber = new Redis({
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
});
subscriber.subscribe("payment:events:live", "payment:alerts:live");

subscriber.on("message", (channel, message) => {
  try {
    const data = JSON.parse(message);
    if (channel === "payment:events:live") {
      broadcast({ type: "payment", data });
    } else if (channel === "payment:alerts:live") {
      broadcast({ type: "alert", data });
    }
  } catch {
    // Redis 채널에 형식이 이상한 메시지가 오더라도 WebSocket 서버 전체가 죽으면 안 되므로 무시
  }
});

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "hello", data: { message: "connected" } }));
});

server.listen(PORT, () => {
  console.log(`[WebSocket 서버 시작] 포트 ${PORT} (GET /reports/latest, WS /ws)`);
});
