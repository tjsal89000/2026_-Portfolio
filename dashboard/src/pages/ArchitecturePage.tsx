import { Box, Chip, Paper, Tooltip, Toolbar, Typography } from "@mui/material";
import { TOPOLOGY, type Tech } from "../data/infraTopology";
import FlowDiagram, { type FlowEdge, type FlowNode } from "../components/FlowDiagram";
import CloudComparison from "../components/CloudComparison";

const TECH_COLOR: Record<Tech, "warning" | "info" | "success" | "default"> = {
  Java: "warning",
  TypeScript: "info",
  Python: "success",
  Infra: "default",
};

const LEGEND = [
  { label: "Java", fill: "#FFF3E0", text: "#E65100" },
  { label: "TypeScript", fill: "#E3F2FD", text: "#0D47A1" },
  { label: "Python", fill: "#E8F5E9", text: "#1B5E20" },
  { label: "인프라 / 외부 연동", fill: "#F3E5F5", text: "#4A148C" },
];

// README.md "## 아키텍처"의 mermaid 다이어그램과 같은 관계를 담고 있지만, 좌표를 전부 직접
// 계산해서 겹치거나 꼬이는 선이 없게 짰다 - "결제가 실제로 처리되는 흐름"과 "그 결과를
// 조회/분석하는 흐름" 두 개로 쪼갠 것도 mermaid 시절과 같은 이유(허브 노드가 많으면 한
// 그림에 다 넣기엔 복잡함). 이중 소스라 README를 바꾸면 여기도 같이 갱신해야 함 -
// phases.ts/testSuites.ts와 같은 이유로 자동 동기화하지 않음.
//
// 격자 규칙: 같은 행(row)에 있으면 가로선, 같은 열(col)에 있으면 세로선만 쓰고, 그마저도
// 안 되는 경우(허브로 모이는 화살표)만 옆 열 사이 빈 공간을 거쳐가는 꺾은선을 쓴다 -
// 이렇게 하면 두 화살표가 서로를 가로지를 일이 없다는 걸 좌표만 보고 확인할 수 있다.
//
// 툴팁: "무슨 역할 + 어떤 포트/이미지 + 왜 이 기술을 골랐는지"를 한 번에 보여준다.
// 두 다이어그램에 같은 컴포넌트(Kafka/Redis/PostgreSQL/n8n)가 겹쳐 나오므로 하나로 모아둠 -
// 포트/이미지는 k8s/*.yaml 그대로, "왜" 부분은 README.md 기술 스택 표의 근거(ADR 번호)와 동일.
const TOOLTIPS: Record<string, string> = {
  TG: "정상 + 이상 패턴(반복요청/고액이상치/쏠림) 결제 트래픽을 자동 생성. Python을 쓴 이유: 나머지 에이전트와 데이터 처리 생태계를 통일 (ADR-1)",
  GW: "외부 요청의 단일 진입점, opossum 서킷브레이커로 payment-api 프록시 (포트 8095). TypeScript를 쓴 이유: 비동기 I/O 중심 프록시 처리에 적합 (ADR-1, ADR-8)",
  API: "결제 요청 접수·검증 후 Kafka로 발행, Resilience4j Retry/CircuitBreaker 적용 (포트 8080). Java를 쓴 이유: 강타입·트랜잭션 안정성이 필요한 핵심 로직 (ADR-1)",
  KAFKA: "payment.events 토픽 - 결제 이벤트의 source of truth, 단일 브로커 KRaft 모드 (apache/kafka:3.8.0, 포트 9092). Kafka를 쓴 이유: 내구성 있는 이벤트 로그가 필요해서 (ADR-2)",
  DBW: "Kafka 이벤트를 멱등성 있게 Postgres에 저장하고 Redis 카운터를 갱신 (포트 8081). Java를 쓴 이유: DB 트랜잭션·멱등성 처리의 안정성 (ADR-1)",
  DB: "결제 내역과 AI 리포트를 영구 저장 (postgres:16, 포트 5432). RDS 대신 컨테이너로 직접 운영 (ADR-4)",
  AD: "Redis 임계치 + Kafka 콘텐츠 기반 이상탐지, n8n webhook으로 알림 (제어 API 포트 8091). Python을 쓴 이유: redis.asyncio/aiokafka 등 비동기 데이터 처리 생태계 (ADR-1)",
  REDIS: "초단위 버킷 카운터(실시간 집계) + Pub/Sub(실시간 상태 전파) (redis:7, 포트 6379). Redis를 쓴 이유: Kafka와 역할을 분리해 '지금 상태'만 빠르게 (ADR-2)",
  N8N: "이상탐지 Slack 알림 워크플로우 + 리포트 에이전트 스케줄 트리거 (n8nio/n8n, 포트 5678). 코드 작성 없이 알림/스케줄 워크플로우를 조립하기 위한 자동화 도구",
  SLACK: "이상탐지 알림이 최종적으로 도착하는 외부 서비스 (n8n webhook 경유)",
  RPT: "MCP 도구 호출(tool calling) + Gemini로 운영 리포트를 생성해 Postgres에 저장 (제어 API 포트 8092). Python을 쓴 이유: Gemini/MCP SDK 생태계 (ADR-1, ADR-7)",
  MCP: "Kafka/Redis/Postgres 조회 도구 4종을 MCP로 노출, 읽기 전용 (포트 8090). TypeScript를 쓴 이유: 여러 에이전트가 재사용할 도구 계층을 표준 프로토콜로 노출하기 좋아서 (ADR-9)",
  WS: "Redis Pub/Sub을 구독해 WebSocket으로 대시보드에 실시간 브로드캐스트 (포트 8096). TypeScript를 쓴 이유: 다수의 실시간 커넥션을 오래 유지하는 비동기 I/O에 적합 (ADR-8)",
  WEB: "지금 보고 있는 이 화면 자체 (React, nginx로 정적 서빙). TypeScript를 쓴 이유: 프론트엔드 표준 스택",
};

const PAYMENT_NODES: FlowNode[] = [
  { id: "TG", label: "트래픽 생성\n에이전트", category: "python", col: 0, row: 0, tooltip: TOOLTIPS.TG },
  { id: "GW", label: "API 게이트웨이", category: "ts", col: 0, row: 1, tooltip: TOOLTIPS.GW },
  { id: "API", label: "결제 API", category: "java", col: 0, row: 2, tooltip: TOOLTIPS.API },
  { id: "KAFKA", label: "Kafka", category: "ext", col: 0, row: 3, tooltip: TOOLTIPS.KAFKA },
  { id: "DBW", label: "DB Writer\nConsumer", category: "java", col: 0, row: 4, tooltip: TOOLTIPS.DBW },
  { id: "DB", label: "PostgreSQL", category: "ext", col: 0, row: 5, tooltip: TOOLTIPS.DB },
  { id: "AD", label: "이상탐지\n에이전트", category: "python", col: 1, row: 3, tooltip: TOOLTIPS.AD },
  { id: "REDIS", label: "Redis", category: "ext", col: 1, row: 4, tooltip: TOOLTIPS.REDIS },
  { id: "N8N", label: "n8n", category: "ext", col: 2, row: 3, tooltip: TOOLTIPS.N8N },
  { id: "SLACK", label: "Slack", category: "ext", col: 2, row: 4, tooltip: TOOLTIPS.SLACK },
];

const PAYMENT_EDGES: FlowEdge[] = [
  { from: "TG", to: "GW", label: "POST /api/payments" },
  { from: "GW", to: "API" },
  { from: "API", to: "KAFKA", label: "publish" },
  { from: "KAFKA", to: "DBW" },
  { from: "DBW", to: "DB" },
  { from: "KAFKA", to: "AD", label: "직접 구독" },
  { from: "DBW", to: "REDIS", label: "카운터 갱신" },
  { from: "REDIS", to: "AD", label: "임계치 조회" },
  { from: "AD", to: "N8N", label: "webhook" },
  { from: "N8N", to: "SLACK" },
];

const ANALYTICS_NODES: FlowNode[] = [
  { id: "KAFKA", label: "Kafka", category: "ext", col: 0, row: 0, tooltip: TOOLTIPS.KAFKA },
  { id: "N8N", label: "n8n", category: "ext", col: 1, row: 0, tooltip: TOOLTIPS.N8N },
  { id: "RPT", label: "AI 리포트\n에이전트", category: "python", col: 2, row: 0, tooltip: TOOLTIPS.RPT },
  { id: "REDIS", label: "Redis", category: "ext", col: 0, row: 1, tooltip: TOOLTIPS.REDIS },
  { id: "MCP", label: "MCP 서버", category: "ts", col: 1, row: 1, tooltip: TOOLTIPS.MCP },
  { id: "DB", label: "PostgreSQL", category: "ext", col: 0, row: 2, tooltip: TOOLTIPS.DB },
  { id: "WS", label: "WebSocket\n서버", category: "ts", col: 1, row: 2, tooltip: TOOLTIPS.WS },
  { id: "WEB", label: "웹 대시보드", category: "ts", col: 2, row: 2, tooltip: TOOLTIPS.WEB },
];

// MCP로 모이는 입력 3개/나가는 출력 2개는 전부 같은 변에서 만나므로, 겹치지 않게
// toOffset/fromOffset으로 진입 높이를 살짝씩 벌려준다.
const ANALYTICS_EDGES: FlowEdge[] = [
  { from: "KAFKA", to: "MCP", label: "도구", dashed: true, toOffset: -12 },
  { from: "REDIS", to: "MCP", label: "도구", dashed: true },
  { from: "DB", to: "MCP", label: "도구", dashed: true, toOffset: 12 },
  { from: "MCP", to: "RPT", label: "tool calling", dashed: true, fromOffset: -10 },
  { from: "N8N", to: "RPT", label: "스케줄 트리거" },
  { from: "REDIS", to: "WS", label: "Pub/Sub" },
  { from: "WS", to: "WEB" },
  { from: "MCP", to: "WEB", label: "조회", dashed: true, fromOffset: 10 },
  {
    // 리포트 저장(RPT -> DB)은 격자 규칙을 벗어나는 유일한 "되돌아가는" 화살표라, 아래
    // 빈 공간(4번째 행)을 거쳐 우회하도록 경유점을 직접 지정 - 다른 선과 절대 안 겹침.
    from: "RPT",
    to: "DB",
    label: "저장",
    // FlowDiagram 기본값(nodeWidth 130 / colGap 70 / rowGap 34) 기준 좌표. RPT 바로 밑이
    // WEB 박스라(둘 다 2열) 곧장 아래로 내려가면 WEB을 가로지르므로, RPT 오른쪽 바깥으로
    // 나간 뒤 맨 아래 빈 공간을 거쳐 DB 바닥으로 들어가도록 완전히 우회시킴.
    waypoints: [
      { x: 530, y: 25 },
      { x: 550, y: 25 },
      { x: 550, y: 260 },
      { x: 65, y: 260 },
      { x: 65, y: 218 },
    ],
  },
];

export default function ArchitecturePage() {
  const totalCount = TOPOLOGY.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <>
      <Toolbar />
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          인프라 구성도
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          지금 EC2 위에 실제로 떠 있는 컨테이너 {totalCount}개 (k8s/*.yaml 기준). "인프라 현황"
          메뉴가 이것들의 실시간 상태(러닝 여부·재시작 횟수)를 보여준다면, 여기는 애초에 뭐가
          왜 떠 있고 서로 어떻게 연결되는지를 보여준다. 박스에 마우스를 올리면 역할·포트·왜 이
          기술을 골랐는지가 나온다.
        </Typography>

        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 3 }}>
          {LEGEND.map((item) => (
            <Chip key={item.label} size="small" label={item.label} sx={{ bgcolor: item.fill, color: item.text }} />
          ))}
        </Box>

        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, mb: 3 }}>
          <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 700 }}>
            ① 결제 처리 흐름
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            결제 요청 하나가 접수돼 저장되고, 이상탐지까지 이어지는 실시간 경로.
          </Typography>
          <FlowDiagram nodes={PAYMENT_NODES} edges={PAYMENT_EDGES} />
        </Paper>

        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, mb: 3 }}>
          <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 700 }}>
            ② 조회 · 분석 흐름
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            쌓인 데이터를 MCP 서버가 도구로 노출하고, AI 리포트와 대시보드가 그걸 조회/구독하는
            경로 (점선 = 도구 호출·조회, 실선 = 이벤트/트리거).
          </Typography>
          <FlowDiagram nodes={ANALYTICS_NODES} edges={ANALYTICS_EDGES} />
        </Paper>

        <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 700 }}>
          ③ 전체 컨테이너 목록
        </Typography>
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="overline" color="text.secondary">
            EC2 인스턴스 (Terraform 프로비저닝, t3.large)
          </Typography>

          <Paper
            variant="outlined"
            sx={{
              p: { xs: 2, sm: 3 },
              mt: 1.5,
              bgcolor: (t) => (t.palette.mode === "dark" ? "rgba(255,255,255,0.02)" : "#FAFAFA"),
            }}
          >
            <Typography variant="overline" color="text.secondary">
              k3s 클러스터 (단일 노드, Docker 런타임)
            </Typography>

            <Box sx={{ mt: 1.5, display: "flex", flexDirection: "column", gap: 3 }}>
              {TOPOLOGY.map((group) => (
                <Box key={group.title}>
                  <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                    {group.title}
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.25 }}>
                    {group.items.map((item) => (
                      <Tooltip key={item.name} title={item.description} arrow placement="top">
                        <Box
                          sx={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-start",
                            gap: 0.5,
                            px: 1.5,
                            py: 1,
                            minWidth: 140,
                            border: (t) => `1px solid ${t.palette.divider}`,
                            borderRadius: 1,
                            bgcolor: "background.paper",
                            cursor: "help",
                            "&:hover": {
                              borderColor: "primary.main",
                            },
                          }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {item.name}
                          </Typography>
                          <Chip size="small" label={item.tech} color={TECH_COLOR[item.tech]} variant="outlined" />
                        </Box>
                      </Tooltip>
                    ))}
                  </Box>
                </Box>
              ))}
            </Box>
          </Paper>
        </Paper>
        <CloudComparison />
      </Box>
    </>
  );
}
