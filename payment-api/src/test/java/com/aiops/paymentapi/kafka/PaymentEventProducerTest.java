package com.aiops.paymentapi.kafka;

import com.aiops.paymentapi.dto.PaymentEventRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * @Retry/@CircuitBreaker는 Spring이 프록시를 만들 때만 동작하는 AOP라, new로 직접 생성한
 * 이 테스트에서는 재시도/서킷 동작 자체가 아니라 publish()의 "발행 로직 + 예외 매핑"만
 * 검증한다 - 재시도 설정값 자체는 애노테이션 선언으로 이미 운영에서 검증됨.
 */
@ExtendWith(MockitoExtension.class)
class PaymentEventProducerTest {

    private static final String TOPIC = "payment.events";

    @Mock
    private KafkaTemplate<String, PaymentEvent> kafkaTemplate;

    private PaymentEventProducer producer;

    @BeforeEach
    void setUp() {
        producer = new PaymentEventProducer(kafkaTemplate, TOPIC);
    }

    private PaymentEventRequest request() {
        return new PaymentEventRequest("idem-1", "merchant-1", "acc-1", 10_000L, "KRW", "KR", "CARD");
    }

    @Test
    @SuppressWarnings("unchecked")
    void 발행에_성공하면_accountId를_key로_하는_이벤트를_전송한다() {
        SendResult<String, PaymentEvent> sendResult = mock(SendResult.class);
        when(kafkaTemplate.send(eq(TOPIC), eq("acc-1"), any(PaymentEvent.class)))
                .thenReturn(CompletableFuture.completedFuture(sendResult));

        producer.publish(request());

        ArgumentCaptor<PaymentEvent> captor = ArgumentCaptor.forClass(PaymentEvent.class);
        verify(kafkaTemplate).send(eq(TOPIC), eq("acc-1"), captor.capture());
        PaymentEvent sent = captor.getValue();
        assertThat(sent.idempotencyKey()).isEqualTo("idem-1");
        assertThat(sent.accountId()).isEqualTo("acc-1");
        assertThat(sent.amount()).isEqualTo(10_000L);
        // 클라이언트가 보낸 시각이 아니라 서버가 실제로 받은 시각을 기준으로 삼는다는 설계라서,
        // 요청 자체에는 없는 값이 서버에서 채워졌는지가 이 테스트의 핵심.
        assertThat(sent.requestedAt()).isNotNull();
    }

    @Test
    void kafka_전송이_실패하면_PaymentEventPublishException으로_변환된다() {
        CompletableFuture<SendResult<String, PaymentEvent>> failed = new CompletableFuture<>();
        failed.completeExceptionally(new RuntimeException("broker down"));
        when(kafkaTemplate.send(eq(TOPIC), eq("acc-1"), any(PaymentEvent.class))).thenReturn(failed);

        assertThatThrownBy(() -> producer.publish(request()))
                .isInstanceOf(PaymentEventPublishException.class);
    }

    @Test
    void 타임아웃이_나면_PaymentEventPublishException으로_변환된다() {
        // get(5, SECONDS)가 실제로 5초를 기다리게 두면 테스트가 느려지므로, get() 자체가
        // TimeoutException을 즉시 던지도록 오버라이드한 CompletableFuture를 사용한다.
        CompletableFuture<SendResult<String, PaymentEvent>> timingOut = new CompletableFuture<>() {
            @Override
            public SendResult<String, PaymentEvent> get(long timeout, TimeUnit unit) throws TimeoutException {
                throw new TimeoutException("simulated timeout");
            }
        };
        when(kafkaTemplate.send(eq(TOPIC), eq("acc-1"), any(PaymentEvent.class))).thenReturn(timingOut);

        assertThatThrownBy(() -> producer.publish(request()))
                .isInstanceOf(PaymentEventPublishException.class);
    }

    @Test
    void 인터럽트가_발생하면_스레드_인터럽트_상태를_복원하고_예외를_던진다() {
        CompletableFuture<SendResult<String, PaymentEvent>> interrupted = new CompletableFuture<>() {
            @Override
            public SendResult<String, PaymentEvent> get(long timeout, TimeUnit unit) throws InterruptedException {
                throw new InterruptedException("simulated interrupt");
            }
        };
        when(kafkaTemplate.send(eq(TOPIC), eq("acc-1"), any(PaymentEvent.class))).thenReturn(interrupted);

        assertThatThrownBy(() -> producer.publish(request()))
                .isInstanceOf(PaymentEventPublishException.class);
        // Thread.interrupted()는 인터럽트 상태를 읽으면서 동시에 초기화한다 - 원본 코드가
        // catch 블록에서 Thread.currentThread().interrupt()로 상태를 복원했는지 확인하는 용도.
        assertThat(Thread.interrupted()).isTrue();
    }
}
