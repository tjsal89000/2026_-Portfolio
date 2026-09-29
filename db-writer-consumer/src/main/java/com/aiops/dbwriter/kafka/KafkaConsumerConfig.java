package com.aiops.dbwriter.kafka;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.listener.ContainerProperties;
import org.springframework.kafka.support.serializer.JsonDeserializer;

import java.util.Map;

/**
 * payment-api(Phase 1)에서 겪은 것과 같은 이유로, 여기서도 JsonDeserializer용 ObjectMapper를
 * 직접 만들어 Instant를 ISO-8601로 다루게 한다.
 *
 * AckMode.MANUAL로 설정한 이유: 리스너 메서드 안에서 DB 저장이 실제로 성공한 뒤에만
 * ack.acknowledge()를 호출해 오프셋을 커밋하기 위함. auto-commit을 쓰면 처리 중 실패해도
 * 오프셋이 먼저 커밋돼버려 메시지를 재처리할 기회 자체가 사라진다
 * (이전 프로젝트 문제해결 템플릿 [3]번에서 실제로 겪었던 데이터 유실 문제와 동일한 이유).
 */
@Configuration
public class KafkaConsumerConfig {

    @Bean
    public ConsumerFactory<String, PaymentEvent> consumerFactory(
            @Value("${spring.kafka.bootstrap-servers}") String bootstrapServers,
            @Value("${spring.kafka.consumer.group-id}") String groupId) {

        var objectMapper = new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

        var valueDeserializer = new JsonDeserializer<>(PaymentEvent.class, objectMapper, false);
        // payment-api가 보낸 메시지에는 타입 정보 헤더가 없으므로, 대상 타입을 이미 알려준 상태로 신뢰하고 역직렬화
        valueDeserializer.addTrustedPackages("com.aiops.dbwriter.kafka");

        Map<String, Object> props = Map.of(
                ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers,
                ConsumerConfig.GROUP_ID_CONFIG, groupId,
                ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest",
                ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false
        );

        return new DefaultKafkaConsumerFactory<>(props, new StringDeserializer(), valueDeserializer);
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, PaymentEvent> kafkaListenerContainerFactory(
            ConsumerFactory<String, PaymentEvent> consumerFactory) {
        var factory = new ConcurrentKafkaListenerContainerFactory<String, PaymentEvent>();
        factory.setConsumerFactory(consumerFactory);
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL);
        // payment-api가 메시지 헤더에 실어 보낸 trace 정보를 이어받아, 같은 trace 안에
        // "payment-api의 send span"과 "이 컨슈머의 receive span"이 연결되게 한다.
        factory.getContainerProperties().setObservationEnabled(true);
        return factory;
    }
}
