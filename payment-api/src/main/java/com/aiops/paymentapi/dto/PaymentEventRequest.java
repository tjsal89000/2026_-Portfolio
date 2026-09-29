package com.aiops.paymentapi.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * 클라이언트(트래픽 생성 에이전트)가 POST /payments 로 보내는 요청 body.
 * 여기서 검증에 실패하면 Kafka까지 가지 않고 Spring이 자동으로 400을 응답한다
 * (@Valid를 컨트롤러에 붙여두면, 이 record의 제약 애노테이션들을 자동으로 체크해줌).
 */
public record PaymentEventRequest(
        @NotBlank String idempotencyKey,
        @NotBlank String merchantId,
        @NotBlank String accountId, // Kafka 파티션 키로 쓸 값 - 같은 계좌는 항상 같은 파티션으로
        @NotNull @Positive Long amount,
        @NotBlank @Size(min = 3, max = 3) String currency,
        @NotBlank @Size(min = 2, max = 2) String country,
        @NotBlank String paymentMethod // CARD / BANK_TRANSFER / WALLET
) {
}
