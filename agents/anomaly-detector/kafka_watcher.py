"""
payment.events 토픽을 직접 구독해서, 메시지 "내용"을 보고 판단해야 하는 이상 패턴을 잡는다.
Redis 쪽(redis_watcher.py)은 "지금 상황이 평소와 다른가"라는 집계 관점이라면,
여기는 "이 메시지 자체가 이상한가"라는 콘텐츠 관점이다.

db-writer-consumer와는 다른 Consumer Group("anomaly-detector-group")으로 구독한다 -
같은 그룹이면 파티션을 나눠 갖게 돼서 db-writer-consumer가 처리할 메시지를 이 에이전트가
가로채가는 꼴이 되기 때문에, 반드시 별도 그룹이어야 "각자 독립적으로 전체 스트림을 읽는다"는
이 프로젝트의 Kafka 설계 원칙(WORKFLOW.md 참고)이 지켜진다.
"""

import json
import os
import time
from collections import defaultdict, deque

import httpx
from aiokafka import AIOKafkaConsumer

from alerts import fire_alert

# k8s에서는 KAFKA_BOOTSTRAP_SERVERS 환경변수로 Kafka 서비스 주소를 주입한다
KAFKA_BOOTSTRAP_SERVERS = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
TOPIC = "payment.events"
GROUP_ID = "anomaly-detector-group"

LARGE_AMOUNT_THRESHOLD = 5_000_000  # 트래픽 생성기의 "고액이상치" 시나리오(500만~2500만원)와 맞물리는 값

REPEATED_ACCOUNT_WINDOW_SECONDS = 10
REPEATED_ACCOUNT_THRESHOLD = 5

CONCENTRATION_WINDOW_SIZE = 20
CONCENTRATION_RATIO_THRESHOLD = 0.5

# 계좌별 최근 요청 시각을 들고 있다가, 창(window) 밖으로 나간 건 지워가며 "최근 N초간 몇 번 왔는지"를 센다.
_account_timestamps: dict[str, deque[float]] = defaultdict(deque)
# 최근 N건의 (country, paymentMethod)만 큐에 들고 있다가, 그 안에서 특정 값 비중을 계산한다.
_recent_country_method: deque[tuple[str, str]] = deque(maxlen=CONCENTRATION_WINDOW_SIZE)


def _check_repeated_account(account_id: str) -> int | None:
    now = time.monotonic()
    timestamps = _account_timestamps[account_id]
    timestamps.append(now)

    while timestamps and now - timestamps[0] > REPEATED_ACCOUNT_WINDOW_SECONDS:
        timestamps.popleft()

    return len(timestamps) if len(timestamps) >= REPEATED_ACCOUNT_THRESHOLD else None


def _check_concentration() -> tuple[str, str, float] | None:
    if len(_recent_country_method) < CONCENTRATION_WINDOW_SIZE:
        return None  # 아직 데이터가 충분히 안 쌓였으면 판단 보류

    total = len(_recent_country_method)
    country_counts: dict[str, int] = defaultdict(int)
    method_counts: dict[str, int] = defaultdict(int)
    for country, method in _recent_country_method:
        country_counts[country] += 1
        method_counts[method] += 1

    # KR/CARD는 애초에 "정상적으로도 비중이 높은" 값이라 쏠림 판정에서 제외하고,
    # 그 외 값이 튀는 경우만 이상으로 본다.
    for country, count in country_counts.items():
        if country != "KR" and (count / total) >= CONCENTRATION_RATIO_THRESHOLD:
            return "국가", country, count / total
    for method, count in method_counts.items():
        if method != "CARD" and (count / total) >= CONCENTRATION_RATIO_THRESHOLD:
            return "결제수단", method, count / total

    return None


async def watch_kafka_events(http_client: httpx.AsyncClient) -> None:
    consumer = AIOKafkaConsumer(
        TOPIC,
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        group_id=GROUP_ID,
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
        # 이 에이전트는 과거 이력을 다시 훑을 필요 없이 "지금부터 벌어지는 일"만 보면 되므로
        # earliest가 아니라 latest로 시작한다 (db-writer-consumer와는 목적이 다름).
        auto_offset_reset="latest",
        enable_auto_commit=True,  # 이 에이전트는 멱등성 저장을 하는 게 아니라 관찰만 하므로, 정교한 커밋 관리가 필요 없음
    )

    await consumer.start()
    print(f"[Kafka 감시 시작] '{TOPIC}' 토픽 구독 (group={GROUP_ID})")

    try:
        async for msg in consumer:
            event = msg.value
            account_id = event.get("accountId", "")
            amount = event.get("amount", 0)
            country = event.get("country", "")
            method = event.get("paymentMethod", "")

            if amount > LARGE_AMOUNT_THRESHOLD:
                await fire_alert(
                    http_client, "고액이상치",
                    {"accountId": account_id, "amount": amount, "country": country}
                )

            repeated_count = _check_repeated_account(account_id)
            if repeated_count is not None:
                await fire_alert(
                    http_client, "반복요청",
                    {"accountId": account_id, f"최근{REPEATED_ACCOUNT_WINDOW_SECONDS}초_요청수": repeated_count}
                )

            _recent_country_method.append((country, method))
            concentration = _check_concentration()
            if concentration is not None:
                kind, value, ratio = concentration
                await fire_alert(
                    http_client, "쏠림",
                    {"구분": kind, "값": value, f"최근{CONCENTRATION_WINDOW_SIZE}건_비중": f"{ratio * 100:.0f}%"}
                )
    finally:
        await consumer.stop()
