package com.aiops.paymentapi.tracing;

import io.micrometer.observation.ObservationHandler;
import io.micrometer.observation.ObservationRegistry;
import io.micrometer.tracing.Tracer;
import io.micrometer.tracing.handler.DefaultTracingObservationHandler;
import io.micrometer.tracing.handler.PropagatingReceiverTracingObservationHandler;
import io.micrometer.tracing.handler.PropagatingSenderTracingObservationHandler;
import io.micrometer.tracing.otel.bridge.OtelCurrentTraceContext;
import io.micrometer.tracing.otel.bridge.OtelPropagator;
import io.micrometer.tracing.otel.bridge.OtelTracer;
import io.micrometer.tracing.propagation.Propagator;
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.trace.propagation.W3CTraceContextPropagator;
import io.opentelemetry.context.propagation.ContextPropagators;
import io.opentelemetry.exporter.otlp.http.trace.OtlpHttpSpanExporter;
import io.opentelemetry.sdk.OpenTelemetrySdk;
import io.opentelemetry.sdk.resources.Resource;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.export.BatchSpanProcessor;
import io.opentelemetry.sdk.trace.export.SpanExporter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.micrometer.observation.autoconfigure.ObservationRegistryCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 이 Spring Boot 버전(4.1.1)은 spring-boot-actuator-autoconfigure 안에
 * OTLP 트레이싱 자동설정 클래스가 들어있지 않다는 걸 jar를 직접 열어서 확인했다
 * (문제해결_로그.md [2]번 참고). management.tracing 이나 management.otlp.tracing 관련 프로퍼티만으론
 * 아무 일도 안 일어나서, OpenTelemetry SDK와 Micrometer Tracing을 여기서 직접 연결한다.
 *
 * 배선 순서: OTel SDK(누구에게 span을 보낼지) -> Micrometer Tracing Bridge(OTel을 Micrometer가 쓸 형태로 감쌈)
 * -> ObservationRegistry에 "트레이싱 핸들러" 등록(Spring MVC/Kafka가 만드는 Observation을 실제 span으로 기록)
 */
@Configuration
public class TracingConfig {

    @Value("${spring.application.name}")
    private String serviceName;

    // 로컬 개발 기본값은 127.0.0.1(IPv4) - localhost(=::1, IPv6)로 접속하면 Windows에서
    // WSL2의 wslrelay.exe가 같은 포트를 점유하고 있어 Docker의 포트포워딩이 아니라 그쪽으로
    // 연결이 가로채져 "unexpected end of stream" 에러가 났었다(문제해결_로그.md [2]번 참고).
    // k8s에서는 OTEL_EXPORTER_OTLP_ENDPOINT 환경변수로 Tempo 서비스 주소(예: http://tempo:4318/v1/traces)를 주입한다.
    @Value("${otel.exporter.otlp.endpoint:http://127.0.0.1:4318/v1/traces}")
    private String otlpEndpoint;

    /** span을 어디로(Tempo의 OTLP HTTP 엔드포인트) 내보낼지 */
    @Bean
    public SpanExporter otlpSpanExporter() {
        return OtlpHttpSpanExporter.builder()
                .setEndpoint(otlpEndpoint)
                .build();
    }

    /** OTel SDK 본체 - span을 만들고, 배치로 모아서(BatchSpanProcessor) 내보내는 역할 */
    @Bean
    public OpenTelemetry openTelemetry(SpanExporter otlpSpanExporter) {
        Resource resource = Resource.getDefault().toBuilder()
                .put("service.name", serviceName) // Tempo/Grafana에서 "이 span이 어느 서비스 건지" 구분하는 값
                .build();

        SdkTracerProvider tracerProvider = SdkTracerProvider.builder()
                .setResource(resource)
                .addSpanProcessor(BatchSpanProcessor.builder(otlpSpanExporter).build())
                .build();

        return OpenTelemetrySdk.builder()
                .setTracerProvider(tracerProvider)
                // W3C traceparent 헤더 포맷 - HTTP 헤더/Kafka 메시지 헤더로 trace 정보를 실어 보낼 때 쓰는 표준 포맷
                .setPropagators(ContextPropagators.create(W3CTraceContextPropagator.getInstance()))
                .build();
    }

    @Bean
    public io.opentelemetry.api.trace.Tracer otelTracer(OpenTelemetry openTelemetry) {
        return openTelemetry.getTracer(serviceName);
    }

    @Bean
    public OtelCurrentTraceContext otelCurrentTraceContext() {
        return new OtelCurrentTraceContext();
    }

    /** Micrometer가 이해하는 Tracer 인터페이스 - 내부적으로 OTel Tracer를 감싸서 동작(어댑터 패턴) */
    @Bean
    public Tracer micrometerTracer(io.opentelemetry.api.trace.Tracer otelTracer,
                                    OtelCurrentTraceContext otelCurrentTraceContext) {
        return new OtelTracer(otelTracer, otelCurrentTraceContext, event -> { });
    }

    /** trace 정보를 HTTP 헤더/Kafka 메시지 헤더에 넣고 빼는 역할 */
    @Bean
    public Propagator propagator(OpenTelemetry openTelemetry, io.opentelemetry.api.trace.Tracer otelTracer) {
        return new OtelPropagator(openTelemetry.getPropagators(), otelTracer);
    }

    /**
     * Spring MVC(HTTP 요청)와 Spring Kafka(send/receive, Phase 1~2에서 observationEnabled=true로 켜둔 부분)가
     * 만드는 Observation을, 위에서 만든 Tracer/Propagator를 이용해 실제 span으로 기록하도록 연결한다.
     * (Spring Boot가 자동으로 해주던 걸 여기서 수동으로 재현하는 부분)
     */
    @Bean
    public ObservationRegistryCustomizer<ObservationRegistry> tracingObservationRegistryCustomizer(
            Tracer tracer, Propagator propagator) {
        return registry -> registry.observationConfig().observationHandler(
                new ObservationHandler.FirstMatchingCompositeObservationHandler(
                        new PropagatingSenderTracingObservationHandler<>(tracer, propagator),
                        new PropagatingReceiverTracingObservationHandler<>(tracer, propagator),
                        new DefaultTracingObservationHandler(tracer)
                )
        );
    }
}
