-- 컨테이너 최초 생성 시 1회 자동 실행됨 (docker-entrypoint-initdb.d 메커니즘)
-- 이전 프로젝트와 같은 멱등성 패턴: idempotency_key UNIQUE 제약이 중복 처리를 막는 최종 방어선
CREATE TABLE IF NOT EXISTS payments (
    id              BIGSERIAL PRIMARY KEY,
    idempotency_key UUID NOT NULL UNIQUE,
    merchant_id     VARCHAR(50) NOT NULL,
    account_id      VARCHAR(50) NOT NULL,
    amount          BIGINT NOT NULL,
    currency        VARCHAR(3) NOT NULL,
    country         VARCHAR(2) NOT NULL,
    payment_method  VARCHAR(20) NOT NULL,
    requested_at    TIMESTAMPTZ NOT NULL,
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AI 분석/요약 리포트 에이전트(Phase 8)가 생성한 리포트 저장
CREATE TABLE IF NOT EXISTS reports (
    id           BIGSERIAL PRIMARY KEY,
    summary      TEXT NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
