import { describe, expect, it } from "vitest";
import { parseDailyCosts, parseMonthTotal } from "./cost.js";

describe("parseDailyCosts", () => {
  it("일별 결과를 날짜와 금액(숫자) 목록으로 바꾼다", () => {
    const days = parseDailyCosts([
      { TimePeriod: { Start: "2026-10-03", End: "2026-10-04" }, Total: { UnblendedCost: { Amount: "1.25", Unit: "USD" } } },
      { TimePeriod: { Start: "2026-10-04", End: "2026-10-05" }, Total: { UnblendedCost: { Amount: "0.5", Unit: "USD" } } },
    ]);
    expect(days).toEqual([
      { date: "2026-10-03", amount: 1.25 },
      { date: "2026-10-04", amount: 0.5 },
    ]);
  });

  it("결과가 없으면 빈 배열", () => {
    expect(parseDailyCosts(undefined)).toEqual([]);
  });

  it("금액이 빠져 있으면 0으로 본다", () => {
    expect(parseDailyCosts([{ TimePeriod: { Start: "2026-10-04", End: "2026-10-05" } }])).toEqual([{ date: "2026-10-04", amount: 0 }]);
  });
});

describe("parseMonthTotal", () => {
  it("월간 결과의 첫 항목 금액을 쓴다", () => {
    expect(parseMonthTotal([{ Total: { UnblendedCost: { Amount: "12.34" } } }])).toBe(12.34);
  });

  it("결과가 없으면 0", () => {
    expect(parseMonthTotal([])).toBe(0);
  });
});
