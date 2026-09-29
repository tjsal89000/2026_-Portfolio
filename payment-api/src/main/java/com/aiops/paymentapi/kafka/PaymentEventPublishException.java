package com.aiops.paymentapi.kafka;

/** Kafka 발행이 실패했을 때 컨트롤러까지 전달할 unchecked 예외. */
public class PaymentEventPublishException extends RuntimeException {
    public PaymentEventPublishException(String message, Throwable cause) {
        super(message, cause);
    }
}
