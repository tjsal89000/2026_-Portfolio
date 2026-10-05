// WORKFLOW.md의 Phase별 진행 상황을 그대로 옮겨온 것 - Phase가 끝날 때마다 WORKFLOW.md와
// 함께 이 배열도 갱신한다. 실시간으로 자동 동기화하지 않는 이유: Phase 진행 상태는 초 단위로
// 바뀌는 값이 아니라 "작업이 끝났을 때"만 바뀌는 값이라, 그 시점에 사람이 한 번 갱신해주는 게
// 굳이 서버를 하나 더 만들어 자동화하는 것보다 단순하고 정직하다.
export type PhaseStatus = "done" | "in-progress" | "pending";

export interface Phase {
  number: number;
  shortLabel: string;
  title: string;
  status: PhaseStatus;
  summary: string;
}

export const PHASES: Phase[] = [
  { number: 0, shortLabel: "준비", title: "준비", status: "done", summary: "폴더 구조 확정, 로컬 개발 환경(Java/Node/Python) 확인, LLM API 키(Gemini) 준비" },
  { number: 1, shortLabel: "결제 API", title: "결제 API (Java/Spring Boot)", status: "done", summary: "POST /payments로 이벤트를 받아 검증 후 Kafka로 publish하는 Producer" },
  { number: 2, shortLabel: "DB 저장", title: "DB Writer Consumer + Redis 카운터", status: "done", summary: "Kafka 이벤트를 멱등성 있게 Postgres에 저장하고, Redis 실시간 카운터 갱신 + Pub/Sub 발행" },
  { number: 3, shortLabel: "인프라", title: "Kafka + Redis + 관측성 + 회복력", status: "done", summary: "Prometheus/Grafana/Tempo 관측성 스택 구축, Resilience4j Retry/CircuitBreaker 적용" },
  { number: 4, shortLabel: "MCP 서버", title: "MCP 서버 (TypeScript)", status: "done", summary: "Kafka Lag/Redis 카운터/Postgres 조회 도구 4종을 Streamable HTTP로 노출" },
  { number: 5, shortLabel: "트래픽생성", title: "트래픽 생성 에이전트 (Python)", status: "done", summary: "정상 + 이상 패턴(반복요청/고액이상치/쏠림) 트래픽을 자동 생성" },
  { number: 6, shortLabel: "이상탐지", title: "이상탐지/장애대응 에이전트 (Python)", status: "done", summary: "Redis 임계치 기반 + Kafka 콘텐츠 기반 이상탐지, n8n webhook으로 알림" },
  { number: 7, shortLabel: "n8n", title: "n8n 워크플로우", status: "done", summary: "Slack 알림 워크플로우 + 리포트 에이전트 스케줄 트리거 연결" },
  { number: 8, shortLabel: "AI 리포트", title: "AI 분석/요약 리포트 에이전트 (Python)", status: "done", summary: "MCP 서버 도구 호출(tool calling) + Gemini로 운영 리포트 생성, Postgres 저장" },
  { number: 9, shortLabel: "게이트웨이", title: "API Gateway (TypeScript)", status: "done", summary: "opossum 서킷브레이커로 payment-api 프록시, 외부 요청의 단일 진입점" },
  { number: 10, shortLabel: "대시보드", title: "웹 대시보드 (React + WebSocket 서버)", status: "done", summary: "실시간 트래픽/알림/AI 리포트를 보여주는 지금 이 화면 자체" },
  { number: 11, shortLabel: "컨테이너화", title: "컨테이너화 (Docker + k3s)", status: "done", summary: "9개 컴포넌트 Dockerfile 작성 + k3s 매니페스트(Deployment/Service) 작성" },
  { number: 12, shortLabel: "Terraform", title: "인프라 (Terraform)", status: "done", summary: "EC2 인스턴스 프로비저닝 + user_data로 Docker/k3s 설치 자동화, terraform apply 한 번으로 실제 웹 대시보드 접속 확인" },
  { number: 13, shortLabel: "통합테스트", title: "통합 테스트 + 문서화", status: "done", summary: "로컬/EC2 End-to-End 확인 완료, 루트 README.md 신규 작성 + ADR 5건 추가(총 10건)" },
  { number: 14, shortLabel: "운영 지표", title: "운영 지표 화면 (SLO / CI / 결제 trace)", status: "done", summary: "Prometheus 기반 SLO와 에러 예산, GitHub Actions 최근 빌드, Tempo 결제 trace 폭포 그래프를 한 화면에 모음" },
  { number: 15, shortLabel: "부하 테스트", title: "부하 테스트 (k6) 와 한계 측정", status: "done", summary: "TPS를 구간별로 2분씩 독립 측정하고 p95 500ms 기준으로 자동 중단. 단일 노드 안정 한계 65~70 TPS 확인, GitHub Actions에서 수동 실행" },
  { number: 16, shortLabel: "장애 주입", title: "장애 주입 시연 (트래픽 급증 / Kafka 소비 지연)", status: "done", summary: "확인창을 거쳐 실행되고, 시간과 TPS가 제한되며 1분 쿨다운이 있는 시연 버튼. 소비 지연으로 Kafka Consumer Lag이 올랐다가 0으로 돌아오는 것을 확인" },
  { number: 17, shortLabel: "비용", title: "AWS 비용 패널 (Cost Explorer, 원화 환산)", status: "done", summary: "Cost Explorer 실제 청구 금액을 1시간 캐시로 조회하고, 공개 환율로 원화 환산. 조회 권한은 ce:GetCostAndUsage 하나만 추가" },
  { number: 18, shortLabel: "보안·정리", title: "보안 보호와 기술 부채 정리", status: "done", summary: "AI 리포트 생성 비밀번호 보호, Kubernetes 클라이언트 2.0 업그레이드로 취약점 0건, Node 22 전환, 대시보드 번들 620kB에서 388kB로 분리" },
  { number: 19, shortLabel: "장애 전환", title: "장애 전환 실측 검증", status: "pending", summary: "Spot 회수 시 대기 인스턴스로 EIP가 넘어가는 경로는 준비 점검까지 통과. 실제 전환은 HTTPS 인증서와 Secret 재설정 계획을 세운 뒤 점검 시간을 잡아서 진행 예정" },
];
