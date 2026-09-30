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
    title: "테스트 코드 부재",
    description:
      "Java 쪽에 Spring Boot 기본 생성 테스트(PaymentApiApplicationTests 등)만 있고 실제 유닛/통합 테스트가 없음. " +
      "결제 API처럼 정확성이 중요한 도메인일수록 우선순위가 높은 보완점.",
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
