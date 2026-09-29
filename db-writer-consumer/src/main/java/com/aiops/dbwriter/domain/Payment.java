package com.aiops.dbwriter.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** db/init.sql의 payments 테이블과 1:1로 매핑되는 JPA 엔티티. */
@Entity
@Table(name = "payments")
public class Payment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // UNIQUE 제약이 걸려있어서, 같은 값으로 저장을 시도하면 DB가 DataIntegrityViolationException을 던진다.
    // 이게 이 프로젝트 멱등성 처리의 핵심 - 애플리케이션 코드가 아니라 DB가 최종 방어선.
    @Column(name = "idempotency_key", nullable = false, unique = true)
    private UUID idempotencyKey;

    @Column(name = "merchant_id", nullable = false)
    private String merchantId;

    @Column(name = "account_id", nullable = false)
    private String accountId;

    @Column(nullable = false)
    private Long amount;

    @Column(nullable = false)
    private String currency;

    @Column(nullable = false)
    private String country;

    @Column(name = "payment_method", nullable = false)
    private String paymentMethod;

    @Column(name = "requested_at", nullable = false)
    private Instant requestedAt;

    @Column(name = "processed_at", nullable = false)
    private Instant processedAt;

    protected Payment() {
        // JPA가 리플렉션으로 객체를 만들 때 필요한 기본 생성자 (직접 호출하지 않음)
    }

    public Payment(UUID idempotencyKey, String merchantId, String accountId, Long amount,
                   String currency, String country, String paymentMethod, Instant requestedAt) {
        this.idempotencyKey = idempotencyKey;
        this.merchantId = merchantId;
        this.accountId = accountId;
        this.amount = amount;
        this.currency = currency;
        this.country = country;
        this.paymentMethod = paymentMethod;
        this.requestedAt = requestedAt;
        this.processedAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public UUID getIdempotencyKey() {
        return idempotencyKey;
    }

    public String getAccountId() {
        return accountId;
    }
}
