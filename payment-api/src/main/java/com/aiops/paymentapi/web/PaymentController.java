package com.aiops.paymentapi.web;

import com.aiops.paymentapi.dto.PaymentEventRequest;
import com.aiops.paymentapi.kafka.PaymentEventProducer;
import com.aiops.paymentapi.kafka.PaymentEventPublishException;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/payments")
public class PaymentController {

    private final PaymentEventProducer producer;

    public PaymentController(PaymentEventProducer producer) {
        this.producer = producer;
    }

    /**
     * 결제 요청 접수 엔드포인트.
     * 여기서는 승인/거절을 판단하지 않는다 - "요청을 검증해서 Kafka에 안전하게 넣는 것"까지가
     * 이 API의 책임이고, 실제 처리는 이후 DB Writer Consumer(Phase 2)가 비동기로 담당한다.
     * 그래서 응답 코드도 200(완료)이 아니라 202(Accepted, 접수됨)를 쓴다.
     */
    @PostMapping
    public ResponseEntity<Map<String, String>> receivePayment(@Valid @RequestBody PaymentEventRequest request) {
        try {
            producer.publish(request);
        } catch (PaymentEventPublishException e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of(
                            "message", "결제 이벤트 발행에 실패했습니다",
                            "idempotencyKey", request.idempotencyKey()
                    ));
        }

        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(Map.of(
                        "message", "결제 요청이 접수되었습니다",
                        "idempotencyKey", request.idempotencyKey()
                ));
    }
}
