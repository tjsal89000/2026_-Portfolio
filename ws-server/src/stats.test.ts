import { describe, expect, it } from "vitest";
import { toShares } from "./stats.js";

describe("toShares", () => {
  it("개수 많은 순으로 정렬하고 비율을 붙인다", () => {
    const shares = toShares([
      { label: "KR", count: 6 },
      { label: "US", count: 2 },
      { label: "DE", count: 2 },
    ]);
    expect(shares.map((s) => s.label)).toEqual(["KR", "US", "DE"]);
    expect(shares[0].percent).toBe(60);
    expect(shares[1].percent).toBe(20);
  });

  it("전체가 0이면 비율은 0", () => {
    expect(toShares([{ label: "KR", count: 0 }])[0].percent).toBe(0);
  });

  it("빈 목록이면 빈 배열", () => {
    expect(toShares([])).toEqual([]);
  });
});
