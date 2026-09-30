package com.aiops.dbwriter.kafka;

import com.aiops.dbwriter.domain.Payment;
import com.aiops.dbwriter.domain.PaymentRepository;
import com.aiops.dbwriter.metrics.PaymentMetricsService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.kafka.support.Acknowledgment;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 이 리스너의 핵심은 "언제 오프셋을 커밋(ack)하고, 언제 보류하느냐"다 - DB가 UNIQUE 제약으로
 * 걸러낸 중복은 정상적으로 처리된 것으로 간주해 커밋하지만(Payment.java의 idempotencyKey 참고),
 * 그 외 예외(DB 접속 끊김 등)는 커밋을 보류해 컨슈머 재시작/리밸런싱 때 재처리되게 한다.
 * 여기서는 그 분기 세 갈래(성공/중복/진짜 실패)가 ack 여부와 메트릭 기록에 정확히 대응하는지만 본다.
 */
@ExtendWith(MockitoExtension.class)
class PaymentEventListenerTest {

    @Mock
    private PaymentRepository repository;

    @Mock
    private PaymentMetricsService metrics;

    @Mock
    private Acknowledgment ack;

    private PaymentEventListener listener;

    @BeforeEach
    void setUp() {
        listener = new PaymentEventListener(repository, metrics);
    }

    private PaymentEvent event() {
        return new PaymentEvent(
                UUID.randomUUID().toString(), "merchant-1", "acc-1", 10_000L, "KRW", "KR", "CARD", Instant.now());
    }

    @Test
    void 저장에_성공하면_성공_메트릭을_기록하고_오프셋을_커밋한다() {
        PaymentEvent event = event();
        when(repository.save(any(Payment.class))).thenAnswer(inv -> inv.getArgument(0));

        listener.onMessage(event, ack);

        ArgumentCaptor<Payment> captor = ArgumentCaptor.forClass(Payment.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getIdempotencyKey()).isEqualTo(UUID.fromString(event.idempotencyKey()));
        assertThat(captor.getValue().getAccountId()).isEqualTo("acc-1");

        verify(metrics).recordSuccess(event);
        verify(ack).acknowledge();
    }

    @Test
    void 중복_요청이면_실패가_아니라_중복으로_기록하고_그래도_오프셋을_커밋한다() {
        PaymentEvent event = event();
        when(repository.save(any(Payment.class))).thenThrow(new DataIntegrityViolationException("duplicate key"));

        listener.onMessage(event, ack);

        verify(metrics).recordDuplicate(event);
        verify(metrics, never()).recordFailure(any());
        // 이미 처리된 요청으로 간주하므로, 실패와 달리 여기서도 커밋은 진행돼야 한다.
        verify(ack).acknowledge();
    }

    @Test
    void 진짜_저장_실패면_실패를_기록하고_오프셋_커밋을_보류한다() {
        PaymentEvent event = event();
        when(repository.save(any(Payment.class))).thenThrow(new RuntimeException("DB 연결 끊김"));

        listener.onMessage(event, ack);

        verify(metrics).recordFailure(event);
        // 커밋을 보류해야 리밸런싱/재시작 시 이 메시지부터 다시 읽어 재처리를 시도한다.
        verify(ack, never()).acknowledge();
    }
}
