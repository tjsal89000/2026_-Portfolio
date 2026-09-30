package com.aiops.paymentapi.web;

import com.aiops.paymentapi.dto.PaymentEventRequest;
import com.aiops.paymentapi.kafka.PaymentEventProducer;
import com.aiops.paymentapi.kafka.PaymentEventPublishException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.willDoNothing;
import static org.mockito.BDDMockito.willThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * PaymentController는 "요청을 검증해서 Kafka에 안전하게 넣는 것"까지만 책임진다.
 * 그래서 여기서는 1) Bean Validation이 실제로 400을 내는지, 2) 정상 요청이면 producer를
 * 호출하고 202를 응답하는지, 3) Kafka 발행 실패가 503으로 매핑되는지만 검증한다.
 * 실제 Kafka 전송 로직(예외 매핑, accountId 파티션 키 지정 등)은 PaymentEventProducerTest에서
 * 별도로 검증하므로, 여기서는 producer를 MockitoBean으로 대체해 컨트롤러 계층만 분리해서 본다.
 */
@WebMvcTest(PaymentController.class)
class PaymentControllerTest {

    @Autowired
    private MockMvc mockMvc;

    // Jackson 자동설정 빈에 기대지 않고 직접 만든다 - 이 테스트 슬라이스에 ObjectMapper 빈이
    // 항상 있다고 보장되지 않으므로(WebMvcTest 컨텍스트 구성은 Spring Boot 버전에 따라 달라질 수
    // 있음), 이 테스트가 필요로 하는 건 "record를 JSON 문자열로 바꾸는 것" 뿐이라 직접 구성한다.
    private final ObjectMapper objectMapper = new ObjectMapper();

    @MockitoBean
    private PaymentEventProducer producer;

    private PaymentEventRequest validRequest() {
        return new PaymentEventRequest("idem-1", "merchant-1", "acc-1", 10_000L, "KRW", "KR", "CARD");
    }

    @Test
    void 정상_요청이면_202와_함께_producer를_호출한다() throws Exception {
        willDoNothing().given(producer).publish(any());

        mockMvc.perform(post("/payments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(validRequest())))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.idempotencyKey").value("idem-1"));

        verify(producer).publish(any());
    }

    @Test
    void kafka_발행에_실패하면_503을_반환한다() throws Exception {
        willThrow(new PaymentEventPublishException("Kafka 발행 실패", new RuntimeException()))
                .given(producer).publish(any());

        mockMvc.perform(post("/payments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(validRequest())))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.idempotencyKey").value("idem-1"));
    }

    @Test
    void idempotencyKey가_비어있으면_400이고_producer는_호출되지_않는다() throws Exception {
        String invalidJson = objectMapper.writeValueAsString(
                new PaymentEventRequest("", "merchant-1", "acc-1", 10_000L, "KRW", "KR", "CARD"));

        mockMvc.perform(post("/payments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(invalidJson))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(producer);
    }

    @Test
    void 금액이_0이하면_400이다() throws Exception {
        String invalidJson = objectMapper.writeValueAsString(
                new PaymentEventRequest("idem-1", "merchant-1", "acc-1", 0L, "KRW", "KR", "CARD"));

        mockMvc.perform(post("/payments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(invalidJson))
                .andExpect(status().isBadRequest());
    }

    @Test
    void 통화코드가_3자리가_아니면_400이다() throws Exception {
        String invalidJson = objectMapper.writeValueAsString(
                new PaymentEventRequest("idem-1", "merchant-1", "acc-1", 10_000L, "KR", "KR", "CARD"));

        mockMvc.perform(post("/payments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(invalidJson))
                .andExpect(status().isBadRequest());
    }
}
