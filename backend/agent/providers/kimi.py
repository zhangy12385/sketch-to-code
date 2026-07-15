# pyright: reportUnknownVariableType=false
import json
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, cast

from openai import AsyncOpenAI
from openai.types.chat import (
    ChatCompletionAssistantMessageParam,
    ChatCompletionMessageParam,
    ChatCompletionMessageToolCallParam,
    ChatCompletionToolParam,
)

from agent.providers.base import (
    EventSink,
    ExecutedToolCall,
    ProviderSession,
    ProviderTurn,
    StreamEvent,
)
from agent.providers.pricing import MODEL_PRICING
from agent.providers.token_usage import TokenUsage
from agent.tools import CanonicalToolDefinition, ToolCall, parse_json_arguments
from fs_logging.prompt_reports import PromptReportLogger
from llm import Llm


# Map each Kimi-named Llm to the API model id Kimi's endpoint expects. Today
# there's only one Kimi model in the project so this collapses to a constant,
# but the indirection keeps the door open for additional variants later.
KIMI_MODEL_CONFIG: dict[Llm, dict[str, str]] = {
    Llm.KIMI_FOR_CODING: {"api_name": "kimi-for-coding"},
}


def get_kimi_api_name(model: Llm) -> str:
    return KIMI_MODEL_CONFIG.get(model, {"api_name": model.value})["api_name"]


def serialize_kimi_tools(
    tools: List[CanonicalToolDefinition],
) -> List[ChatCompletionToolParam]:
    """Serialize canonical tools into Chat-Completions `tools` payload.

    Kimi's endpoint mirrors the OpenAI Chat Completions schema, including the
    nested ``function`` envelope around each tool definition.
    """
    serialized: List[ChatCompletionToolParam] = []
    for tool in tools:
        serialized.append(
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.parameters,
                },
            }
        )
    return serialized


@dataclass
class KimiParseState:
    assistant_text: str = ""
    # Index per tool call as it streams in.
    tool_calls_by_index: Dict[int, ChatCompletionMessageToolCallParam] = field(
        default_factory=dict
    )


def _extract_kimi_usage(chunk: Any) -> TokenUsage | None:
    """Kimi includes usage on the final chunk when ``stream_options.include_usage`` is set."""
    usage = getattr(chunk, "usage", None)
    if usage is None:
        return None
    prompt_tokens = getattr(usage, "prompt_tokens", 0) or 0
    completion_tokens = getattr(usage, "completion_tokens", 0) or 0
    total_tokens = getattr(usage, "total_tokens", 0) or 0
    if not (prompt_tokens or completion_tokens or total_tokens):
        return None
    return TokenUsage(
        input=prompt_tokens,
        output=completion_tokens,
        cache_read=0,
        cache_write=0,
        total=total_tokens or (prompt_tokens + completion_tokens),
    )


async def _parse_chunk(
    chunk: Any,
    state: KimiParseState,
    on_event: EventSink,
) -> None:
    """Stream parser for Chat-Completions chunks emitted by Kimi."""
    choices = getattr(chunk, "choices", None) or []
    for choice in choices:
        delta = getattr(choice, "delta", None)
        if delta is None:
            continue

        content_piece = getattr(delta, "content", None)
        if content_piece:
            state.assistant_text += content_piece
            await on_event(StreamEvent(type="assistant_delta", text=content_piece))

        tool_pieces = getattr(delta, "tool_calls", None) or []
        for piece in tool_pieces:
            index = getattr(piece, "index", None)
            if index is None:
                # Without a stable index we can't reassemble the call; bail.
                continue
            existing = state.tool_calls_by_index.setdefault(
                index,
                {
                    "id": "",
                    "type": "function",
                    "function": {"name": "", "arguments": ""},
                },
            )
            piece_id = getattr(piece, "id", None)
            if piece_id:
                existing["id"] = piece_id
            function_piece = getattr(piece, "function", None)
            if function_piece is not None:
                name_piece = getattr(function_piece, "name", None)
                if name_piece:
                    existing["function"]["name"] = (
                        existing["function"].get("name", "") + name_piece
                    )
                arguments_piece = getattr(function_piece, "arguments", None)
                if arguments_piece:
                    existing["function"]["arguments"] = (
                        existing["function"].get("arguments", "") + arguments_piece
                    )


def _finalize_tool_calls(
    state: KimiParseState,
) -> List[ToolCall]:
    tool_calls: List[ToolCall] = []
    for index in sorted(state.tool_calls_by_index.keys()):
        raw = state.tool_calls_by_index[index]
        name = raw["function"].get("name") or "unknown_tool"
        args_raw = raw["function"].get("arguments") or ""
        args, error = parse_json_arguments(args_raw)
        if error:
            args = {"INVALID_JSON": args_raw}
        tool_id = raw.get("id") or f"tool-{uuid.uuid4().hex[:6]}"
        tool_calls.append(
            ToolCall(
                id=tool_id,
                name=name,
                arguments=args,
            )
        )
    return tool_calls


class KimiProviderSession(ProviderSession):
    """Stream turns against api.kimi.com/coding using OpenAI Chat Completions."""

    def __init__(
        self,
        client: AsyncOpenAI,
        model: Llm,
        prompt_messages: List[ChatCompletionMessageParam],
        tools: List[ChatCompletionToolParam],
        api_model: Optional[str] = None,
    ):
        self._client = client
        self._model = model
        self._tools = tools
        self._api_model = api_model
        self._total_usage = TokenUsage()
        self._prompt_report_logger = PromptReportLogger(
            provider="kimi",
            model=str(model.value),
            api_model_name=api_model or get_kimi_api_name(model),
        )
        # Keep an editable copy of the conversation; the first message is the
        # system prompt in OpenAI Chat format, so we leave it in place.
        self._messages: List[ChatCompletionMessageParam] = list(prompt_messages)

    def _resolved_api_model(self) -> str:
        return self._api_model or get_kimi_api_name(self._model)

    async def stream_turn(self, on_event: EventSink) -> ProviderTurn:
        model_name = self._resolved_api_model()
        params: Dict[str, Any] = {
            "model": model_name,
            "messages": self._messages,
            "tools": self._tools,
            "tool_choice": "auto",
            # Kimi's coding endpoint only accepts temperature=1 for this
            # model; trying anything else yields "invalid temperature".
            "temperature": 1,
            "max_tokens": 50000,
            "stream": True,
            "stream_options": {"include_usage": True},
        }

        self._prompt_report_logger.record_request(params)

        state = KimiParseState()
        turn_usage: TokenUsage | None = None
        stream = await self._client.chat.completions.create(**params)  # type: ignore
        async for chunk in stream:  # type: ignore
            await _parse_chunk(chunk, state, on_event)
            chunk_usage = _extract_kimi_usage(chunk)
            if chunk_usage is not None:
                turn_usage = chunk_usage

        if turn_usage is not None:
            self._prompt_report_logger.record_usage(turn_usage)
            self._total_usage.accumulate(turn_usage)

        tool_calls = _finalize_tool_calls(state)
        assistant_message: ChatCompletionAssistantMessageParam = {
            "role": "assistant",
            "content": state.assistant_text or None,
        }
        if tool_calls:
            assistant_message["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.name,
                        "arguments": json.dumps(tc.arguments, ensure_ascii=False),
                    },
                }
                for tc in tool_calls
            ]

        return ProviderTurn(
            assistant_text=state.assistant_text,
            tool_calls=tool_calls,
            assistant_turn=assistant_message,
        )

    async def append_tool_results(
        self,
        turn: ProviderTurn,
        executed_tool_calls: list[ExecutedToolCall],
    ) -> None:
        # Push the assistant turn back into the conversation so Kimi sees its
        # own tool-call request alongside the tool outputs that follow.
        assistant_message = turn.assistant_turn
        if isinstance(assistant_message, dict):
            self._messages.append(
                cast(ChatCompletionMessageParam, assistant_message)
            )

        for executed in executed_tool_calls:
            result_payload = json.dumps(
                executed.result.result, ensure_ascii=False
            )
            self._messages.append(
                {
                    "role": "tool",
                    "tool_call_id": executed.tool_call.id,
                    "content": result_payload,
                }
            )

    async def close(self) -> None:
        u = self._total_usage
        model_name = self._resolved_api_model()
        pricing = MODEL_PRICING.get(model_name)
        cost_str = f" cost=${u.cost(pricing):.4f}" if pricing else ""
        cache_hit_rate_str = f" cache_hit_rate={u.cache_hit_rate_percent():.2f}%"
        print(
            f"[TOKEN USAGE] provider=kimi model={model_name} | "
            f"input={u.input} output={u.output} "
            f"cache_read={u.cache_read} cache_write={u.cache_write} "
            f"total={u.total}{cache_hit_rate_str}{cost_str}"
        )
        await self._client.close()
