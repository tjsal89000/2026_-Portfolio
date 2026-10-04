package com.aiops.dbwriter.kafka;

import com.aiops.dbwriter.domain.Payment;
import com.aiops.dbwriter.domain.PaymentRepository;
import com.aiops.dbwriter.metrics.PaymentMetricsService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class PaymentEventListener {

    private static final Logger log = LoggerFactory.getLogger(PaymentEventListener.class);

    private final PaymentRepository repository;
    private final PaymentMetricsService metrics;

    public PaymentEventListener(PaymentRepository repository, PaymentMetricsService metrics) {
        this.repository = repository;
        this.metrics = metrics;
    }

    // id는 ConsumerPauseService가 이 리스너를 찾아 멈추고 재개할 때 쓴다 (시연용 소비 지연 주입).
    // id를 주면 Spring Kafka가 group.id 기본값으로도 id를 쓰기 때문에, groupId를 반드시 같이 지정한다.
    // 빠뜨리면 컨슈머가 새 그룹에 붙어 offset을 처음부터(earliest) 다시 읽는다.
    @KafkaListener(
            id = ConsumerPauseService.LISTENER_ID,
            groupId = "${spring.kafka.consumer.group-id}",
            topics = "${payment.topic}",
            containerFactory = "kafkaListenerContainerFactory")
    public void onMessage(PaymentEvent event, Acknowledgment ack) {
        try {
            Payment payment = new Payment(
                    UUID.fromString(event.idempotencyKey()),
                    event.merchantId(),
                    event.accountId(),
                    event.amount(),
                    event.currency(),
                    event.country(),
                    event.paymentMethod(),
                    event.requestedAt()
            );
            repository.save(payment);
            log.info("[저장 완료] idempotencyKey={} accountId={}", event.idempotencyKey(), event.accountId());
            metrics.recordSuccess(event);

        } catch (DataIntegrityViolationException e) {
            // idempotency_key UNIQUE 제약 위반 = 이미 처리된 요청. 정상적으로 건너뛰는 케이스이므로
            // 예외를 여기서 삼키고, 이 메시지도 "처리 완료"로 보고 오프셋을 커밋한다.
            log.info("[중복 요청 - 스킵] idempotencyKey={}", event.idempotencyKey());
            metrics.recordDuplicate(event);

        } catch (Exception e) {
            // 그 외(DB 접속 끊김 등) 진짜 실패 - 커밋하지 않고 리턴한다.
            // 커밋 안 된 오프셋은 컨슈머가 재시작되거나 리밸런싱될 때 이 메시지부터 다시 읽어 재처리를 시도한다.
            log.error("[처리 실패 - 커밋 보류] idempotencyKey={}", event.idempotencyKey(), e);
            metrics.recordFailure(event);
            return;
        }

        ack.acknowledge();
    }
}
