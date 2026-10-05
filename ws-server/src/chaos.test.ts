import { describe, expect, it, vi, afterEach } from "vitest";
import { MAX_SECONDS, MAX_TPS, clampBurst } from "./chaos.js";

// 쿨다운 상태는 모듈 안에 있으므로, 케이스마다 모듈을 새로 불러온다
async function loadFresh() {
  vi.resetModules();
  return import("./chaos.js");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

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

describe("reserveChaos (쿨다운)", () => {
  it("실행 중에는 두 번째 요청을 거부한다", async () => {
    const mod = await loadFresh();
    expect(mod.reserveChaos(30, 0).ok).toBe(true);
    expect(mod.reserveChaos(30, 10_000).ok).toBe(false);
  });

  it("실행이 끝나고 1분이 지나야 다시 허용한다", async () => {
    const mod = await loadFresh();
    mod.reserveChaos(30, 0); // 30초 실행 + 60초 쿨다운 = 90초까지 잠김
    expect(mod.reserveChaos(30, 89_000).ok).toBe(false);
    expect(mod.reserveChaos(30, 90_000).ok).toBe(true);
  });

  it("실행 시작에 실패하면 예약을 되돌려 바로 다시 시도할 수 있다", async () => {
    const mod = await loadFresh();
    mod.reserveChaos(30, 0);
    mod.releaseChaos();
    expect(mod.reserveChaos(30, 1_000).ok).toBe(true);
  });
});

describe("chaosStatus", () => {
  it("CHAOS_ENABLED가 꺼져 있으면 enabled=false", async () => {
    vi.stubEnv("CHAOS_ENABLED", "false");
    const mod = await loadFresh();
    expect(mod.chaosStatus().enabled).toBe(false);
  });

  it("CHAOS_ENABLED가 켜져 있으면 비밀번호 없이 enabled=true", async () => {
    vi.stubEnv("CHAOS_ENABLED", "true");
    const mod = await loadFresh();
    expect(mod.chaosStatus().enabled).toBe(true);
  });
});
