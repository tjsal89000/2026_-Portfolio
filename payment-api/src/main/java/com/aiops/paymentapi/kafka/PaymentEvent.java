package com.aiops.paymentapi.kafka;

import java.time.Instant;

/**
 * 실제로 Kafka topic(payment.events)에 실려나가는 메시지 형태.
 * PaymentEventRequest와 거의 같지만 requestedAt(서버가 요청을 받은 시각)이 추가된다.
 * "클라이언트가 언제 보냈다고 주장하는가"가 아니라 "우리 서버가 실제로 언제 받았는가"를
 * 기준으로 삼기 위해, 이 값은 클라이언트가 보내는 게 아니라 서버가 직접 채워 넣는다.
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
