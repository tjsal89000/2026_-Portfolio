import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_SECONDS, MAX_TPS, clampBurst } from "./chaos.js";

// 환경변수는 모듈을 불러올 때 한 번 읽히므로, 케이스마다 모듈을 새로 불러온다
async function loadWith(enabled: string, password: string) {
  vi.stubEnv("CHAOS_ENABLED", enabled);
  vi.stubEnv("CHAOS_PASSWORD", password);
  vi.resetModules();
  return import("./chaos.js");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("reserveChaos (쿨다운)", () => {
  it("실행 중에는 두 번째 요청을 거부한다", async () => {
    const mod = await loadWith("true", "s3cret-test");
    expect(mod.reserveChaos(30, 0).ok).toBe(true);
    expect(mod.reserveChaos(30, 10_000).ok).toBe(false);
  });

  it("실행이 끝나고 1분이 지나야 다시 허용한다", async () => {
    const mod = await loadWith("true", "s3cret-test");
    mod.reserveChaos(30, 0); // 30초 실행 + 60초 쿨다운 = 90초까지 잠김
    expect(mod.reserveChaos(30, 89_000).ok).toBe(false);
    expect(mod.reserveChaos(30, 90_000).ok).toBe(true);
  });

  it("실행 시작에 실패하면 예약을 되돌려 바로 다시 시도할 수 있다", async () => {
    const mod = await loadWith("true", "s3cret-test");
    mod.reserveChaos(30, 0);
    mod.releaseChaos();
    expect(mod.reserveChaos(30, 1_000).ok).toBe(true);
  });
});

describe("checkPassword", () => {
  it("비밀번호가 설정되지 않으면 기능 자체가 꺼진 것으로 본다", async () => {
    const mod = await loadWith("true", "");
    expect(mod.checkPassword("아무거나")).toBe("disabled");
  });

  it("맞는 비밀번호는 ok, 틀리면 wrong", async () => {
    const mod = await loadWith("true", "s3cret-test");
    expect(mod.checkPassword("s3cret-test")).toBe("ok");
    expect(mod.checkPassword("wrong-one")).toBe("wrong");
  });

  it("틀린 입력이 5번 쌓이면 맞는 비밀번호도 잠겨서 거부한다", async () => {
    const mod = await loadWith("true", "s3cret-test");
    for (let i = 0; i < 5; i++) mod.checkPassword("nope");
    expect(mod.checkPassword("s3cret-test")).toBe("locked");
  });

  it("CHAOS_ENABLED가 꺼져 있으면 비밀번호가 맞아도 disabled", async () => {
    const mod = await loadWith("false", "s3cret-test");
    expect(mod.checkPassword("s3cret-test")).toBe("disabled");
  });

  it("requireEnabled=false면 장애 주입 스위치와 무관하게 비밀번호만 검사한다 (리포트 보호)", async () => {
    const mod = await loadWith("false", "s3cret-test");
    expect(mod.checkPassword("s3cret-test", false)).toBe("ok");
    expect(mod.checkPassword("nope", false)).toBe("wrong");
  });
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
