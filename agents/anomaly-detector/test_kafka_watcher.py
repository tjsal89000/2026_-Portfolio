"""
kafka_watcher.py의 두 탐지 함수(_check_repeated_account/_check_concentration)는 순수하게
모듈 전역 상태(deque)만 들여다보는 동기 함수라, Kafka나 httpx 없이도 직접 호출해서 검증할 수 있다.
watch_kafka_events() 자체(무한루프 + 실제 Kafka 컨슈머)는 여기서 다루지 않는다.
"""

import pytest

import kafka_watcher as kw


@pytest.fixture(autouse=True)
def _reset_module_state():
    # 두 전역 상태 모두 deque라 테스트 간에 그대로 이어지면 순서 의존적인 실패가 나므로 매번 비운다.
    kw._account_timestamps.clear()
    kw._recent_country_method.clear()
    yield


class TestCheckRepeatedAccount:
    def test_임계치_미만이면_None을_반환한다(self):
        for _ in range(kw.REPEATED_ACCOUNT_THRESHOLD - 1):
            assert kw._check_repeated_account("acc-1") is None

    def test_임계치에_도달하면_누적_건수를_반환한다(self):
        result = None
        for _ in range(kw.REPEATED_ACCOUNT_THRESHOLD):
            result = kw._check_repeated_account("acc-1")
        assert result == kw.REPEATED_ACCOUNT_THRESHOLD

    def test_계좌가_다르면_서로_영향을_주지_않는다(self):
        for _ in range(kw.REPEATED_ACCOUNT_THRESHOLD - 1):
            kw._check_repeated_account("acc-1")
        assert kw._check_repeated_account("acc-2") is None

    def test_윈도우_밖으로_나간_요청은_세지_않는다(self, monkeypatch):
        clock = [0.0]
        monkeypatch.setattr(kw.time, "monotonic", lambda: clock[0])

        for _ in range(kw.REPEATED_ACCOUNT_THRESHOLD - 1):
            kw._check_repeated_account("acc-1")

        # 윈도우(10초)를 완전히 지나 보낸 뒤 한 번 더 요청하면, 이전 기록은 이미 다 밀려나서
        # 새로 센 1건뿐이라 여전히 임계치 미만이어야 한다.
        clock[0] = kw.REPEATED_ACCOUNT_WINDOW_SECONDS + 1
        assert kw._check_repeated_account("acc-1") is None


class TestCheckConcentration:
    def test_데이터가_윈도우만큼_안_쌓였으면_None이다(self):
        for _ in range(kw.CONCENTRATION_WINDOW_SIZE - 1):
            kw._recent_country_method.append(("US", "WALLET"))
        assert kw._check_concentration() is None

    def test_KR_CARD_쏠림은_정상으로_보고_알리지_않는다(self):
        for _ in range(kw.CONCENTRATION_WINDOW_SIZE):
            kw._recent_country_method.append(("KR", "CARD"))
        assert kw._check_concentration() is None

    def test_KR_아닌_국가가_임계비중_이상이면_국가_쏠림을_반환한다(self):
        half = kw.CONCENTRATION_WINDOW_SIZE // 2
        for _ in range(half):
            kw._recent_country_method.append(("US", "CARD"))
        for _ in range(kw.CONCENTRATION_WINDOW_SIZE - half):
            kw._recent_country_method.append(("KR", "CARD"))

        kind, value, ratio = kw._check_concentration()
        assert kind == "국가"
        assert value == "US"
        assert ratio == pytest.approx(half / kw.CONCENTRATION_WINDOW_SIZE)

    def test_CARD_아닌_결제수단이_임계비중_이상이면_결제수단_쏠림을_반환한다(self):
        half = kw.CONCENTRATION_WINDOW_SIZE // 2
        for _ in range(half):
            kw._recent_country_method.append(("KR", "WALLET"))
        for _ in range(kw.CONCENTRATION_WINDOW_SIZE - half):
            kw._recent_country_method.append(("KR", "CARD"))

        kind, value, _ratio = kw._check_concentration()
        assert kind == "결제수단"
        assert value == "WALLET"
