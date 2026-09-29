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

const PORT = 8096;

const app = express();

app.get("/reports/latest", async (req, res) => {
  const limit = Number(req.query.limit ?? 5);
  const reports = await getLatestReports(limit);
  res.json(reports);
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
