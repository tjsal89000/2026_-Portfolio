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
  {
    title: "장애 전환을 실제로 검증하지 않음",
    description:
      "Spot 회수 시 대기 인스턴스로 EIP가 넘어가는 Lambda 경로는 설정과 권한만 점검했다. 실제 전환 후에는 HTTPS 인증서와 Secret을 다시 맞춰야 해서, 점검 시간을 잡아 한 번 끝까지 돌려봐야 한다.",
    priority: "high",
  },
  {
    title: "이상탐지 알림이 n8n에서 아직 연결되지 않음",
    description:
      "알림 칸과 인시던트 타임라인이 비어 있다. n8n에서 알림을 웹훅(/webhook/alert-relay)으로 보내는 노드를 연결하면 실제 알림 흐름을 시연할 수 있다.",
    priority: "high",
  },
  {
    title: "대기 인스턴스 AMI가 고정되지 않음",
    description:
      "terraform plan에서 대기 온디맨드 인스턴스가 교체 대상으로 보인다(AMI 드리프트). 적용하면 대기 인스턴스가 바뀔 수 있어서, AMI를 고정한 뒤에 관리해야 한다.",
    priority: "medium",
  },
];
