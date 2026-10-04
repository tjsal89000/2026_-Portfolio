import { describe, expect, it } from "vitest";
import { calcErrorBudget, parseGithubRuns, parseTrace } from "./ops.js";

describe("calcErrorBudget", () => {
  it("성공률 99.95%면 허용 실패율 0.1% 중 절반을 쓴 것이므로 남은 예산은 50%", () => {
    const budget = calcErrorBudget(0.9995, 0.999);
    expect(budget.remainingPct).toBeCloseTo(50, 5);
  });

  it("성공률이 목표보다 낮아 예산을 전부 쓰면 0%에서 멈추고 음수가 되지 않는다", () => {
    const budget = calcErrorBudget(0.98, 0.999);
    expect(budget.remainingPct).toBe(0);
  });

  it("실패가 전혀 없으면 예산 100% 남음", () => {
    expect(calcErrorBudget(1, 0.999).remainingPct).toBe(100);
  });
});

describe("parseGithubRuns", () => {
  it("필요한 필드만 뽑고 커밋 해시는 7자리로 줄인다", () => {
    const runs = parseGithubRuns({
      workflow_runs: [
        {
          name: "CI",
          display_title: "fix: 대시보드 수정",
          status: "completed",
          conclusion: "success",
          head_sha: "4a25fe2abcdef1234567890",
          created_at: "2026-10-04T01:00:00Z",
          html_url: "https://github.com/x/y/actions/runs/1",
        },
      ],
    });
    expect(runs).toEqual([
      {
        name: "CI",
        title: "fix: 대시보드 수정",
        status: "completed",
        conclusion: "success",
        sha: "4a25fe2",
        createdAt: "2026-10-04T01:00:00Z",
        url: "https://github.com/x/y/actions/runs/1",
      },
    ]);
  });

  it("응답에 workflow_runs가 없으면 빈 배열", () => {
    expect(parseGithubRuns({})).toEqual([]);
  });
});

describe("parseTrace", () => {
  const ns = (ms: number) => String(BigInt(1_700_000_000_000_000_000) + BigInt(ms) * 1_000_000n);

  it("span 시작 시점을 trace 최초 시작 기준 ms 오프셋으로 바꾸고 서비스별로 나눈다", () => {
    const spans = parseTrace({
      batches: [
        {
          resource: { attributes: [{ key: "service.name", value: { stringValue: "payment-api" } }] },
          scopeSpans: [
            {
              spans: [
                { name: "POST /payments", startTimeUnixNano: ns(0), endTimeUnixNano: ns(12) },
                { name: "kafka publish", startTimeUnixNano: ns(5), endTimeUnixNano: ns(9) },
              ],
            },
          ],
        },
        {
          resource: { attributes: [{ key: "service.name", value: { stringValue: "db-writer-consumer" } }] },
          scopeSpans: [
            { spans: [{ name: "save payment", startTimeUnixNano: ns(20), endTimeUnixNano: ns(31) }] },
          ],
        },
      ],
    });
    expect(spans).toEqual([
      { service: "payment-api", name: "POST /payments", offsetMs: 0, durationMs: 12 },
      { service: "payment-api", name: "kafka publish", offsetMs: 5, durationMs: 4 },
      { service: "db-writer-consumer", name: "save payment", offsetMs: 20, durationMs: 11 },
    ]);
  });

  it("span이 하나도 없으면 빈 배열", () => {
    expect(parseTrace({ batches: [] })).toEqual([]);
  });
});
