import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mget = vi.fn();
vi.mock("ioredis", () => ({
  Redis: vi.fn().mockImplementation(function () {
    return { mget };
  }),
}));

const FIXED_NOW = new Date("2026-01-01T00:00:10.000Z");
const NOW_EPOCH = Math.floor(FIXED_NOW.getTime() / 1000);

describe("getRealtimeMetrics", () => {
  beforeEach(() => {
    // db-writer-consumer(Java)의 PaymentMetricsService가 epochSecond 기준으로 버킷 키를
    // 만들기 때문에, 여기서도 "지금"을 고정해야 어떤 키로 MGET이 호출됐는지 결정적으로 검증할 수 있다.
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    mget.mockReset();
  });

  it("최근 windowSeconds초의 카운트/에러 버킷을 합산해 TPS와 에러율을 계산한다", async () => {
    // 3초 윈도우: count=[10,20,30] 합계60, error=[0,5,0] 합계5
    mget.mockResolvedValueOnce(["10", "20", "30"]).mockResolvedValueOnce(["0", "5", null]);

    const { getRealtimeMetrics } = await import("./redis.js");
    const result = await getRealtimeMetrics(3);

    expect(mget).toHaveBeenNthCalledWith(
      1,
      `payment:count:${NOW_EPOCH}`,
      `payment:count:${NOW_EPOCH - 1}`,
      `payment:count:${NOW_EPOCH - 2}`,
    );
    expect(mget).toHaveBeenNthCalledWith(
      2,
      `payment:error:${NOW_EPOCH}`,
      `payment:error:${NOW_EPOCH - 1}`,
      `payment:error:${NOW_EPOCH - 2}`,
    );
    expect(result).toEqual({
      windowSeconds: 3,
      totalProcessed: 60,
      totalErrors: 5,
      tps: 20, // 60 / 3
      errorRatePercent: 8.33, // 5/60*100, 소수 둘째자리 반올림
    });
  });

  it("처리 건수가 0이면 0으로 나누지 않고 에러율을 0으로 둔다", async () => {
    mget.mockResolvedValueOnce([null]).mockResolvedValueOnce([null]);

    const { getRealtimeMetrics } = await import("./redis.js");
    const result = await getRealtimeMetrics(1);

    expect(result.totalProcessed).toBe(0);
    expect(result.errorRatePercent).toBe(0);
  });
});
