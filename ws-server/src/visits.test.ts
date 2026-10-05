import { describe, expect, it, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("summarizeUserAgent", () => {
  it("Chrome on Windows", async () => {
    const { summarizeUserAgent } = await import("./visits.js");
    expect(summarizeUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0 Safari/537.36")).toBe("Chrome · Windows");
  });

  it("Edge는 Chrome으로 잘못 분류하지 않는다", async () => {
    const { summarizeUserAgent } = await import("./visits.js");
    expect(summarizeUserAgent("Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Edg/120.0")).toBe("Edge · Windows");
  });

  it("iPhone Safari", async () => {
    const { summarizeUserAgent } = await import("./visits.js");
    expect(summarizeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1")).toBe("Safari · iOS");
  });

  it("모르는 값은 기타", async () => {
    const { summarizeUserAgent } = await import("./visits.js");
    expect(summarizeUserAgent("curl/8.0")).toBe("기타 · 기타");
  });
});

describe("isAdminToken", () => {
  it("토큰이 설정되지 않으면 항상 거부 (관리자 기능 꺼짐)", async () => {
    vi.stubEnv("ADMIN_TOKEN", "");
    const mod = await import("./visits.js");
    expect(mod.isAdminEnabled()).toBe(false);
    expect(mod.isAdminToken("")).toBe(false);
  });

  it("맞는 토큰만 통과", async () => {
    vi.stubEnv("ADMIN_TOKEN", "test-admin-token");
    const mod = await import("./visits.js");
    expect(mod.isAdminToken("test-admin-token")).toBe(true);
    expect(mod.isAdminToken("wrong")).toBe(false);
    expect(mod.isAdminToken(undefined)).toBe(false);
  });
});
