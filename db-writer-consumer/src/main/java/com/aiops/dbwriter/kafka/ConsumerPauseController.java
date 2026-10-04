package com.aiops.dbwriter.kafka;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * ws-server가 비밀번호를 확인한 뒤에만 호출하는 내부 엔드포인트.
 * nginx에 노출하지 않으므로 외부에서는 직접 접근할 수 없다.
 */
@RestController
@RequestMapping("/internal/consumer")
public class ConsumerPauseController {

    private final ConsumerPauseService service;

    public ConsumerPauseController(ConsumerPauseService service) {
        this.service = service;
    }

    @PostMapping("/pause")
    public ConsumerPauseService.PauseResult pause(@RequestParam(defaultValue = "30") int seconds) {
        return service.pause(seconds);
    }

    @GetMapping("/status")
    public Map<String, Object> status() {
        return Map.of("paused", service.isPaused());
    }
}
