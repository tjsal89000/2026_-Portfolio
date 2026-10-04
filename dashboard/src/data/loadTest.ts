// 부하 테스트 결과 기록. GitHub Actions "Load test" 실행 결과를 확인한 뒤 여기 옮겨 적는다.
// 실시간으로 불러오지 않는 이유: 부하 실행은 수동 이벤트라 자주 바뀌지 않고, 결과는 측정 당시 값으로 고정해 두는 편이 설명하기 쉽다.

export interface StageResult {
  tps: number;
  p95Ms: number;
  failRatePct: number | null; // null이면 측정값 없음
}

export interface LoadTestRun {
  profile: "normal" | "high" | "limit" | "confirm50" | "confirm60" | "confirm70";
  // 같은 프로필을 여러 번 돌릴 수 있으니 date와 함께 키로 쓴다
  date: string; // YYYY-MM-DD
  outcome: "completed" | "aborted";
  totalRequests: number | null;
  stages: StageResult[];
  note: string;
}

export const LOAD_TEST_RUNS: LoadTestRun[] = [
  {
    profile: "normal",
    date: "2026-10-04",
    outcome: "completed",
    totalRequests: 9003,
    stages: [
      { tps: 5, p95Ms: 180.7, failRatePct: null },
      { tps: 10, p95Ms: 181.3, failRatePct: null },
      { tps: 20, p95Ms: 184.0, failRatePct: null },
      { tps: 40, p95Ms: 207.5, failRatePct: null },
    ],
    note: "40 TPS까지 전 구간 p95 500ms 기준 통과. 중단 없이 끝까지 실행됨.",
  },
  {
    profile: "limit",
    date: "2026-10-05",
    outcome: "aborted",
    totalRequests: 4873,
    stages: [
      { tps: 40, p95Ms: 200.6, failRatePct: null },
      { tps: 50, p95Ms: 555.3, failRatePct: null },
    ],
    note: "50 TPS 구간(측정 시간 짧음)에서 p95 555ms로 중단됐지만, 아래 50 TPS 단독 재측정에서 191ms로 재현되지 않음. 60·70 TPS는 미측정.",
  },
  {
    profile: "confirm50",
    date: "2026-10-05",
    outcome: "completed",
    totalRequests: 6001,
    stages: [{ tps: 50, p95Ms: 191.2, failRatePct: null }],
    note: "50 TPS를 2분 전체 측정. 기준(500ms) 안에서 끝까지 통과. 앞선 555ms 값은 짧은 구간 측정에서 나온 것으로 판단.",
  },
  {
    profile: "confirm60",
    date: "2026-10-05",
    outcome: "completed",
    totalRequests: 7198,
    stages: [{ tps: 60, p95Ms: 375.0, failRatePct: null }],
    note: "60 TPS를 2분 전체 측정. 기준(500ms) 안에서 끝까지 통과.",
  },
  {
    profile: "high",
    date: "2026-10-04",
    outcome: "aborted",
    totalRequests: 9952,
    stages: [],
    note: "80 TPS 구간에서 p95 500ms 초과로 중단. 구간별 값은 당시 기록 방식(전체 누적)이라 남아 있지 않음 (전체 p95 540ms).",
  },
];
