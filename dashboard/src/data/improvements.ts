// 아직 남은 보완점. 끝난 항목은 여기서 빼고, 진행 상황(Phase)에 기록한다.
export type Priority = "high" | "medium";

export interface Improvement {
  title: string;
  description: string;
  priority: Priority;
}

export const IMPROVEMENTS: Improvement[] = [
  {
    title: "장애 전환을 실제로 돌려보지 않음",
    description:
      "회수 시 교체 Spot 생성, 재시도, 공인 IP 인계, 대기 인스턴스 중지까지 자동화는 만들었고 권한과 설정도 검증했다. 다만 실제 회수 상황으로 끝까지 돌려본 적은 없다. 공개 사이트에 영향이 가므로 점검 시간을 정해서 한 번 확인해야 한다.",
    priority: "high",
  },
  {
    title: "장애 전환 시 데이터가 새로 시작됨",
    description:
      "교체 인스턴스의 데이터베이스는 빈 상태에서 시작한다. 합성 데이터라 시연에는 문제가 없지만, 실제 서비스였다면 정기 백업과 복원 절차가 필요하다.",
    priority: "medium",
  },
  {
    title: "Spot 용량이 없을 때 사이트가 내려갈 수 있음",
    description:
      "1시간 동안 교체 Spot을 잡지 못하면 대기 인스턴스를 중지한다. 요금은 멈추지만, 그때 사이트도 내려간다. 이 정책이 데모에 맞는지 다시 판단하거나, 중지 전에 알림을 보내는 방식을 검토해야 한다.",
    priority: "medium",
  },
  {
    title: "대기 인스턴스 이미지(AMI)가 고정되지 않음",
    description:
      "terraform plan에서 대기 온디맨드 인스턴스가 교체 대상으로 보인다(AMI 드리프트). 적용하면 대기 인스턴스가 바뀔 수 있어서, AMI를 고정한 뒤에 관리해야 한다.",
    priority: "medium",
  },
];
