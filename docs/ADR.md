# Architecture Decision Records — payment-aiops-platform

이전 프로젝트(portfolio-payment-platform)와 같은 형식. "무엇을 했는가"가 아니라 "왜 그렇게 했는가"를 남겨서, 면접에서 바로 재구성할 수 있게 한다.

---

## ADR-1. 백엔드를 Java / Python / TypeScript 세 언어로 분리

**결정**: 결제 API + DB Writer Consumer는 Java(Spring Boot), 트래픽생성/이상탐지/AI리포트 에이전트는 Python, 외부 API 게이트웨이/WebSocket 서버/대시보드 프론트엔드는 TypeScript(Node.js/React)로 나눈다.

**이유**: 언어마다 강점이 뚜렷한 영역에 배치했다.
- Java/Spring Boot: 강타입·트랜잭션 안정성이 필요한 "돈이 걸린" 핵심 로직. 실무에서도 결제/정산 도메인은 Java/Spring이 사실상 표준.
- Python: LLM SDK·데이터 처리 생태계가 풍부해 "정보를 수신해 판단·생성"하는 에이전트 작업에 적합.
- TypeScript/Node.js: 비동기 I/O 모델이 다수의 실시간 커넥션(웹훅, WebSocket)을 동시에 처리하는 데 강점.

**트레이드오프**: 세 언어를 유지보수해야 하는 부담이 있다. 포트폴리오 규모에서는 감수할 만하지만, 실제 팀 프로젝트였다면 팀의 언어 숙련도를 먼저 고려했을 것이다.

---

## ADR-2. Kafka와 Redis의 역할을 명확히 분리

**결정**: Kafka는 결제 이벤트의 내구성 있는 기록(source of truth)으로, Redis는 휘발성 실시간 상태(초단위 버킷 카운터 + Pub/Sub)로 역할을 나눈다.

**이유**: "이 이벤트가 실제로 있었는가"와 "지금 상황이 어떤가"는 요구사항이 다르다. Kafka는 메시지가 브로커에 저장되고 여러 Consumer가 독립적으로 재생(replay)할 수 있어야 하는 반면, TPS/에러율 같은 실시간 집계값은 매번 DB나 Kafka에 질의하기엔 무겁고, 대시보드로 즉시 밀어줘야(Pub/Sub) 한다.

**Redis 카운터 설계**: 초 단위 버킷(`payment:count:{epochSecond}`)에 `INCR`+`EXPIRE`. 단일 TTL 키(예: 1분짜리) 방식은 매 분 카운터가 통째로 리셋되는 계단현상이 있고, Sorted Set에 이벤트 하나하나를 쌓는 방식은 트래픽이 늘수록 메모리/연산 비용이 계속 증가한다. 초단위 버킷 + 조회 시 `MGET`으로 최근 N개 합산하는 방식이 이 둘의 단점을 피하면서 기업 실무에서도 흔히 쓰이는 절충안이다. (Prometheus의 `rate()`가 구간별 증가량을 합산하는 방식과 개념적으로 동일하다.)

---

## ADR-3. Kafka 배포 방식: Strimzi Operator 대신 플레인 컨테이너

**결정**: 이전 프로젝트(portfolio-payment-platform)에서는 EKS 멀티노드 환경에 Strimzi Operator로 Kafka를 운영했지만, 이번엔 로컬 개발과 최종 배포(EC2 1대 + 단일노드 k3s) 모두 오퍼레이터 없이 플레인 컨테이너(Deployment)로 운영한다.

**이유**: Kafka Operator(Strimzi, Confluent Operator 등)의 실질적 가치는 **멀티 브로커를 운영할 때** 나온다 — 롤링 업그레이드, 브로커 장애 시 자동 복구, 파티션 재배치 자동화 등. 이번 인프라는 EC2 1대짜리 단일 노드 k3s에 브로커 1개만 두는 구조라, 오퍼레이터가 해결해주는 문제 자체가 발생하지 않는다. 오히려 오퍼레이터 컨트롤러 파드와 CRD 관리 오버헤드만 늘어난다.

실제로 많은 기업도 로컬 개발 환경이나 트래픽이 적은 소규모 서비스에서는 플레인 컨테이너로 Kafka를 운영하고, 멀티 브로커로 확장해 고가용성이 필요해지는 시점에 Operator나 관리형 서비스(AWS MSK, Confluent Cloud)로 넘어간다. "항상 Operator를 쓰는 것"이 아니라 "규모에 맞는 도구를 선택하는 것"이 이 결정의 핵심이다.

**트레이드오프**: 브로커 장애 시 자동 복구가 없고, 멀티 브로커로 확장하려면 이 구성을 다시 갈아엎어야 한다. 포트폴리오 규모에서는 감수 가능하지만, 프로덕션이라면 트래픽이 늘어나는 시점에 재검토가 필요하다.

---

## ADR-4. 데이터베이스: RDS 대신 컨테이너 PostgreSQL (이전 프로젝트 결정 재사용)

**결정**: PostgreSQL을 관리형 RDS가 아니라 Docker 컨테이너(로컬)/k3s Pod(배포)로 운영한다.

**이유**: 이전 프로젝트의 ADR-6("RDS 대신 EBS/PVC 기반 K8s 컨테이너 PostgreSQL")과 동일한 논리 — 비용 절감, 그리고 "직접 상태를 가진 워크로드를 운영하는 경험"을 계속 쌓기 위함. 이번엔 EC2 단일 인스턴스라 EBS PVC 대신 로컬 볼륨/컨테이너 볼륨으로 더 단순화한다.

---

## ADR-5. 관측 대시보드를 두 개로 분리: 커스텀 React 대시보드 + Grafana

**결정**: 이 서비스가 "무엇을 하고 있는가"는 자체 제작한 React 대시보드로, "서비스가 건강한가"는 Spring Boot Actuator/Micrometer → Prometheus → Grafana로 각각 보여준다.

**이유**: 두 질문의 성격이 다르다. 비즈니스 관점의 실시간 트래픽 스토리텔링(정상 동작 + 이상탐지 + AI 리포트)은 커스텀 UI가 필요하고, 인프라/애플리케이션 표준 지표(uptime, 요청수, Kafka Lag)는 이미 업계 표준 도구(Prometheus/Grafana)가 있는데 이를 재발명할 이유가 없다. 실무에서 그대로 쓰이는 조합(Spring Boot Actuator + Micrometer + Prometheus + Grafana)을 증명하는 것 자체도 목적이다.

---

## 알려진 한계

- Kafka 단일 브로커: 브로커 장애 시 데이터 유실 가능 (ADR-3 참고)
- PostgreSQL 단일 컨테이너: DB 장애 시 다운타임 발생, 자동 failover 없음
- EC2 단일 인스턴스: 인스턴스 자체가 단일 장애점(SPOF). 프로덕션이라면 최소 Multi-AZ 구성이 필요하다.
