import { describe, expect, it } from "vitest";
import { parseDailyCosts, parseMonthTotal, toKrw } from "./cost.js";

describe("toKrw", () => {
  it("달러를 환율로 곱해 원 단위로 반올림한다", () => {
    expect(toKrw(1.25, 1400)).toBe(1750);
    expect(toKrw(0.0004, 1400)).toBe(1);
  });
});

describe("parseDailyCosts", () => {
  it("일별 결과를 날짜와 금액(숫자) 목록으로 바꾼다", () => {
    const days = parseDailyCosts([
      { TimePeriod: { Start: "2026-10-03", End: "2026-10-04" }, Total: { UnblendedCost: { Amount: "1.25", Unit: "USD" } } },
      { TimePeriod: { Start: "2026-10-04", End: "2026-10-05" }, Total: { UnblendedCost: { Amount: "0.5", Unit: "USD" } } },
    ]);
    expect(days).toEqual([
      { date: "2026-10-03", amount: 1.25, krw: 1 },
      { date: "2026-10-04", amount: 0.5, krw: 1 },
    ]);
  });

  it("결과가 없으면 빈 배열", () => {
    expect(parseDailyCosts(undefined)).toEqual([]);
  });

  it("금액이 빠져 있으면 0으로 본다", () => {
    expect(parseDailyCosts([{ TimePeriod: { Start: "2026-10-04", End: "2026-10-05" } }])).toEqual([{ date: "2026-10-04", amount: 0, krw: 0 }]);
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
