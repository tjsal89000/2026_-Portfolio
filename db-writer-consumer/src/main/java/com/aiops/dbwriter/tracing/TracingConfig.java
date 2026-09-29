package com.aiops.dbwriter.tracing;

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
 * payment-api의 TracingConfig.java와 완전히 동일한 배선 (문제해결_로그.md [2]번 참고 -
 * 이 Spring Boot 버전은 OTLP 트레이싱 자동설정이 없어 수동 배선이 필요함).
 *
 * 핵심: Kafka 메시지 헤더에 payment-api가 실어 보낸 trace 정보를, 여기서도 같은 방식으로
 * OTel Propagator를 등록해두면 Spring Kafka의 Observation이 자동으로 읽어서
 * "같은 trace의 연속"으로 이어붙여준다 - 그래서 결제 API 호출 하나가 Kafka를 거쳐
 * DB Writer Consumer까지 처리되는 전체 흐름을 trace 하나로 볼 수 있게 된다.
 */
@Configuration
public class TracingConfig {

    @Value("${spring.application.name}")
    private String serviceName;

    // k8s에서는 OTEL_EXPORTER_OTLP_ENDPOINT 환경변수로 Tempo 서비스 주소를 주입한다
    // (로컬 기본값 127.0.0.1인 이유는 payment-api의 TracingConfig.java 주석 참고)
    @Value("${otel.exporter.otlp.endpoint:http://127.0.0.1:4318/v1/traces}")
    private String otlpEndpoint;

    @Bean
    public SpanExporter otlpSpanExporter() {
        return OtlpHttpSpanExporter.builder()
                .setEndpoint(otlpEndpoint)
                .build();
    }

    @Bean
    public OpenTelemetry openTelemetry(SpanExporter otlpSpanExporter) {
        Resource resource = Resource.getDefault().toBuilder()
                .put("service.name", serviceName)
                .build();

        SdkTracerProvider tracerProvider = SdkTracerProvider.builder()
                .setResource(resource)
                .addSpanProcessor(BatchSpanProcessor.builder(otlpSpanExporter).build())
                .build();

        return OpenTelemetrySdk.builder()
                .setTracerProvider(tracerProvider)
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

    @Bean
    public Tracer micrometerTracer(io.opentelemetry.api.trace.Tracer otelTracer,
                                    OtelCurrentTraceContext otelCurrentTraceContext) {
        return new OtelTracer(otelTracer, otelCurrentTraceContext, event -> { });
    }

    @Bean
    public Propagator propagator(OpenTelemetry openTelemetry, io.opentelemetry.api.trace.Tracer otelTracer) {
        return new OtelPropagator(openTelemetry.getPropagators(), otelTracer);
    }

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
