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
  {
    service: "anomaly-detector",
    language: "Python",
    files: [
      {
        path: "agents/anomaly-detector/test_kafka_watcher.py",
        testCount: 8,
        summary:
          "콘텐츠 기반 이상탐지의 두 판정 함수를 pytest로 직접 검증(Kafka 연결 없이 순수 함수 호출): " +
          "반복요청 임계치/윈도우 밖 요청 제외, KR·CARD 쏠림은 정상으로 보고 그 외 국가/결제수단 " +
          "쏠림만 잡는지.",
      },
      {
        path: "agents/anomaly-detector/test_alerts.py",
        testCount: 5,
        summary:
          "n8n 웹훅 발송 게이트 두 가지 검증(is_enabled/시간을 목킹): 알림 꺼짐이면 미발송, 같은 " +
          "유형은 쿨다운(15초) 안에 재발송 안 함, 쿨다운 지나면 재발송, 웹훅 실패해도 예외가 " +
          "밖으로 새지 않는지.",
      },
    ],
  },
  {
    service: "traffic-generator",
    language: "Python",
    files: [
      {
        path: "agents/traffic-generator/test_main.py",
        testCount: 4,
        summary:
          "정상 결제 페이로드 생성 함수 검증: 인자로 값을 주면 그대로 쓰고, 안 주면 정의된 범위/풀 " +
          "안에서만 채우는지, idempotencyKey가 매번 다른 UUID인지.",
      },
    ],
  },
  {
    service: "report-agent",
    language: "Python",
    files: [
      {
        path: "agents/report-agent/test_main.py",
        testCount: 4,
        summary:
          "MCP 도구 스키마를 Gemini 함수 선언으로 바꾸는 변환 로직 검증: Gemini가 모르는 " +
          "$schema/additionalProperties 키 제거, inputSchema·description 누락 시 기본값 처리.",
      },
      {
        path: "agents/report-agent/test_db.py",
        testCount: 1,
        summary: "psycopg2.connect를 목킹해 리포트가 파라미터 바인딩으로 INSERT되고 커밋되는지 검증.",
      },
    ],
  },
];
