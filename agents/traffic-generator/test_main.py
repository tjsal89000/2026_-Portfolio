"""
normal_payload()는 순수 함수라(네트워크 호출 없음) 직접 호출해서 검증할 수 있다.
send()/anomaly_*()/main()은 실제 httpx 요청과 무한루프를 포함해서 이 범위에서는 다루지 않는다.
"""

import uuid

import main as tg


class TestNormalPayload:
    def test_인자를_주면_그대로_사용한다(self):
        payload = tg.normal_payload(account_id="acct-00001", amount=12345, country="US", method="WALLET")

        assert payload["accountId"] == "acct-00001"
        assert payload["amount"] == 12345
        assert payload["country"] == "US"
        assert payload["paymentMethod"] == "WALLET"

    def test_인자를_안_주면_정의된_범위_안에서_무작위로_채운다(self):
        for _ in range(50):
            payload = tg.normal_payload()
            assert payload["accountId"] in tg.ACCOUNT_POOL
            assert tg.NORMAL_AMOUNT_RANGE[0] <= payload["amount"] <= tg.NORMAL_AMOUNT_RANGE[1]
            assert payload["country"] in tg.COUNTRIES_WEIGHTED
            assert payload["paymentMethod"] in tg.METHODS_WEIGHTED

    def test_통화는_항상_KRW로_고정된다(self):
        assert tg.normal_payload()["currency"] == "KRW"

    def test_idempotencyKey는_매번_다른_UUID다(self):
        keys = {tg.normal_payload()["idempotencyKey"] for _ in range(20)}
        assert len(keys) == 20
        for key in keys:
            uuid.UUID(key)  # 형식이 아니면 여기서 ValueError
