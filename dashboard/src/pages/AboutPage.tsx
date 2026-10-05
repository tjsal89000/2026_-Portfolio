import { Box, Chip, Grid, Paper, Step, StepLabel, Stepper, Toolbar, Typography } from "@mui/material";
import type { ViewKey } from "../viewKey";

// 소개 화면. 방문자가 "이 웹이 무엇을 보여주는 곳인지"를 한 번에 파악하도록, 각 메뉴의 역할과 데이터 흐름을 정리한다.
// 수치와 설명은 실제 구현과 측정 결과에서 가져온 것만 적는다.

const FLOW = [
  { title: "트래픽 생성", desc: "가상 결제 요청을 초당 수 건씩 만든다. 정상 요청과 이상 패턴(고액, 반복, 쏠림)을 섞는다." },
  { title: "결제 API → Kafka", desc: "게이트웨이를 거쳐 결제 API가 요청을 검증하고 Kafka 토픽에 발행한다." },
  { title: "DB 저장", desc: "Kafka를 읽는 컨슈머가 중복 없이(멱등) Postgres에 저장하고, 실시간 카운터를 Redis에 갱신한다." },
  { title: "이상탐지", desc: "Redis 임계치와 이벤트 내용으로 이상 패턴을 찾아 알림을 보낸다." },
  { title: "n8n 중계", desc: "알림은 비밀 헤더로 보호된 n8n 웹훅을 거쳐 게이트웨이로 전달되고, 대시보드와 타임라인에 나타난다." },
  { title: "AI 리포트", desc: "Gemini가 MCP 도구로 Kafka·Redis·Postgres를 직접 조회해 운영 리포트를 작성한다." },
];

const MENUS: { label: string; view: ViewKey; desc: string }[] = [
  { label: "소개", view: "about", desc: "지금 보고 있는 화면. 이 웹의 목적과 구성을 요약한다." },
  { label: "실시간 모니터링", view: "overview", desc: "TPS, 에러율, Kafka Lag, 알림, AI 리포트를 실시간으로 본다. 상단에서 장애 주입 시연도 할 수 있다." },
  { label: "운영 지표", view: "ops", desc: "SLO와 에러 예산, CI 빌드, 결제 요청 trace, AWS 비용, 인시던트 타임라인, 부하 테스트 결과를 본다." },
  { label: "진행 상황", view: "progress", desc: "Phase별 개발 진행 상태와 남은 보완점." },
  { label: "테스트 코드", view: "tests", desc: "9개 서비스의 테스트 파일과 개수, GitHub 링크." },
  { label: "인프라 현황", view: "infra", desc: "EC2 인스턴스와 Kubernetes Pod 상태." },
  { label: "인프라 구성도", view: "architecture", desc: "데이터 흐름 다이어그램, 컴포넌트 설명, 인프라 선택 비교." },
  { label: "트러블슈팅", view: "troubleshooting", desc: "실제로 겪은 문제와 해결 과정을 STAR 형식으로 기록." },
];

// 실제로 구현하고 확인한 것만 강점으로 적는다. 한계도 같이 밝힌다.
const STRENGTHS: { title: string; points: string[] }[] = [
  {
    title: "측정으로 판단한다",
    points: [
      "부하 테스트를 구간별 2분씩 독립 측정해서, 단일 노드의 안정 한계를 65~70 TPS(p95 500ms 기준)로 확인했다.",
      "짧은 샘플의 555ms가 2분 재측정에서 191ms로 달라진 것을 보고, 짧은 샘플을 믿지 않는 기준을 세웠다.",
      "SLO와 에러 예산을 계산해서 '목표를 지키고 있는가'를 숫자로 보여준다.",
    ],
  },
  {
    title: "장애를 직접 재현해서 본다",
    points: [
      "Kafka 소비 지연을 주입해서 Consumer Lag이 올라갔다가 0으로 돌아오는 과정을 화면에서 볼 수 있다.",
      "consumer 그룹이 잘못 바뀌어 과거 메시지를 다시 읽던 문제를 찾아 원인을 분석하고 고쳤다. 중복은 멱등 처리로 DB에 들어가지 않았다.",
      "장애 시연 버튼은 시간, TPS, 쿨다운으로 제한해서 누가 눌러도 시스템이 연속으로 흔들리지 않게 했다.",
    ],
  },
  {
    title: "보안을 설계에 넣는다",
    points: [
      "공개 웹훅은 비밀 헤더가 맞을 때만 알림을 중계한다. 비밀값은 Kubernetes Secret에만 있고 저장소에는 없다.",
      "AI 리포트는 Gemini 무료 한도를 지키려고 서버에서 5분에 한 번만 생성되게 제한했다.",
      "장애 주입 기능은 설정 스위치 하나로 끌 수 있다.",
    ],
  },
  {
    title: "비용을 의식한다",
    points: [
      "Spot 인스턴스로 운영하고, 회수 시 대기 인스턴스로 넘어가는 자동 전환 경로를 만들었다 (실측 검증은 아직).",
      "Cost Explorer는 조회당 과금이 있어서 1시간 캐시로 호출을 줄였다. 권한도 조회 전용으로 최소화했다.",
      "오라클 무료 인스턴스와 EKS를 검토하고, 규모에 맞지 않아 택하지 않은 이유를 기록했다.",
    ],
  },
  {
    title: "자동화된 흐름",
    points: [
      "이상탐지 알림은 n8n 워크플로우를 거쳐 중계되고, 화면에서 'n8n 경유' 여부를 확인할 수 있다.",
      "AI 리포트는 LLM이 MCP 도구를 직접 호출해서 데이터를 조회한 뒤 작성한다.",
      "GitHub Actions가 push마다 서비스 테스트를 돌리고, 부하 테스트도 버튼 하나로 실행한다.",
    ],
  },
  {
    title: "기록으로 설명한다",
    points: [
      "설계 결정 10건(ADR)과 실제로 겪은 문제 12건(STAR 형식)을 남겼다. 왜 그렇게 했는지를 설명할 수 있게 하는 것이 목적이다.",
      "진행 상황과 남은 보완점을 화면에 공개해서, 무엇이 끝났고 무엇이 남았는지 숨기지 않는다.",
    ],
  },
];

const FLOW_ACTIVE = -1;

const STACK = ["Java 17 · Spring Boot", "Python · 에이전트", "TypeScript · Node.js · React", "Kafka", "Redis", "PostgreSQL", "Prometheus · Grafana · Tempo", "n8n", "Gemini · MCP", "k3s · Docker", "Terraform · AWS"];

export default function AboutPage() {
  return (
    <>
      <Toolbar />
      <Box sx={{ p: 3, maxWidth: 1100 }}>
        <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
            결제 AIOps 관제
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            가상의 결제 서비스에 트래픽을 흘려보내고, 이상 징후를 자동으로 찾아 알리고, AI가 운영 리포트를 쓰고, 그 과정을
            한 화면에서 볼 수 있게 만든 <b>포트폴리오 데모</b>입니다. 운영하는 서비스를 "돌아가게 만드는 것"에서 끝내지 않고,
            목표를 지키는지·문제가 생기면 어디서 느려지는지를 숫자로 확인할 수 있게 하는 것이 목적입니다.
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            <Chip size="small" color="primary" variant="outlined" label="합성 데이터 (실제 결제 아님)" />
            <Chip size="small" variant="outlined" label="단일 노드 AWS 데모" />
            <Chip size="small" variant="outlined" label="공개 저장소에 전체 코드" />
          </Box>
        </Paper>

        <Typography variant="h6" sx={{ mb: 1 }}>
          핵심 강점
        </Typography>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {STRENGTHS.map((s) => (
            <Grid key={s.title} size={{ xs: 12, md: 6 }}>
              <Paper variant="outlined" sx={{ p: 2.5, height: "100%" }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                  {s.title}
                </Typography>
                <Box component="ul" sx={{ pl: 2.5, m: 0 }}>
                  {s.points.map((p) => (
                    <li key={p}>
                      <Typography variant="body2" color="text.secondary">
                        {p}
                      </Typography>
                    </li>
                  ))}
                </Box>
              </Paper>
            </Grid>
          ))}
        </Grid>

        <Typography variant="h6" sx={{ mb: 1 }}>
          데이터 흐름
        </Typography>
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Stepper orientation="vertical" activeStep={FLOW_ACTIVE}>
            {FLOW.map((step) => (
              <Step key={step.title} active>
                <StepLabel>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {step.title}
                  </Typography>
                </StepLabel>
                <Typography variant="body2" color="text.secondary" sx={{ pl: 4, pb: 1.5 }}>
                  {step.desc}
                </Typography>
              </Step>
            ))}
          </Stepper>
        </Paper>

        <Typography variant="h6" sx={{ mb: 1 }}>
          메뉴 안내
        </Typography>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {MENUS.map((m) => (
            <Grid key={m.view} size={{ xs: 12, sm: 6 }}>
              <Paper variant="outlined" sx={{ p: 2, height: "100%" }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {m.label}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {m.desc}
                </Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>

        <Typography variant="h6" sx={{ mb: 1 }}>
          사용된 기술
        </Typography>
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {STACK.map((s) => (
              <Chip key={s} label={s} variant="outlined" />
            ))}
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
            처음 보신다면
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <b>실시간 모니터링</b>에서 흐름이 움직이는 것을 보고, <b>운영 지표</b>에서 목표 대비 상태와 부하 테스트 결과를 확인해 주세요.
            상단의 시연 제어로 트래픽 급증이나 소비 지연을 직접 일으키면 이상탐지와 Lag 변화가 어떻게 보이는지 확인할 수 있습니다.
          </Typography>
        </Paper>

        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
          이 사이트는 메뉴 열람 기록(시각, 메뉴, 브라우저 종류, IP 주소, 임의 식별값)을 운영 확인용으로 30일간 저장합니다.
        </Typography>
      </Box>
    </>
  );
}
