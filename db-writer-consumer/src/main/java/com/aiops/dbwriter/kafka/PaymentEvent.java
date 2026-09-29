package com.aiops.dbwriter.kafka;

import java.time.Instant;

/**
 * payment-api가 Kafka(payment.events 토픽)로 발행하는 메시지와 동일한 형태.
 * 두 서비스가 별개 프로젝트라 클래스를 공유하지 않고 각자 정의한다 -
 * "메시지 포맷"이라는 계약(contract)만 맞으면 되고, 서로의 내부 구현을 알 필요는 없기 때문이다.
 */
public record PaymentEvent(
        String idempotencyKey,
        String merchantId,
        String accountId,
        Long amount,
        String currency,
        String country,
        String paymentMethod,
        Instant requestedAt
) {
}
