package com.aiops.dbwriter.kafka;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;
import org.springframework.kafka.listener.MessageListenerContainer;
import org.springframework.stereotype.Service;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * 시연용: 결제 이벤트 소비를 일정 시간 멈췄다가 자동으로 재개한다.
 *
 * 멈추면 Kafka에 메시지가 쌓여서 consumer lag이 올라가고, 시간이 끝나면 밀린 만큼 따라잡으며 0으로 돌아온다.
 * 면접에서 "consumer가 느려지면 lag이 어떻게 보이는지"를 실제 그래프로 보여주기 위해 만든 기능이다.
 * pause 상태에서도 리스너 컨테이너는 poll을 계속 호출하므로 그룹에서 빠지지 않아 리밸런싱이 일어나지 않는다.
 *
 * 이 엔드포인트는 클러스터 안에서만 접근된다(nginx에 노출하지 않음). 공개 접근 제어는 ws-server가 비밀번호로 맡는다.
 */
@Service
public class ConsumerPauseService {

    public static final String LISTENER_ID = "paymentListener";
    static final int MAX_SECONDS = 60;

    public record PauseResult(boolean started, int seconds, String reason) {}

    private final KafkaListenerEndpointRegistry registry;
    private final ScheduledExecutorService scheduler;

    @Autowired
    public ConsumerPauseService(KafkaListenerEndpointRegistry registry) {
        this(registry, Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "consumer-pause");
            t.setDaemon(true);
            return t;
        }));
    }

    // 테스트에서 스케줄러를 바꿔 끼울 수 있게 분리한 생성자
    ConsumerPauseService(KafkaListenerEndpointRegistry registry, ScheduledExecutorService scheduler) {
        this.registry = registry;
        this.scheduler = scheduler;
    }

    public synchronized PauseResult pause(int requestedSeconds) {
        int seconds = Math.min(MAX_SECONDS, Math.max(1, requestedSeconds));
        MessageListenerContainer container = registry.getListenerContainer(LISTENER_ID);
        if (container == null) {
            return new PauseResult(false, seconds, "리스너를 찾을 수 없습니다");
        }
        if (container.isContainerPaused()) {
            return new PauseResult(false, seconds, "이미 멈춰 있습니다");
        }
        container.pause();
        scheduler.schedule(this::resume, seconds, TimeUnit.SECONDS);
        return new PauseResult(true, seconds, null);
    }

    public synchronized void resume() {
        MessageListenerContainer container = registry.getListenerContainer(LISTENER_ID);
        if (container != null && container.isContainerPaused()) {
            container.resume();
        }
    }

    public synchronized boolean isPaused() {
        MessageListenerContainer container = registry.getListenerContainer(LISTENER_ID);
        return container != null && container.isContainerPaused();
    }
}
