# AIOps 결제 트래픽 관제 플랫폼 — 워크플로우

이전 프로젝트(`portfolio-payment-platform`)가 "결제 이벤트를 Kafka로 안정적으로 처리하는 백엔드/인프라"에 집중했다면, 이 프로젝트는 그 위에 **자동화(n8n)와 AI 에이전트, 그리고 그걸 눈으로 보는 웹 대시보드**를 얹는다. Kafka와 Redis도 다시 쓰되, 이전 프로젝트와 똑같이 반복하지 않도록 **각자 역할을 명확히 분리**해서 "왜 이 컴포넌트를 여기 썼는지" 설명 가능하게 만든다 (자세한 이유는 바로 아래 "왜 Kafka와 Redis를 같이 쓰는가" 참고).

**이번엔 혼자 만들지 않는다.** 각 Phase 끝에 "같이 짤 부분"을 표시해뒀다. 그 부분은 코드를 통째로 만들어주지 않고, 구조를 같이 잡고 실제 구현은 함께 진행한다. 면접에서 "왜 이렇게 했어요?"라는 질문에 바로 답할 수 있어야 하는 게 이 문서의 전제다.

---

## 프로젝트 목표

1. 가상의 결제 플랫폼에 **가짜 트래픽(정상 + 이상 패턴)**을 자동으로 흘려보낸다.
2. **이상탐지/장애대응 에이전트**가 이 트래픽을 실시간으로 감시하다가 이상 징후를 감지하면 **n8n 워크플로우**를 트리거해 알림/대응 액션을 실행한다.
3. **AI 분석 에이전트**가 주기적으로 트래픽·장애 데이터를 요약해 사람이 읽을 수 있는 리포트를 만든다.
4. 이 모든 흐름(트래픽 유입 → 처리 → 이상탐지 → 알림 → 리포트)을 **웹 대시보드**에서 실시간으로 확인할 수 있다.
5. 전체를 컨테이너화해서 **Terraform으로 만든 EC2 + k3s** 위에 자동으로 배포되게 한다.

---

## 왜 Kafka와 Redis를 같이 쓰는가 (면접 대비 핵심 논리)

같은 "메시징/저장" 역할처럼 보이지만 둘의 목적이 다르다는 걸 구분해서 쓰는 게 이 프로젝트의 설계 포인트다.

- **Kafka = 내구성 있는 이벤트 로그(source of truth)**. 결제 이벤트 하나하나가 유실 없이 저장되고, 여러 소비자(DB 저장용 Consumer, 이상탐지 에이전트)가 각자 독립적으로 같은 스트림을 읽을 수 있어야 한다. "이 이벤트가 실제로 있었는가"를 보장하는 계층.
- **Redis = 휘발성 실시간 상태/캐시**. "지금 이 순간의 TPS", "최근 1분간 에러율" 같은 값은 매번 DB를 조회하기엔 느리고, Kafka에 다시 물어보기도 적절하지 않다(Kafka는 집계 질의에 맞는 도구가 아님). 이런 값은 Redis에 카운터로 올려두고 빠르게 읽고 쓴다. 또한 Redis Pub/Sub으로 대시보드에 실시간 이벤트를 밀어줘서, 대시보드가 DB를 계속 폴링하지 않아도 되게 한다.

정리하면: **"이 이벤트가 정말 일어났는가"는 Kafka, "지금 상황이 어떤가"는 Redis**가 답한다. 이 구분을 못 하면 "그냥 둘 다 써봤어요"로 들리니, Phase 진행하면서 이 논리를 계속 검증하며 간다.

---

## MSA(마이크로서비스 아키텍처) 원칙과 보강 요소 (면접 대비 핵심 논리)

이 프로젝트는 이미 MSA의 핵심 특성을 따르고 있다: 서비스별 독립 배포(payment-api/db-writer-consumer/에이전트들/게이트웨이가 각자 별도 프로세스·이미지), 서비스별 DB 소유(Postgres는 db-writer-consumer만 직접 접근), Kafka를 통한 비동기 느슨한 결합. 여기에 "MSA를 실제로 운영해본 사람"이라는 걸 보여주는 3가지 표준 패턴을 추가한다.

- **분산 트레이싱(OpenTelemetry + Grafana Tempo)**: 요청 하나가 payment-api → Kafka → db-writer-consumer → Redis를 거치는 동안, 어느 구간에서 얼마나 시간이 걸렸는지 하나의 trace로 이어 붙여서 본다. MSA의 고질적 문제 - "장애가 났는데 어느 서비스가 원인인지 각 서비스 로그를 따로 뒤져야 하는 문제" - 를 해결하는 표준 도구다. Prometheus(메트릭)+Tempo(트레이스)를 같은 Grafana에 붙여서, 이미 만든 "운영자 관점 대시보드"를 관측성 3요소(메트릭/로그/트레이스) 중 두 가지까지 갖추게 한다.
- **API Gateway 패턴 강화 (Phase 9에서 적용)**: 지금 계획된 TypeScript 게이트웨이를 "n8n 웹훅만 받는 존재"에서 "외부에서 들어오는 모든 요청의 단일 진입점"으로 확장한다. 클라이언트/트래픽 생성 에이전트가 payment-api를 직접 호출하지 않고 게이트웨이를 거치게 해서, 라우팅/인증 같은 공통 관심사를 한 곳에 모은다.
- **회복력 패턴(Resilience4j - Retry/Circuit Breaker)**: 지금 payment-api가 Kafka에 발행할 때 한 번 시도해서 실패하면 바로 503을 응답하는데, 일시적인 네트워크 문제라면 재시도로 해결될 수 있다. Retry(짧은 재시도)와 Circuit Breaker(반복 실패 시 아예 빠르게 실패 처리해서 스레드가 계속 5초씩 대기하며 묶이는 것을 방지)를 추가해, 한 컴포넌트의 장애가 전체로 번지는 것(cascading failure)을 막는 MSA 표준 패턴을 증명한다.

---

## 왜 3개 언어를 섞어 쓰는가 (면접 대비 핵심 논리)

언어마다 강점이 뚜렷한 영역이 있어서, 그 영역에 맞춰 배치했다. "여러 개 써봤다"가 아니라 "각 언어가 왜 그 자리에 있는지" 설명할 수 있어야 한다.

- **Java(Spring Boot) = 돈이 걸린 핵심 트랜잭션**. 결제 API(Kafka Producer)와 DB Writer Consumer가 여기 해당. 강타입, 트랜잭션 안정성, JPA 생태계가 결제 도메인에 맞고, 실무에서도 결제/정산 시스템은 Java/Spring이 사실상 표준이다.
- **Python = 판단/분석/AI**. 트래픽 생성, 이상탐지, AI 요약 리포트 3개 에이전트. LLM SDK와 데이터 처리 라이브러리가 풍부해서 "정보를 수신해 판단하고 생성하는" 작업에 강하다.
- **TypeScript(Node.js) = 실시간 I/O와 외부 연동**. n8n 웹훅 등 외부에서 들어오는 요청을 받는 게이트웨이, 대시보드 WebSocket 서버, 그리고 대시보드 프론트엔드. Node.js의 비동기 I/O 모델이 다수의 실시간 커넥션을 동시에 처리하는 데 강점이 있다.

---

## 왜 대시보드가 두 개인가 — 커스텀 React 대시보드 vs Grafana (면접 대비 핵심 논리)

이 프로젝트는 "이상탐지만 보여주는 화면"이 아니다. **평소엔 정상적으로 잘 돌아가고 있다는 것 자체를 보여주는 것**도 목표고, 그 위에 이상 상황을 감지해서 알려주는 게 더해지는 구조다. 그래서 관측 대시보드를 목적에 따라 두 개로 나눈다.

- **커스텀 React 대시보드 = 비즈니스/스토리텔링 관점**. "지금 결제 트래픽이 이렇게 흐르고 있다", "AI가 이렇게 요약했다" 같은, 이 서비스 자체의 동작을 보여주는 화면. 면접관에게 프론트엔드/실시간 데이터 시각화 역량을 보여주는 결과물.
- **Grafana = 운영자/인프라 관점**. "API가 살아있는가(uptime)", "초당 요청 수", "Kafka Consumer Lag" 같은 표준 인프라 지표. Spring Boot Actuator + Micrometer가 `/actuator/prometheus`로 지표를 내보내면 Prometheus가 긁어가고, Grafana가 그걸 그래프로 보여주는 **실무에서 그대로 쓰이는 조합**이다. 이전 K8s 프로젝트에서 kube-prometheus-stack으로 이미 증명한 패턴을 이번엔 Spring Boot 애플리케이션 지표 쪽으로 다시 적용하는 것.

정리하면: **"서비스가 무엇을 하고 있는가"는 React 대시보드, "서비스가 건강한가"는 Prometheus/Grafana**가 답한다. 둘 다 필요하고, 서로 대체재가 아니다.

---

## 아키텍처 개요

```mermaid
flowchart TD
    subgraph AGENTS["에이전트 계층 (Python)"]
        TG["트래픽 생성 에이전트\n가짜 결제 이벤트 생성(정상/이상 패턴)"]
        AD["이상탐지 에이전트\nRedis 카운터 감시 + Kafka 직접 구독"]
        RPT["AI 분석/요약 리포트 에이전트\nLLM 호출, MCP로 데이터 조회"]
    end

    MCP["MCP 서버 (TypeScript)\nKafka Lag/Redis 카운터/Postgres 조회 도구"]
    KAFKA -.도구.-> MCP
    REDIS -.도구.-> MCP
    DB -.도구.-> MCP
    MCP -.tool call.-> RPT

    TG -->|"POST /payments"| API["결제 API (Java/Spring Boot)\nKafka Producer"]
    API -->|"publish"| KAFKA["Kafka\npayment.events 토픽\n(내구성 있는 이벤트 로그)"]

    KAFKA --> DBW["DB Writer Consumer (Java/Spring Boot)\n멱등성 저장(이전 프로젝트 패턴 재사용)"]
    DBW --> DB[("PostgreSQL\n이벤트/리포트 저장")]
    DBW -->|"카운터 갱신 + publish"| REDIS[("Redis\n실시간 카운터 + Pub/Sub")]

    KAFKA -->|"직접 구독(콘텐츠 기반 룰)"| AD
    REDIS -->|"카운터 조회(TPS/에러율 임계치)"| AD
    AD -->|"이상 감지 시 webhook"| N8N["n8n\n워크플로우 자동화"]
    N8N -->|"알림/대응 액션"| ALERT["Slack 등 알림 채널"]
    N8N -->|"webhook"| GW["게이트웨이 (TypeScript/Node.js)\n외부 API·웹훅 수신"]

    DB --> RPT
    N8N -->|"주기적 트리거"| RPT
    RPT -->|"리포트 저장"| DB

    REDIS -->|"Pub/Sub 구독"| WS["대시보드 WebSocket 서버 (TypeScript/Node.js)"]
    GW --> WS
    DB --> WS
    WS --> WEB["웹 대시보드 (TypeScript)\n실시간 트래픽 플로우 + 알림 + 리포트"]

    API -.|"/actuator/prometheus"|.-> PROM["Prometheus"]
    DBW -.|"/actuator/prometheus"|.-> PROM
    KAFKA -.exporter.-> PROM
    PROM --> GRAF["Grafana\n운영자 관점 대시보드"]

    subgraph INFRA["EC2 (Terraform 프로비저닝) + k3s"]
        API
        KAFKA
        DBW
        DB
        REDIS
        N8N
        TG
        AD
        RPT
        MCP
        GW
        WS
        WEB
        PROM
        GRAF
    end
```

---

## 기술 스택

| 영역 | 언어/기술 | 역할 (왜 쓰는지) |
|---|---|---|
| 결제 API | **Java 17 + Spring Boot** (Spring for Apache Kafka) | 요청 검증 후 Kafka로 publish만 담당. 돈이 걸린 핵심 트랜잭션이라 강타입/안정성 우선 |
| DB Writer Consumer | **Java 17 + Spring Boot** (Spring Kafka, Spring Data JPA, Spring Data Redis) | Kafka 이벤트를 멱등성 있게 Postgres 저장 + Redis 카운터 갱신 |
| 트래픽 생성 / 이상탐지 / AI 리포트 에이전트 | **Python** (+ Claude API) | 정보 수신 후 판단·생성하는 로직. LLM/데이터 처리 생태계 활용 |
| 외부 API/웹훅 게이트웨이 | **TypeScript + Node.js** (Express/Fastify) | n8n 등 외부에서 들어오는 요청 수신, 비동기 I/O에 강점 |
| 대시보드 WebSocket 서버 | **TypeScript + Node.js** | Redis Pub/Sub 구독 → 브라우저로 실시간 relay |
| 대시보드 프론트엔드 | **TypeScript + React** | 실시간 트래픽 플로우 시각화 |
| 이벤트 로그 | Kafka | "이 결제 이벤트가 실제로 발생했다"를 보장하는 내구성 계층, 여러 Consumer가 독립적으로 구독 |
| 실시간 상태/캐시 | Redis | TPS/에러율 같은 휘발성 실시간 카운터 + 대시보드용 Pub/Sub |
| 워크플로우 자동화 | n8n | 이상탐지 웹훅 수신, 알림 발송, 리포트 에이전트 스케줄 트리거 |
| DB | PostgreSQL (컨테이너) | 이벤트 로그 + 리포트 저장, RDS 대신 컨테이너로 운영(이전 프로젝트 ADR-6과 동일한 결정) |
| 메트릭 노출 | Spring Boot Actuator + Micrometer | `/actuator/prometheus`로 표준 포맷 지표 노출 (실무 표준 조합) |
| 메트릭 수집 | Prometheus | Java 서비스 + Kafka Exporter 지표 스크랩 |
| 분산 트레이싱 | Micrometer Tracing + OpenTelemetry, Grafana Tempo | 서비스 간 요청 흐름을 하나의 trace로 연결, MSA 장애 원인 추적 |
| 회복력 패턴 | Resilience4j | Kafka 발행 실패 시 Retry + Circuit Breaker로 cascading failure 방지 |
| 운영 대시보드 | Grafana | Prometheus(메트릭)+Tempo(트레이스)를 운영자 관점 그래프로 시각화 |
| 인프라 프로비저닝 | Terraform | EC2 인스턴스 생성, user_data로 Docker+k3s 설치까지 자동화 |
| 오케스트레이션 | k3s (경량 Kubernetes) | 단일 노드, 이전 EKS 경험을 재사용하되 훨씬 가볍게 |
| 컨테이너 | Docker | 모든 컴포넌트(Java 2종 + Python 3종 + TypeScript 3종 + Prometheus/Grafana) 이미지화 |

> **미정 사항(Phase 3에서 같이 결정)**: Kafka를 이전 프로젝트처럼 Strimzi Operator로 운영할지, 아니면 단일 EC2에서는 오퍼레이터 없이 가벼운 단일 브로커 컨테이너로 갈지. Strimzi 경험은 이전 프로젝트에서 이미 증명했으니, 이번엔 리소스 절약을 위해 후자로 갈 가능성이 높음 — 하지만 이것도 "왜 그렇게 결정했는지" 이유를 남겨야 하는 부분이라 미리 결론 내지 않는다.

---

## Phase별 계획

### Phase 0 — 준비
- [x] 로컬에 n8n 실행 환경 확인 (Docker로 띄우기)
- [x] LLM API 키 발급/확인 (AI 에이전트용) — Claude API는 카드 등록 후 선불 크레딧 충전 방식이라 예산 제약상 보류, Google AI Studio에서 카드 등록 없이 발급되는 Gemini 무료 티어 키로 대체 확정 (Phase 8에서 사용)
- [x] 로컬 Java(17+)/Node.js/Python 개발 환경 확인
- [x] 폴더 구조 확정 (아래 "폴더 구조" 참고)
- **같이 할 부분**: 폴더 구조와 각 컴포넌트 이름을 같이 정한다. ✅ 완료

### (순서 변경) Phase 10 일부 선행 — 대시보드 UI 뼈대
계획보다 앞당겨서, 실제 데이터 연동 전 UI 뼈대(더미 데이터)부터 만듦. Vite+React+TS+MUI, AWS 색감(Squid Ink 네이비 + 오렌지) 테마, 라이트/다크 모드 토글까지 완료. Redis Pub/Sub 연동 등 실제 데이터 배선은 뒤에서 Phase 10을 다시 다룰 때 마저 진행.

### Phase 1 — 결제 API [Java/Spring Boot] (Kafka Producer) ✅ 완료
- [x] `POST /payments` 로 이벤트를 받아 검증 후 Kafka로 publish
- [x] Actuator + Micrometer + Prometheus 엔드포인트(`/actuator/health`, `/actuator/prometheus`) 확인
- [x] 로컬 Kafka(docker-compose)로 실제 발행 확인 + ISO-8601 타임스탬프 포맷 검증
- **같이 할 부분**: 이벤트 스키마 설계 — 정상 vs 이상 이벤트를 구분할 필드(예: amount 이상치, 짧은 시간 내 동일 계좌 반복 요청, 특정 국가 집중 등)를 같이 정의. ✅ 완료 (paymentMethod 포함 확정)
- 실제로 겪은 문제: [문제해결_로그.md](./docs/문제해결_로그.md) [1]번 (Jackson 누락 + epoch 타임스탬프)

### Phase 2 — DB Writer Consumer [Java/Spring Boot] + Redis 카운터 ✅ 완료
- [x] Kafka Consumer가 이벤트를 멱등성 있게 Postgres에 저장 (이전 프로젝트의 UNIQUE 제약 패턴 재사용, MANUAL AckMode)
- [x] 저장 성공 시 Redis에 초단위 버킷 카운터 갱신 + Pub/Sub(`payment:events:live`)으로 이벤트 발행
- [x] 전체 흐름 실시간 검증: API POST → Kafka → DB row 생성 + Redis 카운터 증가 + Pub/Sub 메시지 수신
- **같이 할 부분**: Redis 카운터 설계 — ✅ 완료, "초 단위 버킷 카운터"(기업 실무에서 흔한 방식) 채택. TTL 단일키(계단현상)와 Sorted Set(무거움) 둘 다의 단점을 피함

### Phase 3 — Kafka + Redis + 관측성(Prometheus/Grafana/Tempo) + 회복력 인프라 구축 ✅ 완료
- [x] Kafka 배포 방식 결정 — Strimzi Operator 대신 플레인 컨테이너 채택 (단일 브로커라 오퍼레이터 이점이 없음, [ADR-3](./docs/ADR.md#adr-3-kafka-배포-방식-strimzi-operator-대신-플레인-컨테이너))
- [x] Redis 컨테이너 배포 (Phase 2에서 이미 완료)
- [x] Prometheus 컨테이너 배포, payment-api/db-writer-consumer의 `/actuator/prometheus` 스크랩 설정
- [x] Kafka Exporter 배포 (danielqsj/kafka-exporter), Prometheus 스크랩 확인
- [x] Grafana Tempo 컨테이너 배포, payment-api/db-writer-consumer에 OpenTelemetry SDK 수동 배선(자동설정 부재로 인해) 해서 trace 전송 — 두 서비스에 걸친 trace 하나로 연결되는 것까지 실제 검증 완료 ([문제해결_로그.md](./docs/문제해결_로그.md) [2]번)
- [x] Resilience4j로 payment-api의 Kafka 발행부에 Retry + Circuit Breaker 적용 (컴파일/기동 확인)
- [x] Grafana 컨테이너 배포, Prometheus+Tempo 데이터소스 자동 프로비저닝 + 대시보드(payment-platform.json) 코드로 등록 완료 (서비스 상태/요청처리량/지연시간/Kafka Lag/Kafka Listener 처리량/JVM 메모리/트레이스 안내 패널)
  - 참고: Resilience4j의 Micrometer 메트릭 자동 바인딩(`resilience4j_circuitbreaker_*`)은 이 Spring Boot 버전에서 AutoConfiguration.imports에 등록은 되어 있는데 실제로 빈이 안 만들어지는 걸 확인함 — 재시도/서킷브레이커 로직 자체(및 트레이싱 span)는 정상 동작하지만 그 상태를 메트릭으로 노출하는 부분만 안 됨. 시간 관계상 대시보드 패널은 확실히 동작하는 `spring_kafka_listener_seconds`로 대체하고 이 갭은 기록만 해둠
- **같이 할 부분**: Resilience4j의 재시도 횟수/서킷브레이커 임계치 — 초기값(재시도3회/실패율50%)으로 우선 진행, 필요시 조정

### (추가) nginx 리버스프록시로 전체 통합 진입점 구성
서비스가 5개 포트(5173/3000/9090/5678/8080)로 흩어져 있어서, `http://localhost` 하나로 묶는 nginx를 앞단에 추가함 (Phase 9 API Gateway 개념을 인프라 레벨에서 미리 적용).

- `/` → `/dashboard/`로 리다이렉트
- `/dashboard/` → React 대시보드(Vite, `base:'/dashboard/'` 설정)
- `/grafana/` → Grafana(`GF_SERVER_SERVE_FROM_SUB_PATH=true`)
- `/n8n/` → n8n
- `/prometheus/` → Prometheus(`--web.route-prefix=/prometheus/`)
- `/api/` → payment-api

겪은 문제: nginx `proxy_pass`에 trailing slash(`http://host:port/`)를 붙이면 location 프리픽스를 벗겨내고 전달하는데, Vite(`base`)와 Grafana(`serve_from_sub_path`)는 반대로 프리픽스가 유지된 채로 오는 걸 기대해서 무한 리다이렉트 루프가 생겼음. `proxy_pass`에서 trailing slash를 빼서(경로 없이 host:port만) 원본 URI를 그대로 전달하도록 고쳐 해결.

### Phase 4 — MCP 서버 구축 [TypeScript/Node.js] ✅ 완료
Phase 2(DB Writer)·Phase 3(Kafka+Redis) 뒤에 놓은 이유: 쿼리할 실제 데이터가 있어야 의미가 있어서.

- [x] Kafka Consumer Lag 조회 도구 (`get_kafka_lag` - KafkaJS Admin API로 직접 계산, Prometheus 값 재사용 안 함)
- [x] Redis 카운터(TPS/에러율) 조회 도구 (`get_realtime_metrics`)
- [x] Postgres 이벤트/리포트 조회 도구 (`query_recent_payments`, `get_payment_summary`) — read-only, SQL 파라미터 바인딩으로 인젝션 방지
- [x] 로컬 개발 환경의 Claude Code에 이 MCP 서버를 연결 — 프로젝트 `.mcp.json`에 `http://localhost:8090/mcp` 등록 (Streamable HTTP transport)
- [ ] Phase 8(AI 분석 리포트 에이전트)이 같은 MCP 서버를 도구로 사용하게 연결 — Phase 8에서 진행
- **같이 할 부분**: 도구 4개 확정, Streamable HTTP 방식 확정(기업이 원격/프로덕션 MCP 서버에 채택하는 표준 방식). 4개 도구 전부 실제 데이터로 호출 검증 완료 (get_kafka_lag: 3개 파티션 lag=0, get_payment_summary: 11건/689,344원 등)

### Phase 5 — 트래픽 생성 에이전트 [Python] ✅ 완료
- [x] 평상시엔 정상 패턴 트래픽을 자동 생성 (API로 POST, 계좌풀 100개/국가·결제수단 가중분포)
- [x] 주기적으로 "이상 패턴" 3종을 섞어서 생성 (반복요청/고액이상치/쏠림)
- [x] 실행 후 MCP 서버(`get_realtime_metrics`)로 실제 데이터 반영 확인 (TPS 5.1, 30초간 153건, 에러 0%) — Grafana/대시보드가 이제 실시간으로 움직임
- **같이 할 부분**: 이상 패턴 시나리오 확정 (반복요청/고액이상치/쏠림) ✅ 완료

### Phase 6 — 이상탐지/장애대응 에이전트 [Python] ✅ 완료
- [x] Redis 카운터를 폴링해 임계치 기반 이상탐지 (TPS 급증: 평소 3배 이상, 에러율 상승: 5% 초과)
- [x] Kafka를 별도 Consumer Group("anomaly-detector-group")으로 직접 구독해 콘텐츠 기반 이상탐지 (고액이상치 500만원 초과, 반복요청 10초/5회, 쏠림 20건 중 50%)
- [x] 이상 감지 시 n8n webhook(`/webhook/payment-anomaly`)으로 POST + 같은 유형 알림 15초 쿨다운
- [x] 실제 트래픽으로 4개 유형 전부 검증 완료 (고액이상치·반복요청·쏠림-국가·쏠림-결제수단)
- **같이 할 부분**: 임계치 기준 확정 ✅ 완료. n8n 워크훅은 아직 없어서 404가 나지만 예외로 안 잡혀 에이전트는 계속 정상 동작 (Phase 7에서 실제 수신 연결)

### Phase 7 — n8n 워크플로우 ✅ 완료
- [x] n8n 컨테이너 실행, webhook 노드로 이상탐지 이벤트 수신 (`/webhook/payment-anomaly`, 200 확인)
- [x] 알림 워크플로우 구성 (Webhook → Edit Fields → HTTP Request로 Slack Incoming Webhook 호출). 보너스로 대시보드 사이드바에 알림 on/off 토글도 추가(Redis `alerts:enabled` 키 공유, 이상탐지 에이전트의 `control_server.py`가 상태 서빙) — 현재는 사용자 요청으로 꺼둔 상태, 필요할 때 대시보드에서 다시 켜면 됨
- [x] 스케줄 트리거로 리포트 에이전트 주기 실행 — Schedule Trigger(10분 간격) → HTTP Request로 `POST http://host.docker.internal:8092/generate` 호출, `reports` 테이블에 새 행 쌓이는 것까지 실제 확인 완료
- **같이 할 부분**: n8n은 노코드 툴이라 화면 보면서 같이 워크플로우 노드 연결 ✅ 완료. n8n 컨테이너 안에서는 `localhost`가 n8n 자신을 가리켜 호스트 서비스 호출 시 `host.docker.internal`을 써야 한다는 것도 실제로 겪으며 확인 (Slack 웹훅은 외부 주소라 문제 없었음)

### Phase 8 — AI 분석/요약 리포트 에이전트 [Python] ✅ 완료
- [x] Phase 4의 MCP 서버를 도구(tool/function calling)로 사용해 최근 트래픽/이상탐지 로그 조회 — DB 직접 쿼리 대신 MCP 서버를 거치는 방식으로 확정. 이 프로젝트에서 MCP 서버를 만든 이유("Claude Code뿐 아니라 여러 AI 에이전트가 재사용할 수 있는 도구 계층")를 이 에이전트가 두 번째 소비자로서 실제로 증명
- [x] LLM(Google Gemini)으로 요약 요청, 결과를 Postgres `reports` 테이블에 저장 — 원래는 Claude API로 계획했으나 API 콘솔이 카드 등록 후 선불 크레딧 충전 방식이라 포트폴리오 예산 제약상 카드 등록 없이 발급되는 Gemini 무료 티어로 대체. 도구 호출 구조는 표준(JSON Schema 기반 function calling)이라 실무라면 사내 표준 LLM으로 그대로 교체 가능
- [x] 실제 실행 검증 완료: `get_realtime_metrics`/`get_payment_summary`/`get_kafka_lag` 도구를 호출해 실제 데이터(TPS 5.33, 에러율 0%, Kafka Lag 0 등)로 4단계 형식(트래픽 현황/이상 징후/시스템 상태/종합 의견) 리포트 생성, `reports.id=1`로 저장 확인
- [x] n8n Schedule Trigger가 호출할 수 있도록 `POST /generate` 트리거 서버(포트 8092) 구현 + nginx `/report/`로 노출 (Phase 7의 "스케줄 트리거로 리포트 에이전트 주기 실행" 항목과 연결됨 — 실제 n8n 노드 연결은 Phase 7에서 마저 진행)
- **같이 할 부분**: 프롬프트 설계 ✅ 완료, MCP 도구 호출 방식 확정 ✅ 완료. 겪은 문제는 [문제해결_로그.md](./docs/문제해결_로그.md) [4]번 참고
- 실제로 겪은 문제: [문제해결_로그.md](./docs/문제해결_로그.md) [4]번 (모델 세대 교체/구세대 SDK의 thought_signature 미지원/무료 티어 과부하 3중 디버깅)

### Phase 9 — API Gateway [TypeScript/Node.js] (MSA 보강) ✅ 완료
단순 웹훅 수신기가 아니라, **외부에서 들어오는 모든 요청의 단일 진입점**으로 확장한다 (트래픽 생성 에이전트도 payment-api를 직접 호출하지 않고 이 게이트웨이를 거치게 변경).

- [x] `/api/payments` 라우팅 추가 - 게이트웨이(포트 8095)가 내부 payment-api(8080)로 프록시, `opossum`(Node.js 서킷브레이커 라이브러리)으로 회복력 패턴 적용 (Java 쪽 Resilience4j의 Kafka 발행부 Retry/CircuitBreaker와 대칭되는, "payment-api 자체가 느려질 때"에 대한 Node.js 쪽 보강). nginx `/api/` location도 payment-api 직결에서 게이트웨이 경유로 변경, 트래픽 생성 에이전트의 기본 호출 주소도 `http://localhost/api/payments`로 변경 완료 — nginx → 게이트웨이 → payment-api 전체 체인 실제 요청으로 검증(202 확인)
- [x] n8n 등 외부에서 오는 webhook을 받는 엔드포인트 구현 (`POST /webhook/alert-relay`)
- [x] 받은 이벤트를 WebSocket 서버로 relay — WebSocket 서버가 아직 없으므로(Phase 10에서 구축) 직접 연결 대신 Redis Pub/Sub 채널(`payment:alerts:live`)로 발행하는 느슨한 결합 구조로 구현. Phase 10에서 WebSocket 서버가 이 채널을 구독하면 바로 연결됨. n8n 쪽에 이 엔드포인트를 호출하는 노드 연결은 WebSocket 서버가 생긴 뒤(Phase 10) 의미가 있어 보류
- **같이 할 부분**: 게이트웨이와 WebSocket 서버 프로세스 분리 확정(합치지 않고 독립 프로세스로), 라우팅 규칙(`/api/payments`, `/webhook/alert-relay`) 정의 ✅ 완료

### Phase 10 — 웹 대시보드 [TypeScript/React + Node.js] ✅ 완료
- [x] Redis Pub/Sub을 구독하는 WebSocket 서버(`ws-server/`, 포트 8096, Phase 9 결정대로 게이트웨이와 별도 프로세스) → `payment:events:live`/`payment:alerts:live` 구독, 연결된 브라우저에 브로드캐스트. nginx `/ws-server/`로 노출(WS 업그레이드 헤더 포함)
- [x] 실시간 트래픽 플로우 — 최근 60초 TPS 스파크라인(SVG, hover 크로스헤어/툴팁 포함, dataviz 스킬의 단일 시계열 스펙 준수) + 최근 결제 피드 리스트. TPS/에러율/활성알림 KPI 카드도 같은 실시간 버퍼에서 클라이언트 계산으로 전환(Kafka Consumer Lag만 Prometheus HTTP API를 주기 폴링)
- [x] 알림/이상탐지 타임라인 — `payment:alerts:live` 채널 실시간 반영 (게이트웨이 `/webhook/alert-relay` → Redis → ws-server → 브라우저 경로를 실제 POST로 검증 완료). n8n에서 이 경로를 실제로 호출하는 노드 연결은 아직 안 함(Slack 알림과 중복 알림 노드라 필요 시 추가)
- [x] AI 리포트 표시 영역 — ws-server의 `GET /reports/latest`를 30초 주기로 폴링해 최신 리포트 표시
- **같이 할 부분**: 화면 구성/디자인 방향 — 기존에 잡아둔 3패널(트래픽/알림/리포트) 레이아웃은 그대로 유지하고 트래픽 패널만 "피드+스파크라인" 방식으로 확정 ✅ 완료

### Phase 11 — 컨테이너화 ✅ 완료
- [x] 각 컴포넌트 Dockerfile 작성 (Java 2종: 멀티스테이지 Maven 빌드 / Python 3종: pip install / TypeScript 4종: 멀티스테이지 tsc 빌드, 대시보드는 정적 빌드 후 nginx로 서빙). 9개 전부 `docker build` 실제 성공까지 검증 완료. 대시보드는 `npm run build`(=`tsc -b && vite build`)가 로컬 Vite dev 서버와 달리 진짜로 타입체크를 하면서 기존에 잠재해있던 MUI Typography 타입 에러 2건이 실제 빌드 실패로 드러남 → `fontWeight` prop을 `sx={{ fontWeight: 700 }}`로 바꿔 해결 (문제해결_로그.md [5]번)
- [x] 컨테이너화 전제조건: 하드코딩돼 있던 `localhost` 주소들(Redis/Postgres/Kafka/MCP서버/게이트웨이/n8n 웹훅/OTLP 엔드포인트)을 전부 환경변수 기반으로 전환 - k8s에서는 서비스 이름으로 통신하므로 필수 선행 작업이었음(Spring Boot 2종은 이미 환경변수 오버라이드를 기본 지원해 코드 변경 불필요, `OTEL_EXPORTER_OTLP_ENDPOINT`만 새로 노출)
- [x] k3s 매니페스트(Deployment/Service) 작성 - `k8s/` 폴더. 인프라(postgres/redis/kafka+exporter/prometheus/tempo/grafana/nginx/n8n)와 앱 9종 전부 작성. n8n은 로컬과 동일한 이유(서브패스 프록시 이슈)로 NodePort로 직접 노출, nginx의 `/n8n/` 위치는 `$host`(요청 Host 헤더)를 재사용한 리다이렉트로 환경에 상관없이 동작하게 함. GOOGLE_API_KEY는 YAML에 값을 적지 않고 `kubectl create secret`으로 별도 생성하도록 문서화(비밀값을 파일에 남기지 않는 이 프로젝트의 원칙 유지)
- **알려진 제약(Phase 12로 이월)**: 대시보드 프론트엔드에 빌드 시점 하드코딩된 `http://localhost` 주소들은 실제 EC2 공인 IP/도메인 환경에서 깨짐 - Phase 12에서 빌드 시점 주입 또는 런타임 설정 스크립트로 해결 예정

### Phase 12 — 인프라 (Terraform) ✅ 완료
- [x] EC2 인스턴스(t3.large, Ubuntu 22.04) + 보안그룹(SSH/nginx NodePort 30080/n8n NodePort 30678). SSH 키페어도 `tls_private_key`+`aws_key_pair`로 Terraform이 직접 생성해 사전 수작업(콘솔에서 키페어 만들기)을 없앰. 기본 VPC 사용(ADR-3과 같은 논리 - 이 규모에서 커스텀 VPC는 이점이 없음)
- [x] `user_data` 스크립트로 Docker 설치 → k3s 설치(`--docker` 플래그로 Docker를 컨테이너 런타임으로 써서 이미지 export/import 단계 생략) → GitHub 저장소 clone → 9개 컴포넌트 이미지 빌드 → `k8s/` 매니페스트 적용까지 자동화
- [x] `terraform apply` 한 번으로 배포 완료, 실제 브라우저 접속 가능한 웹 대시보드까지 확인 (`http://<EC2 공인IP>:30080/dashboard/` 200 응답)
- [x] GitHub 저장소(`github.com/tjsal89000/2026_-Portfolio`, public) 신규 생성 - 이 프로젝트가 git 저장소가 아니었어서 Phase 12를 시작하기 전에 git 자체를 설치하고 초기화. `Terraform-admin_accessKeys.csv`(AWS 키) 등이 있는 상위 폴더 전체가 아니라 `payment-aiops-platform/` 폴더만 별도로 저장소 루트로 잡아서 실수로 민감 파일이 딸려가는 걸 방지
- [x] GOOGLE_API_KEY는 Terraform 코드/state/user_data 어디에도 값을 넣지 않고, 배포 후 SSH 접속 상태에서 `kubectl create secret`으로 직접 주입하도록 설계 (비밀값은 파일에 남기지 않는다는 이 프로젝트의 일관된 원칙)
- 실제로 겪은 문제: [문제해결_로그.md](./docs/문제해결_로그.md) [6]번 (네임스페이스 적용 순서 버그, CPU 리소스 요청 총합이 노드 용량과 정확히 일치해 생긴 스케줄링 교착)

### Phase 13 — 통합 테스트 + 문서화
- [ ] 전체 흐름 End-to-End 확인
- [ ] README/ADR 작성 (이전 프로젝트와 동일한 패턴 — 설계 이유를 면접에서 바로 재현 가능하게, MCP 서버를 왜/어떻게 썼는지도 포함)

---

## 폴더 구조

```
payment-aiops-platform/
├── WORKFLOW.md
├── payment-api/            # [Java/Spring Boot] 결제 API, Kafka Producer
├── db-writer-consumer/     # [Java/Spring Boot] Kafka Consumer → Postgres + Redis 카운터
├── agents/                 # [Python]
│   ├── traffic-generator/
│   ├── anomaly-detector/
│   └── report-agent/
├── gateway/                 # [TypeScript/Node.js] 외부 API/웹훅 수신 + WebSocket 서버
├── mcp-server/               # [TypeScript/Node.js] Kafka Lag/Redis 카운터/Postgres 조회 도구 노출
├── dashboard/                # [TypeScript/React] 프론트엔드
├── n8n/                      # n8n 워크플로우 export, 로컬 실행용 compose
├── db/                       # init.sql (스키마)
├── k8s/                      # k3s 매니페스트
├── terraform/                 # EC2 프로비저닝
└── docs/                      # ADR, 문제해결 템플릿, 체크리스트
```

---

## 다음 단계

Phase 0부터 시작. 폴더 구조는 위에서 확정했으니, Phase 1(결제 API + 이벤트 스키마, Java/Spring Boot)부터 같이 시작하면 됨.
