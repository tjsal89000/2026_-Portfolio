"""
대시보드에서 슬랙 알림을 켜고 끌 수 있게 해주는 작은 HTTP 제어 서버.
alerts.py와 같은 Redis 키(alerts:enabled)를 공유하므로, 이 상태는
이상탐지 에이전트를 재기동해도(대시보드도 마찬가지) 그대로 유지된다.
"""

import asyncio

from aiohttp import web

from alerts import ENABLED_KEY, _redis

CONTROL_PORT = 8091


async def get_status(request: web.Request) -> web.Response:
    value = await _redis.get(ENABLED_KEY)
    return web.json_response({"enabled": value != "false"})


async def set_status(request: web.Request) -> web.Response:
    body = await request.json()
    enabled = bool(body.get("enabled", True))
    await _redis.set(ENABLED_KEY, "true" if enabled else "false")
    return web.json_response({"enabled": enabled})


@web.middleware
async def cors_middleware(request: web.Request, handler):
    # 대시보드를 nginx(80번) 대신 Vite 개발서버(5173번)로 직접 열었을 때도 토글이 동작하도록
    # 허용 - 이 프로젝트에서 이미 한 번 겪은 "포트 다르면 요청이 막힌다" 문제의 재발 방지.
    if request.method == "OPTIONS":
        response = web.Response()
    else:
        response = await handler(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


def build_app() -> web.Application:
    app = web.Application(middlewares=[cors_middleware])
    app.router.add_get("/status", get_status)
    app.router.add_post("/toggle", set_status)
    app.router.add_options("/{tail:.*}", lambda request: web.Response())
    return app


async def run_control_server() -> None:
    app = build_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", CONTROL_PORT)
    await site.start()
    print(f"[제어 서버 시작] 포트 {CONTROL_PORT} (GET /status, POST /toggle)")
    while True:
        await asyncio.sleep(3600)
