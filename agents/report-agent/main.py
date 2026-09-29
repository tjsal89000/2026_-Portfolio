"""
AI 분석/요약 리포트 에이전트

LLM(Google Gemini)의 tool(function) calling으로 MCP 서버(mcp-server, 포트 8090)가 노출하는
4개 도구(get_kafka_lag/get_realtime_metrics/query_recent_payments/get_payment_summary)를
직접 호출해서 데이터를 조회하고, 그 결과를 바탕으로 리포트를 작성해 Postgres에 저장한다.

DB를 직접 쿼리하지 않고 MCP 서버를 거치는 이유: 이 프로젝트에서 MCP 서버를 만든 목적이
"Claude Code 하나만 쓰는 도구"가 아니라 "여러 AI 에이전트가 재사용할 수 있는 도구 계층"이라는
것을 실제로 증명하기 위함 - 이 에이전트가 두 번째 소비자가 된다.

LLM으로 Gemini를 쓴 이유: Claude API는 카드 등록 후 선불 크레딧을 충전해야 해서, 포트폴리오
예산 제약상 카드 등록 없이 바로 발급되는 Gemini 무료 티어로 대체했다. 이 에이전트는 MCP
도구 호출 구조(tool calling)만 표준적으로 맞춰져 있으면 어떤 LLM 벤더로도 교체 가능하도록
설계했고, 실무라면 사내 표준 LLM(Claude 등)으로 그대로 바꿔 끼우면 된다.
"""

import asyncio
import os

from aiohttp import web
from dotenv import load_dotenv
from google import genai
from google.genai import types
from google.genai.errors import ServerError
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

from db import save_report

load_dotenv()

# k8s에서는 MCP_SERVER_URL 환경변수로 mcp-server Service 주소를 주입한다
MCP_SERVER_URL = os.environ.get("MCP_SERVER_URL", "http://localhost:8090/mcp")
MODEL = "gemini-3.5-flash-lite"
CONTROL_PORT = 8092

SYSTEM_PROMPT = (
    "당신은 결제 플랫폼의 운영 리포트를 작성하는 AI 분석가입니다. "
    "제공된 도구로 카프카 컨슈머 랙, 최근 실시간 트래픽 지표, 최근 결제 내역, 결제 요약 통계를 "
    "조회한 뒤, 운영자가 한눈에 볼 수 있는 한국어 요약 리포트를 작성하세요.\n"
    "형식:\n"
    "1) 트래픽 현황\n"
    "2) 이상 징후 유무\n"
    "3) 시스템 상태(Kafka Lag 등)\n"
    "4) 종합 의견\n"
    "숫자는 반드시 도구 호출 결과에 있는 값만 사용하고 추측하지 마세요.\n"
    "도구는 한 번에 하나씩만 호출하세요. 여러 도구가 필요하면 한 턴에 병렬로 여러 개를 "
    "호출하지 말고, 하나를 호출해 결과를 받은 뒤 다음 도구를 호출하세요."
)


async def _send_with_retry(chat, message):
    # Gemini 무료 티어는 수요가 몰리면 503(UNAVAILABLE)을 자주 반환한다 - 구글도
    # "보통 일시적"이라고 명시하므로, 짧은 지수 백오프로 재시도한다.
    delay = 3
    for attempt in range(5):
        try:
            return chat.send_message(message)
        except ServerError as e:
            if e.code != 503 or attempt == 4:
                raise
            print(f"  (503 과부하 - {delay}초 후 재시도, {attempt + 1}/5)")
            await asyncio.sleep(delay)
            delay *= 2


def _mcp_tools_to_gemini(tools) -> types.Tool:
    declarations = []
    for t in tools:
        schema = dict(t.inputSchema) if t.inputSchema else {"type": "object", "properties": {}}
        # MCP의 JSON Schema에는 있지만 Gemini 함수 스키마가 모르는 키라 제거해야 함
        schema.pop("$schema", None)
        schema.pop("additionalProperties", None)
        declarations.append(
            types.FunctionDeclaration(name=t.name, description=t.description or "", parameters=schema)
        )
    return types.Tool(function_declarations=declarations)


async def generate_report() -> str:
    async with streamablehttp_client(MCP_SERVER_URL) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = (await session.list_tools()).tools
            gemini_tool = _mcp_tools_to_gemini(tools)

            client = genai.Client(api_key=os.environ["GOOGLE_API_KEY"])
            # 대화 히스토리(및 Gemini 3.x의 tool-use 내부 상태인 thought_signature)를 SDK의
            # chat 세션이 직접 관리하게 한다 - 직접 contents 리스트를 재구성하면 이 내부
            # 메타데이터가 유실돼 "missing thought_signature" 오류가 났다.
            chat = client.chats.create(
                model=MODEL,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    tools=[gemini_tool],
                ),
            )

            message = "최근 상황을 조사해서 운영 리포트를 작성해줘."
            while True:
                response = await _send_with_retry(chat, message)
                candidate = response.candidates[0]

                function_calls = [
                    part.function_call for part in candidate.content.parts if part.function_call
                ]
                if not function_calls:
                    return "".join(part.text for part in candidate.content.parts if part.text)

                response_parts = []
                for fc in function_calls:
                    result = await session.call_tool(fc.name, dict(fc.args or {}))
                    result_text = "".join(c.text for c in result.content if hasattr(c, "text"))
                    response_parts.append(
                        types.Part.from_function_response(
                            name=fc.name, response={"result": result_text}
                        )
                    )
                message = response_parts


async def run_once() -> dict:
    report = await generate_report()
    report_id = save_report(report)
    print("\n" + "=" * 60)
    print(report)
    print("=" * 60)
    print(f"[저장 완료] reports.id={report_id}")
    return {"id": report_id, "summary": report}


# n8n의 Schedule Trigger가 HTTP Request 노드로 이 엔드포인트를 주기 호출하게 하기 위한
# 최소한의 트리거 서버 (이상탐지 에이전트의 control_server.py와 같은 패턴).
async def trigger_report(request: web.Request) -> web.Response:
    result = await run_once()
    return web.json_response(result)


def build_app() -> web.Application:
    app = web.Application()
    app.router.add_post("/generate", trigger_report)
    return app


async def run_server() -> None:
    app = build_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", CONTROL_PORT)
    await site.start()
    print(f"[리포트 트리거 서버 시작] 포트 {CONTROL_PORT} (POST /generate)")
    while True:
        await asyncio.sleep(3600)


if __name__ == "__main__":
    import sys

    if "--once" in sys.argv:
        asyncio.run(run_once())
    else:
        asyncio.run(run_server())
