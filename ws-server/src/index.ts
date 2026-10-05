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
import { getCiRuns, getRecentTraces, getSlo, getTrace } from "./ops.js";
import { ensureAlertTable, getTimeline, saveAlert } from "./incidents.js";
import { getCostSummary } from "./cost.js";

const REPORT_GENERATE_URL = process.env.REPORT_GENERATE_URL ?? "http://report-agent:8092/generate";
import { checkPassword, chaosStatus, pauseConsumer, startBurst } from "./chaos.js";

const PORT = 8096;

const app = express();
app.use(express.json());

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

// "운영 지표" 페이지: SLO(Prometheus), CI 상태(GitHub Actions), 결제 trace(Tempo).
// 세 곳 중 하나가 죽어 있어도 나머지는 보여야 하니, 각 라우트가 독립적으로 실패를 흡수한다.
app.get("/ops/slo", async (_req, res) => {
  try {
    res.json(await getSlo());
  } catch (err) {
    res.json({ error: (err as Error).message });
  }
});

app.get("/ops/ci", async (_req, res) => {
  try {
    res.json({ runs: await getCiRuns() });
  } catch (err) {
    res.json({ runs: [], error: (err as Error).message });
  }
});

app.get("/ops/traces", async (_req, res) => {
  try {
    res.json({ traces: await getRecentTraces() });
  } catch (err) {
    res.json({ traces: [], error: (err as Error).message });
  }
});

// 비용 패널: Cost Explorer 권한이 아직 반영되지 않았거나 집계 전이면 error 메시지로 알려주고 화면은 유지한다
app.get("/ops/cost", async (_req, res) => {
  try {
    res.json(await getCostSummary());
  } catch (err) {
    res.json({ error: (err as Error).message });
  }
});

app.get("/ops/timeline", async (_req, res) => {
  try {
    res.json({ events: await getTimeline() });
  } catch (err) {
    res.json({ events: [], error: (err as Error).message });
  }
});

// 장애 주입은 CHAOS_ENABLED=true일 때만 동작한다. 꺼져 있으면 status만 enabled:false로 응답하고, 대시보드는 버튼을 숨긴다.
app.get("/ops/chaos/status", (_req, res) => {
  res.json(chaosStatus());
});

// 공개 대시보드에서 누구나 버튼은 보지만, 실행은 비밀번호가 맞아야 한다. 비밀번호는 본문(JSON)으로만 받는다
// (URL에 넣으면 nginx 접근 로그에 그대로 남기 때문).
// 비밀번호가 맞지 않으면 응답을 보내고 false를 돌려준다. 장애 주입 두 종류(트래픽·소비 지연)가 같은 규칙을 쓴다.
function rejectUnlessAuthorized(req: express.Request, res: express.Response, requireEnabled = true): boolean {
  const check = checkPassword(req.body?.password, requireEnabled);
  if (check === "ok") return true;
  if (check === "disabled") {
    res.status(404).json({ started: false, reason: "장애 주입이 꺼져 있습니다" });
  } else if (check === "locked") {
    res.status(429).json({ started: false, reason: "틀린 입력이 많아 10분간 잠겼습니다. 잠시 후 다시 시도해 주세요" });
  } else {
    res.status(403).json({ started: false, reason: "비밀번호가 맞지 않습니다" });
  }
  return false;
}

app.post("/ops/chaos/burst", (req, res) => {
  if (!rejectUnlessAuthorized(req, res)) return;
  res.json(startBurst(Number(req.body?.tps ?? 30), Number(req.body?.seconds ?? 30)));
});

// AI 리포트 생성은 Gemini 호출이 들어가서 누구나 누르면 한도와 비용이 샌다. 장애 주입과 같은 비밀번호로 막는다.
// 장애 주입 스위치(CHAOS_ENABLED)와는 무관하게 동작하도록 requireEnabled=false로 검사한다.
app.post("/ops/report/generate", async (req, res) => {
  if (!rejectUnlessAuthorized(req, res, false)) return;
  try {
    const upstream = await fetch(REPORT_GENERATE_URL, { method: "POST" });
    const text = await upstream.text();
    res.status(upstream.status).type("application/json").send(text || "{}");
  } catch {
    res.status(502).json({ started: false, reason: "리포트 에이전트에 연결하지 못했습니다" });
  }
});

app.post("/ops/chaos/lag", async (req, res) => {
  if (!rejectUnlessAuthorized(req, res)) return;
  try {
    res.json(await pauseConsumer(Number(req.body?.seconds ?? 30)));
  } catch {
    res.status(502).json({ started: false, reason: "consumer에 연결하지 못했습니다" });
  }
});

app.get("/ops/traces/:id", async (req, res) => {
  try {
    res.json({ spans: await getTrace(req.params.id) });
  } catch (err) {
    res.json({ spans: [], error: (err as Error).message });
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
      // 타임라인용 저장은 실시간 전송과 별개로 실패해도 브로드캐스트에 영향이 없게 따로 처리
      saveAlert(data).catch((err) => console.error("[알림 저장 실패]", (err as Error).message));
    }
  } catch {
    // Redis 채널에 형식이 이상한 메시지가 오더라도 WebSocket 서버 전체가 죽으면 안 되므로 무시
  }
});

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "hello", data: { message: "connected" } }));
});

// 테이블이 없으면 만든다. 실패해도 WebSocket과 나머지 API는 계속 동작해야 하므로 프로세스를 죽이지 않는다
ensureAlertTable().catch((err) => console.error("[alert_log 준비 실패]", (err as Error).message));

server.listen(PORT, () => {
  console.log(`[WebSocket 서버 시작] 포트 ${PORT} (GET /reports/latest, WS /ws)`);
});
