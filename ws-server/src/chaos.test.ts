import { describe, expect, it } from "vitest";
import { MAX_SECONDS, MAX_TPS, clampBurst } from "./chaos.js";

describe("clampBurst", () => {
  it("허용 범위 안의 값은 그대로 쓴다", () => {
    expect(clampBurst(50, 30)).toEqual({ tps: 50, seconds: 30 });
  });

  it("너무 큰 값은 최대치로 자른다 (서버가 과부하를 일으키지 않게)", () => {
    expect(clampBurst(10_000, 10_000)).toEqual({ tps: MAX_TPS, seconds: MAX_SECONDS });
  });

  it("0 이하나 숫자가 아닌 값은 최소/기본값으로 맞춘다", () => {
    expect(clampBurst(0, -5)).toEqual({ tps: 1, seconds: 1 });
    expect(clampBurst(Number.NaN, Number.NaN)).toEqual({ tps: 30, seconds: 30 });
  });
});
