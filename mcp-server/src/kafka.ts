import { Kafka } from "kafkajs";

// k8s에서는 KAFKA_BOOTSTRAP_SERVERS 환경변수로 Kafka Service 주소를 주입한다
const kafka = new Kafka({
  clientId: "mcp-server",
  brokers: [process.env.KAFKA_BOOTSTRAP_SERVERS ?? "localhost:9092"],
});

const TOPIC = "payment.events";
const GROUP_ID = "db-writer-consumer-group";

/**
 * Kafka Admin API로 컨슈머 그룹의 파티션별 Lag(밀린 메시지 수)을 직접 계산한다.
 * Lag = 파티션의 최신 오프셋(topicOffsets) - 컨슈머가 마지막으로 커밋한 오프셋(groupOffsets).
 * Prometheus/Kafka Exporter가 이미 같은 값을 노출하고 있지만, 여기서는 MCP 서버가
 * KafkaJS Admin API를 직접 써서 프로토콜 레벨에서 계산하는 방식을 보여준다.
 */
export async function getKafkaLag() {
  const admin = kafka.admin();
  await admin.connect();
  try {
    const groupOffsets = await admin.fetchOffsets({ groupId: GROUP_ID, topics: [TOPIC] });
    const topicOffsets = await admin.fetchTopicOffsets(TOPIC);

    const latestByPartition = new Map<number, bigint>(
      topicOffsets.map((o) => [o.partition, BigInt(o.offset)])
    );

    const partitions = groupOffsets
      .flatMap((g) => g.partitions)
      .map((p) => {
        const committed = BigInt(p.offset === "-1" ? "0" : p.offset);
        const latest = latestByPartition.get(p.partition) ?? 0n;
        const lag = latest - committed;
        return {
          partition: p.partition,
          committedOffset: committed.toString(),
          latestOffset: latest.toString(),
          lag: lag.toString(),
        };
      })
      .sort((a, b) => a.partition - b.partition);

    return { topic: TOPIC, groupId: GROUP_ID, partitions };
  } finally {
    await admin.disconnect();
  }
}
