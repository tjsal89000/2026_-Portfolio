package com.aiops.paymentapi.kafka;

import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.config.TopicBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 이 Bean이 등록되어 있으면, 스프링이 기동 시 KafkaAdmin을 통해
 * 토픽이 없으면 자동으로 만들어준다 (로컬 개발 편의용 - 수동으로 kafka-topics.sh 안 돌려도 됨).
 */
@Configuration
public class KafkaTopicConfig {

    @Bean
    public NewTopic paymentEventsTopic(@Value("${payment.topic}") String topic) {
        // 파티션 3개로 시작. 이전 프로젝트의 부하테스트에서 "파티션 수 = Consumer 병렬성의 한계"라는 걸
        // 직접 확인했었기 때문에, 나중에 Consumer를 늘릴 여지를 위해 처음부터 여유 있게 잡는다.
        // (파티션은 늘릴 수는 있어도 줄일 수는 없으므로 처음부터 너무 타이트하게 잡지 않는 게 낫다)
        return TopicBuilder.name(topic)
                .partitions(3)
                .replicas(1)
                .build();
    }
}
