package com.aiops.paymentapi.kafka;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.StringSerializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.kafka.support.serializer.JsonSerializer;

import java.util.Map;

/**
 * application.yml의 value-serializer 설정(JsonSerializer)만 쓰면, Spring Kafka가
 * 내부적으로 기본 ObjectMapper를 만들어 쓰는데, 이 기본값은 Instant 같은 날짜를
 * "1790116102.29"처럼 epoch 숫자로 직렬화해버린다.
 *
 * 이건 사람이 읽기도 불편하고, 나중에 이 이벤트를 읽는 Python/TypeScript 쪽에서
 * 언어별로 epoch 처리 방식이 달라 혼선이 생기기 쉽다. 그래서 ObjectMapper를 직접 만들어
 * "날짜는 항상 ISO-8601 문자열로"라는 규칙을 명시적으로 정해준다
 * (이전 프로젝트에서 Python 쪽이 requested_at을 ISO 문자열로 다뤘던 것과 형식을 맞추는 것이기도 함).
 */
@Configuration
public class KafkaProducerConfig {

    @Bean
    public ProducerFactory<String, PaymentEvent> producerFactory(
            @Value("${spring.kafka.bootstrap-servers}") String bootstrapServers,
            @Value("${spring.kafka.producer.acks:all}") String acks) {

        var objectMapper = new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

        var valueSerializer = new JsonSerializer<PaymentEvent>(objectMapper);

        Map<String, Object> configProps = Map.of(
                ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers,
                ProducerConfig.ACKS_CONFIG, acks
        );

        return new DefaultKafkaProducerFactory<>(configProps, new StringSerializer(), valueSerializer);
    }

    @Bean
    public KafkaTemplate<String, PaymentEvent> kafkaTemplate(ProducerFactory<String, PaymentEvent> producerFactory) {
        var template = new KafkaTemplate<>(producerFactory);
        // Observation(Micrometer)을 켜야 send() 할 때 trace span을 만들고, 그 trace 정보를
        // Kafka 메시지 헤더에 실어 보낸다 - 이게 있어야 db-writer-consumer가 같은 trace로 이어붙일 수 있다.
        template.setObservationEnabled(true);
        return template;
    }
}
