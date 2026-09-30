// 테스트 파일을 대시보드 번들에 통째로 박아넣지 않고, 저장소 경로만 여기 적어두면
// TestsPage가 GitHub raw content를 그때그때 fetch해서 보여준다 - 테스트 코드가 바뀔 때마다
// 대시보드를 다시 빌드/배포할 필요 없이 항상 실제 커밋된 최신 내용을 그대로 보여주기 위함.
// (testCount/summary만 사람이 갱신 - phases.ts/improvements.ts와 같은 철학)
export interface TestFile {
  path: string; // 저장소 루트 기준 상대 경로
  testCount: number;
  summary: string;
}

export interface TestSuite {
  service: string;
  language: "Java" | "TypeScript" | "Python";
  files: TestFile[];
}

export const GITHUB_REPO = "tjsal89000/2026_-Portfolio";
export const GITHUB_BRANCH = "main";

export const TEST_SUITES: TestSuite[] = [
  {
    service: "payment-api",
    language: "Java",
    files: [
      {
        path: "payment-api/src/test/java/com/aiops/paymentapi/web/PaymentControllerTest.java",
        testCount: 5,
        summary:
          "MockMvc + MockitoBean으로 컨트롤러 계층만 분리 검증: 정상 요청 202, Kafka 발행 실패 503, " +
          "Bean Validation 실패(빈 idempotencyKey/0 이하 금액/통화코드 길이) 시 400과 producer 미호출.",
      },
      {
        path: "payment-api/src/test/java/com/aiops/paymentapi/kafka/PaymentEventProducerTest.java",
        testCount: 4,
        summary:
          "Mockito로 KafkaTemplate을 목킹해 발행 로직 검증: accountId를 파티션 키로 전송, requestedAt을 " +
          "서버가 직접 채움, 전송 실패/타임아웃/인터럽트가 모두 PaymentEventPublishException으로 매핑.",
      },
    ],
  },
  {
    service: "db-writer-consumer",
    language: "Java",
    files: [
      {
        path: "db-writer-consumer/src/test/java/com/aiops/dbwriter/kafka/PaymentEventListenerTest.java",
        testCount: 3,
        summary:
          "멱등성 처리의 핵심인 '언제 Kafka 오프셋을 커밋하느냐'를 검증: 저장 성공/DB UNIQUE 제약으로 걸러진 " +
          "중복 모두 커밋하지만, 그 외 진짜 실패(DB 연결 끊김 등)는 커밋을 보류해 재처리되게 하는지 확인.",
      },
    ],
  },
  {
    service: "gateway",
    language: "TypeScript",
    files: [
      {
        path: "gateway/src/paymentProxy.test.ts",
        testCount: 3,
        summary:
          "vitest로 opossum 서킷브레이커 검증(fetch를 목킹): 정상 응답 통과, payment-api가 준 에러도 " +
          "fallback이 503으로 감싸버리는 실제 동작 확인, payment-api 무응답 시 타임아웃으로 503 폴백.",
      },
      {
        path: "gateway/src/webhookRelay.test.ts",
        testCount: 1,
        summary: "ioredis를 목킹해 n8n webhook을 payment:alerts:live 채널로 그대로 발행하는지 검증.",
      },
    ],
  },
  {
    service: "mcp-server",
    language: "TypeScript",
    files: [
      {
        path: "mcp-server/src/kafka.test.ts",
        testCount: 2,
        summary:
          "kafkajs Admin API를 목킹해 파티션별 lag(최신 오프셋-커밋 오프셋) 계산과, 커밋 이력이 " +
          "없는 파티션(offset '-1')을 0으로 취급하는지, admin 연결을 항상 정리하는지 검증.",
      },
      {
        path: "mcp-server/src/redis.test.ts",
        testCount: 2,
        summary:
          "ioredis를 목킹하고 시간을 고정해 TPS/에러율 집계 로직 검증: windowSeconds만큼의 버킷 키로 " +
          "MGET하는지, 처리 건수 0일 때 0으로 나누지 않고 에러율을 0으로 두는지.",
      },
      {
        path: "mcp-server/src/db.test.ts",
        testCount: 3,
        summary:
          "pg Pool을 목킹해 SQL 인젝션 방지의 핵심인 동적 파라미터 바인딩을 검증: 필터 유무에 따라 " +
          "$1/$2 자리가 정확히 밀리고, LLM 에이전트가 넘기는 값이 항상 파라미터로만 들어가는지 확인.",
      },
    ],
  },
  {
    service: "ws-server",
    language: "TypeScript",
    files: [
      {
        path: "ws-server/src/infra.test.ts",
        testCount: 2,
        summary:
          "AWS SDK/@kubernetes/client-node를 목킹해 인프라 현황 매핑 로직 검증: terminated 인스턴스 " +
          "제외, Name 태그 없을 때 빈 문자열 처리, Pod ready/재시작 집계와 상태 누락 시 기본값 처리.",
      },
      {
        path: "ws-server/src/payments.test.ts",
        testCount: 1,
        summary: "pg를 목킹해 snake_case DB 행을 camelCase로 변환하고 status를 APPROVED로 채우는지 검증.",
      },
    ],
  },
];
