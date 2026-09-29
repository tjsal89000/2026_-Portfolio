"""
Redis에 쌓인 초단위 버킷 카운터(payment:count:*, payment:error:*)를 주기적으로 폴링해서
"지금 이 순간의 상태"가 평소와 다른지(TPS 급증, 에러율 상승) 확인한다.

DB Writer Consumer(Java)가 쓰는 키 규칙(PaymentMetricsService.java)과 MCP 서버(mcp-server/src/redis.ts)의
get_realtime_metrics가 읽는 방식을 그대로 재사용한다 - 이 프로젝트 전체에서 "실시간 집계"는 항상
이 초단위 버킷 방식 하나로 통일했다.
"""

import asyncio
import time

import httpx
import redis.asyncio as redis

from alerts import fire_alert

POLL_INTERVAL_SECONDS = 5
SHORT_WINDOW_SECONDS = 10   # "지금" 구간
BASELINE_WINDOW_SECONDS = 60  # "평소" 구간

TPS_SPIKE_MULTIPLIER = 3.0   # 지금 TPS가 평소의 몇 배 이상이면 이상으로 볼지
ERROR_RATE_THRESHOLD_PERCENT = 5.0


def _sum_bucket(values: list[str | None]) -> int:
    return sum(int(v) for v in values if v is not None)


async def _window_sum(client: redis.Redis, prefix: str, window_seconds: int) -> int:
    now = int(time.time())
    keys = [f"{prefix}{now - i}" for i in range(window_seconds)]
    values = await client.mget(keys)
    return _sum_bucket(values)


async def watch_redis_metrics(redis_client: redis.Redis, http_client: httpx.AsyncClient) -> None:
    print(f"[Redis 감시 시작] {POLL_INTERVAL_SECONDS}초마다 TPS/에러율 확인")

    while True:
        short_count = await _window_sum(redis_client, "payment:count:", SHORT_WINDOW_SECONDS)
        baseline_count = await _window_sum(redis_client, "payment:count:", BASELINE_WINDOW_SECONDS)
        short_errors = await _window_sum(redis_client, "payment:error:", SHORT_WINDOW_SECONDS)

        short_tps = short_count / SHORT_WINDOW_SECONDS
        baseline_tps = baseline_count / BASELINE_WINDOW_SECONDS

        # TPS 급증 판정: 평소 TPS가 너무 낮으면(거의 0) 비율 계산이 의미 없어지므로,
        # 최소 기준치(1 TPS) 이상일 때만 "몇 배 증가"를 따진다.
        if baseline_tps >= 1.0 and short_tps >= baseline_tps * TPS_SPIKE_MULTIPLIER:
            await fire_alert(
                http_client, "TPS_급증",
                {"현재TPS": round(short_tps, 2), "평소TPS": round(baseline_tps, 2)}
            )

        if short_count > 0:
            error_rate = (short_errors / short_count) * 100
            if error_rate > ERROR_RATE_THRESHOLD_PERCENT:
                await fire_alert(
                    http_client, "에러율_상승",
                    {"최근10초_에러율(%)": round(error_rate, 2), "처리건수": short_count, "에러건수": short_errors}
                )

        await asyncio.sleep(POLL_INTERVAL_SECONDS)
