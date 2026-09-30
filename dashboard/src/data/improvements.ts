// "다 끝났다"가 아니라 "지금 상태에서 뭐가 더 필요한지 스스로 안다"는 것도 포트폴리오
// 평가 포인트라, 완료된 Phase 목록만이 아니라 아직 안 채운 부분도 화면에 그대로 남겨둔다.
export type Priority = "high" | "medium";

export interface Improvement {
  title: string;
  description: string;
  priority: Priority;
}

export const IMPROVEMENTS: Improvement[] = [
  {
    title: "테스트 코드 - payment-api만 있고 나머지 서비스는 없음",
    description:
      "payment-api는 컨트롤러(MockMvc)/Kafka 발행 로직(Mockito) 단위 테스트 9건을 추가함(검증 실패 400, " +
      "발행 성공/실패/타임아웃/인터럽트 케이스 포함). db-writer-consumer(Java), gateway/mcp-server/ws-server(TS), " +
      "3개 Python 에이전트는 아직 기본 생성 테스트조차 없음 - 다음 우선순위.",
    priority: "high",
  },
  {
    title: "DB 비밀번호가 k8s 매니페스트에 평문으로 있음",
    description:
      "GOOGLE_API_KEY는 Secret으로 분리했지만 Postgres 계정/비밀번호는 k8s/*.yaml에 그대로 커밋돼 있음 " +
      "(public 저장소). 같은 방식으로 Secret화해서 일관성을 맞춰야 함.",
    priority: "high",
  },
  {
    title: "README에 실제 화면 스크린샷 없음",
    description:
      "아키텍처 다이어그램은 있지만 대시보드가 실제로 어떻게 보이는지 이미지가 없어서, " +
      "저장소를 훑어보는 사람이 결과물을 한눈에 확인하기 어려움.",
    priority: "medium",
  },
  {
    title: "CI/CD 파이프라인 없음",
    description:
      "GitHub Actions 등으로 push 시 빌드/테스트가 자동으로 도는 흐름이 없음. " +
      "테스트 코드가 먼저 생기면 자연스럽게 이어서 붙일 수 있는 항목.",
    priority: "medium",
  },
];
