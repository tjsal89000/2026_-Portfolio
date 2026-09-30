// "인프라 현황"(사이드바의 다른 메뉴)은 EC2/Pod의 실시간 상태(러닝 여부, 재시작 횟수 등)를
// 보여주고, 여기는 그와 달리 "애초에 뭐가 어디에 떠 있고 왜 있는가"라는 정적인 구조를 보여준다 -
// k8s/*.yaml에 정의된 실제 Deployment 18개를 그대로 옮긴 것(테스트 코드처럼 사람이 갱신).
export type Tech = "Java" | "TypeScript" | "Python" | "Infra";

export interface TopologyItem {
  name: string;
  tech: Tech;
  description: string;
}

export interface TopologyGroup {
  title: string;
  items: TopologyItem[];
}

export const TOPOLOGY: TopologyGroup[] = [
  {
    title: "진입점 / 핵심 서비스",
    items: [
      { name: "nginx", tech: "Infra", description: "전체 서비스의 단일 진입점(리버스 프록시) - 대시보드 정적 자산도 이 경로로 서빙" },
      { name: "gateway", tech: "TypeScript", description: "외부 요청의 단일 진입점. opossum 서킷브레이커로 payment-api를 프록시" },
      { name: "payment-api", tech: "Java", description: "결제 요청 접수 및 검증 후 Kafka로 발행. Resilience4j Retry/CircuitBreaker 적용" },
      { name: "db-writer-consumer", tech: "Java", description: "Kafka 이벤트를 멱등성 있게 Postgres에 저장하고 Redis 카운터를 갱신" },
      { name: "ws-server", tech: "TypeScript", description: "Redis Pub/Sub을 구독해 WebSocket으로 대시보드에 실시간 브로드캐스트" },
      { name: "mcp-server", tech: "TypeScript", description: "Kafka/Redis/Postgres 조회 도구 4종을 MCP로 노출 (읽기 전용)" },
      { name: "dashboard", tech: "TypeScript", description: "지금 보고 있는 이 화면 자체 (React, nginx로 정적 서빙)" },
    ],
  },
  {
    title: "비동기 에이전트",
    items: [
      { name: "traffic-generator", tech: "Python", description: "정상 + 이상 패턴(반복요청/고액이상치/쏠림) 결제 트래픽을 자동 생성" },
      { name: "anomaly-detector", tech: "Python", description: "Redis 임계치 기반 + Kafka 콘텐츠 기반 이상탐지, n8n webhook으로 알림" },
      { name: "report-agent", tech: "Python", description: "MCP 도구 호출(tool calling) + Gemini로 운영 리포트를 생성해 Postgres에 저장" },
    ],
  },
  {
    title: "데이터 스토어",
    items: [
      { name: "Kafka", tech: "Infra", description: "payment.events 토픽 - 결제 이벤트의 source of truth (단일 브로커 KRaft 모드)" },
      { name: "PostgreSQL", tech: "Infra", description: "결제 내역과 AI 리포트를 영구 저장" },
      { name: "Redis", tech: "Infra", description: "초단위 버킷 카운터(실시간 집계) + Pub/Sub(실시간 상태 전파)" },
    ],
  },
  {
    title: "관측성",
    items: [
      { name: "Prometheus", tech: "Infra", description: "payment-api / db-writer-consumer / kafka-exporter의 메트릭을 스크랩" },
      { name: "Grafana", tech: "Infra", description: "Prometheus(메트릭) + Tempo(트레이싱)를 시각화하는 대시보드" },
      { name: "Tempo", tech: "Infra", description: "OTLP로 수집한 분산 트레이싱 저장/조회" },
      { name: "kafka-exporter", tech: "Infra", description: "Kafka 브로커/컨슈머 그룹 지표를 Prometheus 포맷으로 노출" },
    ],
  },
  {
    title: "자동화",
    items: [
      { name: "n8n", tech: "Infra", description: "이상탐지 Slack 알림 워크플로우 + 리포트 에이전트 스케줄 트리거" },
    ],
  },
];
