package com.aiops.dbwriter.metrics;

import com.aiops.dbwriter.kafka.PaymentEvent;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;

/**
 * Redis에 "지금 이 순간의 상태"를 기록하는 역할만 담당한다 (Kafka=사실의 기록, Redis=현재 상태 - WORKFLOW.md 참고).
 *
 * 카운터는 초 단위 버킷(payment:count:{epochSecond})으로 쌓는다. 기업에서 실시간 집계에 흔히 쓰는 방식으로,
 * 1분짜리 TTL 키 하나로 세는 것보다 부드럽고(매 분 리셋되는 계단현상이 없음), 이벤트 하나하나를
 * Sorted Set에 쌓는 것보다 가볍다 (조회할 땐 최근 N개 초단위 키를 MGET으로 한 번에 합산).
 */
@Service
public class PaymentMetricsService {

    private static final Logger log = LoggerFactory.getLogger(PaymentMetricsService.class);

    private static final String COUNT_KEY_PREFIX = "payment:count:";
    private static final String ERROR_KEY_PREFIX = "payment:error:";
    private static final String LIVE_EVENTS_CHANNEL = "payment:events:live";
    // 대시보드가 보통 "최근 60초" 기준으로 조회할 것이므로, 그보다 넉넉하게 버킷을 살려둔다
    private static final Duration BUCKET_TTL = Duration.ofSeconds(90);

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    public PaymentMetricsService(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());
    }

    /** 정상 승인 처리된 이벤트 - 카운터 증가 + 대시보드로 실시간 알림 */
    public void recordSuccess(PaymentEvent event) {
        incrementBucket(COUNT_KEY_PREFIX);
        publish(event, "APPROVED");
    }

    /** 멱등성 체크로 걸러진 중복 이벤트 - 실제로 트래픽은 발생했으니 카운터엔 포함시킨다 */
    public void recordDuplicate(PaymentEvent event) {
        incrementBucket(COUNT_KEY_PREFIX);
        publish(event, "DUPLICATE");
    }

    /** DB 저장 등 처리 자체가 실패한 경우 - 에러 카운터 증가 (이상탐지 에이전트가 Phase 6에서 이 값을 읽게 됨) */
    public void recordFailure(PaymentEvent event) {
        incrementBucket(COUNT_KEY_PREFIX);
        incrementBucket(ERROR_KEY_PREFIX);
        publish(event, "FAILED");
    }

    private void incrementBucket(String prefix) {
        String key = prefix + Instant.now().getEpochSecond();
        redisTemplate.opsForValue().increment(key);
        redisTemplate.expire(key, BUCKET_TTL);
    }

    private void publish(PaymentEvent event, String status) {
        try {
            String json = objectMapper.writeValueAsString(Map.of(
                    "idempotencyKey", event.idempotencyKey(),
                    "accountId", event.accountId(),
                    "amount", event.amount(),
                    "country", event.country(),
                    "paymentMethod", event.paymentMethod(),
                    "status", status
            ));
            redisTemplate.convertAndSend(LIVE_EVENTS_CHANNEL, json);
        } catch (JsonProcessingException e) {
            // Pub/Sub은 대시보드 실시간 업데이트용일 뿐이라, 실패해도 DB 저장(진짜 중요한 부분)은 이미 끝난 상태.
            // 그래서 예외를 던져 전체 처리를 실패시키지 않고 로그만 남긴다.
            log.warn("[Pub/Sub 발행 실패] idempotencyKey={}", event.idempotencyKey(), e);
        }
    }
}
