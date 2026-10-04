// 부하 테스트 결과 기록. GitHub Actions "Load test" 실행 결과를 확인한 뒤 여기 옮겨 적는다.
// 실시간으로 불러오지 않는 이유: 부하 실행은 수동 이벤트라 자주 바뀌지 않고, 결과는 측정 당시 값으로 고정해 두는 편이 설명하기 쉽다.

export interface StageResult {
  tps: number;
  p95Ms: number;
  failRatePct: number | null; // null이면 측정값 없음
}

export interface LoadTestRun {
  profile: "normal" | "high" | "limit";
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
    profile: "high",
    date: "2026-10-04",
    outcome: "aborted",
    totalRequests: 9952,
    stages: [],
    note: "80 TPS 구간에서 p95 500ms 초과로 중단. 구간별 값은 당시 기록 방식(전체 누적)이라 남아 있지 않음 (전체 p95 540ms).",
  },
];
