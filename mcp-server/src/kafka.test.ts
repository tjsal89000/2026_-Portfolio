import { describe, expect, it, vi } from "vitest";

const fetchOffsets = vi.fn();
const fetchTopicOffsets = vi.fn();
const connect = vi.fn().mockResolvedValue(undefined);
const disconnect = vi.fn().mockResolvedValue(undefined);

vi.mock("kafkajs", () => ({
  Kafka: vi.fn().mockImplementation(function () {
    return { admin: () => ({ connect, fetchOffsets, fetchTopicOffsets, disconnect }) };
  }),
}));

describe("getKafkaLag", () => {
  it("파티션별로 최신 오프셋과 커밋 오프셋의 차이를 lag으로 계산한다", async () => {
    fetchTopicOffsets.mockResolvedValue([
      { partition: 1, offset: "50" },
      { partition: 0, offset: "100" },
    ]);
    fetchOffsets.mockResolvedValue([
      {
        groupId: "db-writer-consumer-group",
        partitions: [
          { partition: 0, offset: "80" },
          // "-1"은 아직 한 번도 커밋된 적 없는 파티션이라는 뜻 - 0으로 취급해야 한다.
          { partition: 1, offset: "-1" },
        ],
      },
    ]);

    const { getKafkaLag } = await import("./kafka.js");
    const result = await getKafkaLag();

    expect(result.partitions).toEqual([
      { partition: 0, committedOffset: "80", latestOffset: "100", lag: "20" },
      { partition: 1, committedOffset: "0", latestOffset: "50", lag: "50" },
    ]);
  });

  it("admin 연결을 항상 정리한다(성공/실패 모두)", async () => {
    fetchTopicOffsets.mockResolvedValue([]);
    fetchOffsets.mockRejectedValueOnce(new Error("broker down"));

    const { getKafkaLag } = await import("./kafka.js");
    await expect(getKafkaLag()).rejects.toThrow("broker down");

    expect(disconnect).toHaveBeenCalled();
  });
});
