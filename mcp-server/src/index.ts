import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { getKafkaLag } from "./kafka.js";
import { getRealtimeMetrics } from "./redis.js";
import { getPaymentSummary, queryRecentPayments } from "./db.js";

// 이 서버가 노출하는 도구는 전부 읽기 전용(SELECT/조회)이다. 데이터를 바꾸는 도구는 없음 -
// 이상탐지/리포트 에이전트가 상태를 조회하는 용도로만 쓰이게 하기 위한 의도적인 제약이다.
//
// McpServer 인스턴스 하나는 transport 하나에만 connect()할 수 있다 (한 번 연결되면 그걸로 끝).
// 처음엔 이걸 모르고 전역 McpServer 하나를 여러 세션(클라이언트)이 공유하게 짰다가,
// 두 번째 클라이언트가 접속하자마자 "Already connected to a transport"로 터졌다.
// 그래서 세션(연결)마다 새 McpServer를 만들어주는 팩토리 함수로 바꿈.
function createServer(): McpServer {
  const server = new McpServer({ name: "payment-aiops-mcp-server", version: "1.0.0" });

  server.registerTool(
    "get_kafka_lag",
    {
      title: "Kafka Consumer Lag 조회",
      description:
        "payment.events 토픽에서 db-writer-consumer-group의 파티션별 처리 지연(lag)을 조회합니다. " +
        "lag이 계속 쌓이면 컨슈머가 트래픽을 못 따라가고 있다는 신호입니다.",
      inputSchema: {},
    },
    async () => {
      const result = await getKafkaLag();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "get_realtime_metrics",
    {
      title: "실시간 처리량/에러율 조회",
      description: "최근 N초간 결제 처리 건수, 에러 건수, 초당 처리량(TPS), 에러율을 조회합니다.",
      inputSchema: {
        windowSeconds: z
          .number()
          .int()
          .min(1)
          .max(300)
          .optional()
          .describe("조회할 최근 시간 범위(초). 기본 60초"),
      },
    },
    async ({ windowSeconds }) => {
      const result = await getRealtimeMetrics(windowSeconds ?? 60);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "query_recent_payments",
    {
      title: "최근 결제 내역 조회",
      description: "Postgres payments 테이블에서 최근 결제 내역을 시간 역순으로 조회합니다 (읽기 전용).",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe("조회할 최대 건수. 기본 20"),
        accountId: z.string().optional().describe("특정 계좌 ID로 필터링"),
        country: z.string().length(2).optional().describe("국가 코드(2자리)로 필터링, 예: KR"),
      },
    },
    async ({ limit, accountId, country }) => {
      const rows = await queryRecentPayments(limit ?? 20, accountId, country);
      return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
    }
  );

  server.registerTool(
    "get_payment_summary",
    {
      title: "결제 통계 요약",
      description: "전체 결제 건수/총액과 국가별·결제수단별 집계를 조회합니다.",
      inputSchema: {},
    },
    async () => {
      const result = await getPaymentSummary();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  return server;
}

const app = express();
app.use(express.json());

// MCP는 세션 기반으로 동작한다 - 클라이언트가 처음 연결(initialize)하면 세션 ID를 발급받고,
// 이후 요청마다 그 세션 ID를 헤더에 실어 보내서 "같은 대화의 연속"임을 증명한다.
const transports = new Map<string, StreamableHTTPServerTransport>();

app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports.has(sessionId)) {
    transport = transports.get(sessionId)!;
  } else if (!sessionId && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        transports.set(id, transport);
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) transports.delete(transport.sessionId);
    };
    const server = createServer();
    await server.connect(transport);
  } else {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "잘못된 요청: 세션 ID가 없거나 초기화 요청이 아닙니다" },
      id: null,
    });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).send("유효하지 않은 세션입니다");
    return;
  }
  await transports.get(sessionId)!.handleRequest(req, res);
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 8090;
app.listen(PORT, () => {
  console.log(`MCP 서버 기동됨: http://localhost:${PORT}/mcp`);
});
