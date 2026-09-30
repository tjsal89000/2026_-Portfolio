import { Box, Chip, Paper, Tooltip, Toolbar, Typography } from "@mui/material";
import { TOPOLOGY, type Tech } from "../data/infraTopology";
import MermaidDiagram from "../components/MermaidDiagram";

const TECH_COLOR: Record<Tech, "warning" | "info" | "success" | "default"> = {
  Java: "warning",
  TypeScript: "info",
  Python: "success",
  Infra: "default",
};

// README.md "## 아키텍처"의 mermaid 다이어그램과 동일한 소스 - 결제 요청이 실제로
// 어떤 컴포넌트를 거쳐 흐르는지(점선 화살표는 "직접 호출"이 아니라 도구/조회 관계).
// 이중 소스라 README를 바꾸면 여기도 같이 갱신해야 함 - phases.ts/testSuites.ts와 같은 이유로
// 자동 동기화하지 않음(자주 안 바뀌는 정의라 사람이 한 번 갱신하는 게 더 단순하고 정직함).
const FLOW_DEFINITION = `flowchart TD
    TG["트래픽 생성 에이전트<br/>(Python)"] -->|"POST /api/payments"| GW["API 게이트웨이 (TS)<br/>opossum 서킷브레이커"]
    GW --> API["결제 API (Java)<br/>Kafka Producer"]
    API -->|publish| KAFKA[("Kafka<br/>payment.events")]
    KAFKA --> DBW["DB Writer Consumer (Java)<br/>멱등성 저장"]
    DBW --> DB[("PostgreSQL")]
    DBW -->|"카운터 갱신 + Pub/Sub"| REDIS[("Redis")]

    KAFKA -->|직접 구독| AD["이상탐지 에이전트 (Python)"]
    REDIS -->|임계치 조회| AD
    AD -->|webhook| N8N["n8n"] --> SLACK["Slack"]

    MCP["MCP 서버 (TS)<br/>Kafka/Redis/Postgres 조회 도구"]
    KAFKA -.도구.-> MCP
    REDIS -.도구.-> MCP
    DB -.도구.-> MCP
    MCP -.tool calling.-> RPT["AI 리포트 에이전트 (Python)<br/>Gemini"]
    N8N -->|스케줄 트리거| RPT
    RPT -->|저장| DB

    GW -->|alert-relay| REDIS
    REDIS -->|Pub/Sub| WS["WebSocket 서버 (TS)"]
    WS --> WEB["웹 대시보드 (React)"]
    MCP -.조회.-> WEB`;

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
          왜 떠 있고 서로 어떻게 연결되는지를 보여준다.
        </Typography>

        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, mb: 3 }}>
          <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 700 }}>
            데이터 흐름
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            결제 요청 하나가 실제로 거치는 경로. 실선은 직접 호출/이벤트, 점선은 도구
            호출·조회 관계(MCP 서버가 여러 데이터소스를 다른 에이전트에게 중개하는 것).
          </Typography>
          <MermaidDiagram definition={FLOW_DEFINITION} />
        </Paper>

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
      </Box>
    </>
  );
}
