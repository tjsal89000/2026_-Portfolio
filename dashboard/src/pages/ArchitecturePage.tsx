import { Box, Chip, Paper, Tooltip, Toolbar, Typography } from "@mui/material";
import { TOPOLOGY, type Tech } from "../data/infraTopology";
import MermaidDiagram from "../components/MermaidDiagram";

const TECH_COLOR: Record<Tech, "warning" | "info" | "success" | "default"> = {
  Java: "warning",
  TypeScript: "info",
  Python: "success",
  Infra: "default",
};

// README.md "## 아키텍처"의 mermaid 다이어그램과 같은 관계를 담고 있지만, 노드 16개를 한
// 다이어그램에 다 넣으면(특히 MCP가 3곳에서 읽어 2곳으로 내보내는 허브라) 자동 배치가
// 복잡해지므로 "결제가 실제로 처리되는 흐름"과 "그 결과를 조회/분석하는 흐름" 두 개로
// 쪼갰다. 이중 소스라 README를 바꾸면 여기도 같이 갱신해야 함 - phases.ts/testSuites.ts와
// 같은 이유로 자동 동기화하지 않음(자주 안 바뀌는 정의라 사람이 한 번 갱신하는 게 더 단순함).
//
// 카테고리별 색은 아래 "전체 컨테이너 목록" 섹션의 배지 색과 맞춘다: Java=주황, TS=파랑,
// Python=초록, 외부/인프라=보라. classDef에 색을 직접 박아두면 라이트/다크 모드 어느
// 배경에서도(옅은 채움 + 진한 글자) 항상 또렷하게 읽히므로, 모드별로 다시 계산할 필요가 없다.
const CLASS_DEFS = `
    classDef java fill:#FFF3E0,stroke:#EF6C00,color:#E65100
    classDef ts fill:#E3F2FD,stroke:#1565C0,color:#0D47A1
    classDef python fill:#E8F5E9,stroke:#2E7D32,color:#1B5E20
    classDef ext fill:#F3E5F5,stroke:#7B1FA2,color:#4A148C`;

const PAYMENT_FLOW_DEFINITION = `flowchart TD
    TG["트래픽 생성 에이전트"] -->|"POST /api/payments"| GW["API 게이트웨이"]
    GW --> API["결제 API"]
    API -->|publish| KAFKA[("Kafka")]
    KAFKA --> DBW["DB Writer Consumer"]
    DBW --> DB[("PostgreSQL")]
    DBW --> REDIS[("Redis")]
    KAFKA --> AD["이상탐지 에이전트"]
    REDIS --> AD
    AD -->|webhook| N8N["n8n"]
    N8N --> SLACK["Slack"]
${CLASS_DEFS}
    class TG,AD python
    class GW,DBW ts
    class API java
    class KAFKA,DB,REDIS,N8N,SLACK ext`;

const LEGEND = [
  { label: "Java", fill: "#FFF3E0", text: "#E65100" },
  { label: "TypeScript", fill: "#E3F2FD", text: "#0D47A1" },
  { label: "Python", fill: "#E8F5E9", text: "#1B5E20" },
  { label: "인프라 / 외부 연동", fill: "#F3E5F5", text: "#4A148C" },
];

const ANALYTICS_FLOW_DEFINITION = `flowchart LR
    KAFKA[("Kafka")] -.도구.-> MCP["MCP 서버"]
    REDIS[("Redis")] -.도구.-> MCP
    DB[("PostgreSQL")] -.도구.-> MCP
    MCP -.tool calling.-> RPT["AI 리포트 에이전트"]
    N8N["n8n"] -->|스케줄 트리거| RPT
    RPT -->|저장| DB
    REDIS -->|Pub/Sub| WS["WebSocket 서버"]
    WS --> WEB["웹 대시보드"]
    MCP -.조회.-> WEB
${CLASS_DEFS}
    class RPT python
    class MCP,WS,WEB ts
    class KAFKA,REDIS,DB,N8N ext`;

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
          <MermaidDiagram definition={PAYMENT_FLOW_DEFINITION} />
        </Paper>

        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, mb: 3 }}>
          <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 700 }}>
            ② 조회 · 분석 흐름
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            쌓인 데이터를 MCP 서버가 도구로 노출하고, AI 리포트와 대시보드가 그걸 조회/구독하는
            경로 (점선 = 도구 호출·조회, 실선 = 이벤트/트리거).
          </Typography>
          <MermaidDiagram definition={ANALYTICS_FLOW_DEFINITION} />
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
      </Box>
    </>
  );
}
