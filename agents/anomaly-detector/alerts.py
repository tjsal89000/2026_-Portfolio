"""
이상 감지 결과를 n8n 웹훅으로 보내는 부분만 따로 뗀 모듈.
Redis 기반 탐지든 Kafka 기반 탐지든 "이상을 알리는 방식"은 하나로 통일한다.
"""

import os
import time

import httpx
import redis.asyncio as redis

# k8s에서는 N8N_WEBHOOK_URL 환경변수로 n8n 서비스 주소를 주입한다
N8N_WEBHOOK_URL = os.environ.get("N8N_WEBHOOK_URL", "http://localhost:5678/webhook/payment-anomaly")
# n8n 웹훅은 공개 주소라서, 이 값을 헤더로 같이 보내야 n8n이 알림을 중계한다 (k8s에서는 Secret에서 주입)
N8N_WEBHOOK_SECRET = os.environ.get("N8N_WEBHOOK_SECRET", "")

# 알림 on/off 상태를 Redis에 둬서, 대시보드의 토글 스위치(control_server.py)와
# 이 프로세스가 같은 값을 공유한다. 키가 없으면(최초 실행) 기본값은 켜짐.
ENABLED_KEY = "alerts:enabled"
_redis = redis.Redis(
    host=os.environ.get("REDIS_HOST", "localhost"),
    port=int(os.environ.get("REDIS_PORT", "6379")),
    decode_responses=True,
)


async def is_enabled() -> bool:
    value = await _redis.get(ENABLED_KEY)
    return value != "false"


# 같은 종류의 이상을 매번 알리면 웹훅이 스팸처럼 쏟아진다 (예: "반복요청" 이상 패턴 하나가
# 실제로는 8~15건의 개별 메시지로 들어오는데, 그때마다 다 알리면 알림 15개가 됨).
# 그래서 이상 유형별로 마지막으로 알린 시각을 기억해뒀다가, 쿨다운 시간 안에는 또 안 보낸다.
COOLDOWN_SECONDS = 15
_last_fired: dict[str, float] = {}


async def fire_alert(client: httpx.AsyncClient, anomaly_type: str, detail: dict) -> None:
    if not await is_enabled():
        return  # 알림이 꺼져있어도 탐지 로직 자체는 계속 동작 - 전송만 조용히 생략

    now = time.monotonic()
    last = _last_fired.get(anomaly_type, 0)
    if now - last < COOLDOWN_SECONDS:
        return  # 쿨다운 중이면 조용히 무시

    _last_fired[anomaly_type] = now
    payload = {"type": anomaly_type, "detail": detail, "detectedAt": time.time()}

    print(f"\n🚨 [이상탐지] {anomaly_type} - {detail}")
    try:
        await client.post(
            N8N_WEBHOOK_URL,
            json=payload,
            headers={"x-alert-secret": N8N_WEBHOOK_SECRET},
            timeout=5.0,
        )
    except httpx.HTTPError as e:
        # n8n이 아직 이 웹훅을 안 만들었거나(Phase 7 이전) 꺼져있어도, 이상탐지 로직 자체는
        # 계속 동작해야 하므로 여기서 예외를 삼키고 로그만 남긴다.
        print(f"  (웹훅 전송 실패 - n8n 워크플로우가 아직 없거나 꺼져있을 수 있음: {e})")
