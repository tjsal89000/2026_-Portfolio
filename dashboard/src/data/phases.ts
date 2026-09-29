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
  { number: 12, shortLabel: "Terraform", title: "인프라 (Terraform)", status: "in-progress", summary: "EC2 인스턴스 프로비저닝 + user_data로 Docker/k3s 설치 자동화" },
  { number: 13, shortLabel: "통합테스트", title: "통합 테스트 + 문서화", status: "pending", summary: "전체 흐름 End-to-End 확인, README/ADR 작성" },
];
