"""
이상탐지/장애대응 에이전트

Redis 기반 집계 탐지(TPS 급증, 에러율 상승)와 Kafka 기반 콘텐츠 탐지(고액이상치, 반복요청, 쏠림)를
asyncio.gather로 동시에 돌린다. 서로 독립적인 두 감시 루프라 하나가 죽어도(예: Redis 연결 문제)
다른 하나는 계속 동작하는 게 이상적이지만, 지금 단계에서는 단순하게 둘 다 함께 실행한다.
"""

import asyncio
import os

import httpx
import redis.asyncio as redis

from control_server import run_control_server
from kafka_watcher import watch_kafka_events
from redis_watcher import watch_redis_metrics

REDIS_HOST = os.environ.get("REDIS_HOST", "localhost")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))


async def main() -> None:
    redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    async with httpx.AsyncClient() as http_client:
        await asyncio.gather(
            watch_redis_metrics(redis_client, http_client),
            watch_kafka_events(http_client),
            run_control_server(),
        )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n이상탐지 에이전트 중단됨")
