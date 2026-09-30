"""
fire_alert()의 두 가지 실질적인 관문(알림 on/off 여부, 쿨다운)을 검증한다.
실제 Redis/n8n에 연결하지 않도록 is_enabled()와 httpx 클라이언트를 둘 다 대체한다.
"""

from unittest.mock import AsyncMock

import pytest

import alerts


@pytest.fixture(autouse=True)
def _reset_cooldown_state(monkeypatch):
    alerts._last_fired.clear()
    # 실제 Redis를 몰라도 되도록, 기본값은 "켜짐"으로 고정해두고 필요한 테스트에서만 덮어쓴다.
    monkeypatch.setattr(alerts, "is_enabled", AsyncMock(return_value=True))
    yield


@pytest.mark.asyncio
async def test_알림이_꺼져있으면_웹훅을_보내지_않는다(monkeypatch):
    monkeypatch.setattr(alerts, "is_enabled", AsyncMock(return_value=False))
    client = AsyncMock()

    await alerts.fire_alert(client, "TPS_급증", {"현재TPS": 10})

    client.post.assert_not_called()


@pytest.mark.asyncio
async def test_켜져있으면_n8n_웹훅으로_타입과_상세를_담아_보낸다():
    client = AsyncMock()

    await alerts.fire_alert(client, "TPS_급증", {"현재TPS": 10})

    client.post.assert_awaited_once()
    args, kwargs = client.post.call_args
    assert args[0] == alerts.N8N_WEBHOOK_URL
    assert kwargs["json"]["type"] == "TPS_급증"
    assert kwargs["json"]["detail"] == {"현재TPS": 10}


@pytest.mark.asyncio
async def test_쿨다운_시간_안에는_같은_유형을_다시_보내지_않는다(monkeypatch):
    # 0에서 시작하면 "_last_fired에 기록 없음"의 기본값(0)과 겹쳐서 첫 호출부터 쿨다운으로
    # 오판하므로, 실제 monotonic()처럼 임의의 큰 값에서 시작한다.
    clock = [1000.0]
    monkeypatch.setattr(alerts.time, "monotonic", lambda: clock[0])
    client = AsyncMock()

    await alerts.fire_alert(client, "TPS_급증", {})
    clock[0] += alerts.COOLDOWN_SECONDS - 1
    await alerts.fire_alert(client, "TPS_급증", {})

    client.post.assert_awaited_once()


@pytest.mark.asyncio
async def test_쿨다운이_지나면_같은_유형도_다시_보낸다(monkeypatch):
    clock = [1000.0]
    monkeypatch.setattr(alerts.time, "monotonic", lambda: clock[0])
    client = AsyncMock()

    await alerts.fire_alert(client, "TPS_급증", {})
    clock[0] += alerts.COOLDOWN_SECONDS + 1
    await alerts.fire_alert(client, "TPS_급증", {})

    assert client.post.await_count == 2


@pytest.mark.asyncio
async def test_웹훅_전송_실패해도_예외를_밖으로_던지지_않는다():
    # n8n이 아직 안 떠있거나 꺼져있어도 탐지 루프 자체는 죽지 않아야 한다는 게 원래 의도.
    client = AsyncMock()
    client.post.side_effect = alerts.httpx.ConnectError("connection refused")

    await alerts.fire_alert(client, "TPS_급증", {})  # 예외 없이 조용히 끝나야 한다
