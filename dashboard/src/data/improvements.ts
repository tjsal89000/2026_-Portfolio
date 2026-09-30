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
    title: "README에 실제 화면 스크린샷 없음",
    description:
      "아키텍처 다이어그램은 있지만 대시보드가 실제로 어떻게 보이는지 이미지가 없어서, " +
      "저장소를 훑어보는 사람이 결과물을 한눈에 확인하기 어려움.",
    priority: "medium",
  },
];
