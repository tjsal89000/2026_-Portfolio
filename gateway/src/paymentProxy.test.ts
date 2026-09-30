import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * paymentBreaker는 모듈을 import하는 순간 생성되는 싱글턴이라 실패 통계가 테스트 간에
 * 그대로 이어진다 - opossum의 기본 volumeThreshold가 0이라 실패 한 번만으로도 서킷이
 * 열릴 수 있어서, 테스트마다 vi.resetModules()로 완전히 새 인스턴스를 만들어 격리한다.
 */
describe("paymentBreaker", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.resetModules();
  });

  it("정상 응답이면 payment-api 결과를 그대로 반환한다", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ message: "접수됨" }),
    }) as unknown as typeof fetch;

    const { paymentBreaker } = await import("./paymentProxy.js");
    const result = await paymentBreaker.fire({ amount: 1000 });

    expect(result).toEqual({ status: 202, data: { message: "접수됨" } });
  });

  it("payment-api가 실패 응답을 줘도 opossum fallback이 503으로 감싼다", async () => {
    // opossum의 fallback()은 "서킷이 열렸을 때"뿐 아니라 fire()로 실행한 함수 자체가
    // 실패한 모든 경우에 호출된다 - 그래서 payment-api가 준 400도 원래 상태코드가
    // 아니라 여기서 등록한 503 폴백으로 대체된다. 클라이언트 입장에서는 payment-api가
    // 왜 거절했는지(400 사유)를 알 수 없게 된다는 뜻이라, 실제로 돌려보고서야 확인한 동작.
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "invalid" }),
    }) as unknown as typeof fetch;

    const { paymentBreaker } = await import("./paymentProxy.js");

    await expect(paymentBreaker.fire({})).rejects.toMatchObject({ status: 503 });
  });

  it(
    "payment-api가 응답하지 않으면 서킷브레이커 타임아웃으로 503 폴백을 던진다",
    async () => {
      // opossum의 timeout(5000ms) 자체를 테스트하려고 일부러 resolve되지 않는 fetch를 준다.
      global.fetch = vi.fn(() => new Promise<never>(() => {})) as unknown as typeof fetch;

      const { paymentBreaker } = await import("./paymentProxy.js");

      await expect(paymentBreaker.fire({})).rejects.toMatchObject({ status: 503 });
    },
    8000,
  );
});
