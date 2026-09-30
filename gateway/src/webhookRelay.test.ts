import { describe, expect, it, vi } from "vitest";

// 실제 Redis에 연결하면 테스트가 인프라 가동 여부에 의존하게 되므로 ioredis 자체를 목킹한다 -
// 이 파일이 검증하려는 건 "어느 채널로 무엇을 발행하는가"이지 Redis 연결 자체가 아니다.
const publishMock = vi.fn().mockResolvedValue(1);
vi.mock("ioredis", () => ({
  // new Redis(...)로 호출되므로(webhookRelay.ts), 생성자로 쓸 수 있는 일반 함수여야 한다 -
  // 화살표 함수는 new와 함께 쓸 수 없어서 "is not a constructor"로 실패한다.
  Redis: vi.fn().mockImplementation(function () {
    return { publish: publishMock };
  }),
}));

describe("relayAlertToWebSocketChannel", () => {
  it("payment:alerts:live 채널로 JSON 직렬화해서 발행한다", async () => {
    const { relayAlertToWebSocketChannel } = await import("./webhookRelay.js");

    await relayAlertToWebSocketChannel({ type: "anomaly", accountId: "acc-1" });

    expect(publishMock).toHaveBeenCalledWith(
      "payment:alerts:live",
      JSON.stringify({ type: "anomaly", accountId: "acc-1" }),
    );
  });
});
