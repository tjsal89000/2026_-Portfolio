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
      "Java 2개·TS 3개·Python 3개 서비스 전부에 단위 테스트(총 48건, '테스트 코드' 메뉴 참고)는 " +
      "갖췄지만, push할 때마다 로컬에서 mvn test/vitest run/pytest를 직접 돌려야 함 - GitHub " +
      "Actions로 자동 실행되는 흐름이 아직 없어서 다음 우선순위로 올림.",
    priority: "high",
  },
];
