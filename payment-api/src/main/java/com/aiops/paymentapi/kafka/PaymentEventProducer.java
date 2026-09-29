package com.aiops.paymentapi.kafka;

import com.aiops.paymentapi.dto.PaymentEventRequest;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * 검증된 결제 요청을 실제로 Kafka에 발행(publish)하는 역할만 담당한다.
 * key=accountId로 지정해서, 같은 계좌의 이벤트는 항상 같은 파티션에 순서대로 쌓이게 한다
 * (다른 계좌 이벤트와 처리 순서가 섞여도 상관없지만, 같은 계좌 안에서는 순서가 보장돼야 함).
 *
 * @Retry: 첫 시도가 실패해도(예: 브로커 재선출 중 일시적 오류) 바로 포기하지 않고 짧게 재시도한다.
 * @CircuitBreaker: 그런데도 계속 실패하면(Kafka 자체가 죽은 상황), 매 요청마다 5초씩 대기하며
 * 스레드를 붙잡아두는 대신 서킷을 열어 즉시 실패 처리한다 - 한 컴포넌트 장애가 API 서버 전체를
 * 마비시키는 cascading failure를 막기 위한 MSA 표준 패턴.
 */
@Component
public class PaymentEventProducer {

    private static final Logger log = LoggerFactory.getLogger(PaymentEventProducer.class);

    private final KafkaTemplate<String, PaymentEvent> kafkaTemplate;
    private final String topic;

    public PaymentEventProducer(
            KafkaTemplate<String, PaymentEvent> kafkaTemplate,
            @Value("${payment.topic}") String topic) {
        this.kafkaTemplate = kafkaTemplate;
        this.topic = topic;
    }

    @Retry(name = "kafkaPublish")
    @CircuitBreaker(name = "kafkaPublish", fallbackMethod = "publishFallback")
    public void publish(PaymentEventRequest request) {
        PaymentEvent event = new PaymentEvent(
                request.idempotencyKey(),
                request.merchantId(),
                request.accountId(),
                request.amount(),
                request.currency(),
                request.country(),
                request.paymentMethod(),
                Instant.now()
        );

        try {
            // send()는 원래 비동기(Future)라 결과를 안 기다리면 더 빠르지만,
            // 브로커가 실제로 저장했는지 그 자리에서 알 수 없다는 단점이 있다.
            // 이전 프로젝트(portfolio-payment-platform)의 Python producer가 send_and_wait를 쓴 것과
            // 같은 이유로, 여기서도 get()으로 블로킹 대기해서 "저장 확인"까지 받은 뒤에만 202를 응답한다.
            kafkaTemplate.send(topic, request.accountId(), event).get(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new PaymentEventPublishException("Kafka 발행 중 인터럽트 발생", e);
        } catch (ExecutionException | TimeoutException e) {
            throw new PaymentEventPublishException("Kafka 발행 실패", e);
        }
    }

    /**
     * @Retry로도 안 되고 서킷브레이커까지 열린 뒤 호출되는 최종 처리.
     * 시그니처는 원본 메서드 파라미터 + 발생한 예외(Throwable)를 마지막에 받아야 한다 (Resilience4j 규약).
     */
    private void publishFallback(PaymentEventRequest request, Throwable t) {
        log.error("[Kafka 발행 최종 실패 - 재시도/서킷브레이커 이후] idempotencyKey={}", request.idempotencyKey(), t);
        throw new PaymentEventPublishException("Kafka 발행 실패 (재시도 및 서킷브레이커 이후)", t);
    }
}
