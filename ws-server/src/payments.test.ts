import { describe, expect, it, vi } from "vitest";

const query = vi.fn();
vi.mock("pg", () => ({
  default: {
    Pool: vi.fn().mockImplementation(function () {
      return { query };
    }),
  },
}));

describe("getRecentPayments", () => {
  it("snake_case DB 행을 camelCase로 바꾸고, 상태는 항상 APPROVED로 채운다", async () => {
    query.mockResolvedValue({
      rows: [
        {
          idempotency_key: "idem-1",
          account_id: "acc-1",
          amount: "10000", // pg는 bigint 계열을 문자열로 반환할 수 있음 - Number 변환 확인용
          country: "KR",
          payment_method: "CARD",
          processed_at: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    });

    const { getRecentPayments } = await import("./payments.js");
    const result = await getRecentPayments(1);

    expect(result).toEqual([
      {
        idempotencyKey: "idem-1",
        accountId: "acc-1",
        amount: 10000,
        country: "KR",
        paymentMethod: "CARD",
        status: "APPROVED",
        processedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(query.mock.calls[0][1]).toEqual([1]);
  });
});
