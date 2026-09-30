"""
_mcp_tools_to_gemini()는 MCP 서버가 내려준 JSON Schema를 Gemini 함수 선언 형식으로
바꿔주는 순수 변환 로직이다 - 실제 MCP 세션이나 Gemini API 호출 없이 이 함수 하나만 검증한다.

types.FunctionDeclaration/types.Tool은 그 자체가 이 함수의 산출물이 아니라 google-genai SDK의
pydantic 모델이라(생성자에 넘긴 dict를 자기 내부 Schema 타입으로 다시 감싸버려서 나중에
꺼내 비교하기 어려움), 두 생성자를 패치해서 "_mcp_tools_to_gemini가 실제로 어떤 인자를
넘겼는가"만 캡처해서 검증한다 - 이 함수가 하는 일(스키마 정리)에만 집중하는 방식.
"""

from types import SimpleNamespace
from unittest.mock import patch

import main


def _mcp_tool(name: str, description: str | None, input_schema: dict | None):
    return SimpleNamespace(name=name, description=description, inputSchema=input_schema)


class TestMcpToolsToGemini:
    def test_스키마의_불필요한_키를_제거한다(self):
        tool = _mcp_tool(
            "get_kafka_lag",
            "Kafka lag 조회",
            {"$schema": "http://json-schema.org/draft-07/schema#", "additionalProperties": False,
             "type": "object", "properties": {}},
        )

        with patch("main.types.FunctionDeclaration") as mock_decl, patch("main.types.Tool"):
            main._mcp_tools_to_gemini([tool])

        mock_decl.assert_called_once_with(
            name="get_kafka_lag",
            description="Kafka lag 조회",
            parameters={"type": "object", "properties": {}},
        )

    def test_inputSchema가_없으면_빈_object_스키마로_대체한다(self):
        tool = _mcp_tool("get_payment_summary", "결제 요약", None)

        with patch("main.types.FunctionDeclaration") as mock_decl, patch("main.types.Tool"):
            main._mcp_tools_to_gemini([tool])

        mock_decl.assert_called_once_with(
            name="get_payment_summary",
            description="결제 요약",
            parameters={"type": "object", "properties": {}},
        )

    def test_description이_없으면_빈_문자열로_대체한다(self):
        tool = _mcp_tool("query_recent_payments", None, {"type": "object", "properties": {}})

        with patch("main.types.FunctionDeclaration") as mock_decl, patch("main.types.Tool"):
            main._mcp_tools_to_gemini([tool])

        assert mock_decl.call_args.kwargs["description"] == ""

    def test_여러_도구를_모두_변환해_하나의_Tool로_묶는다(self):
        tools = [
            _mcp_tool("get_kafka_lag", "d1", {"type": "object", "properties": {}}),
            _mcp_tool("get_realtime_metrics", "d2", {"type": "object", "properties": {}}),
        ]

        with patch("main.types.FunctionDeclaration") as mock_decl, patch("main.types.Tool") as mock_tool:
            main._mcp_tools_to_gemini(tools)

        assert mock_decl.call_count == 2
        called_names = [c.kwargs["name"] for c in mock_decl.call_args_list]
        assert called_names == ["get_kafka_lag", "get_realtime_metrics"]
        mock_tool.assert_called_once()
        assert len(mock_tool.call_args.kwargs["function_declarations"]) == 2
