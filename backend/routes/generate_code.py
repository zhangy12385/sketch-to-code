import asyncio
from dataclasses import dataclass, field
from abc import ABC, abstractmethod
import traceback
from typing import Callable, Awaitable
from anthropic import AsyncAnthropic
from fastapi import APIRouter, WebSocket
from openai import AsyncOpenAI
from pydantic import BaseModel
import openai
from starlette.websockets import WebSocketDisconnect
from websockets.exceptions import ConnectionClosedOK, ConnectionClosedError
from config import (
    IS_DEBUG_ENABLED,
    IS_PROD,
    NUM_VARIANTS,
    NUM_VARIANTS_VIDEO,
    REPLICATE_API_KEY,
)
from custom_types import InputMode
from llm import (
    Llm,
    get_provider_for_model,
)
from typing import (
    Any,
    Callable,
    Coroutine,
    Dict,
    List,
    Literal,
    cast,
    get_args,
)
from openai.types.chat import ChatCompletionMessageParam

from utils import print_prompt_preview

# WebSocket message types
MessageType = Literal[
    "chunk",
    "status",
    "setCode",
    "error",
    "variantComplete",
    "variantError",
    "variantCount",
    "variantModels",
    "thinking",
    "assistant",
    "toolStart",
    "toolResult",
]
from prompts.pipeline import build_prompt_messages
from prompts.request_parsing import parse_prompt_content, parse_prompt_history
from prompts.prompt_types import PromptHistoryMessage, Stack, UserTurnInput
from uploaded_assets import (
    append_uploaded_asset_ids_to_history,
    append_uploaded_asset_ids_to_prompt,
    infer_local_asset_base_url,
)
from agent.runner import Agent
from routes.model_choice_sets import (
    VIDEO_VARIANT_MODELS,
)

# from utils import pprint_prompt
from ws.constants import APP_ERROR_WEB_SOCKET_CODE  # type: ignore


router = APIRouter()


@dataclass
class PipelineContext:
    """Context object that carries state through the pipeline"""

    websocket: WebSocket
    ws_comm: "WebSocketCommunicator | None" = None
    params: Dict[str, Any] = field(default_factory=dict)
    extracted_params: "ExtractedParams | None" = None
    prompt_messages: List[ChatCompletionMessageParam] = field(default_factory=list)
    variant_models: List[str] = field(default_factory=list)
    completions: List[str] = field(default_factory=list)
    variant_completions: Dict[int, str] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def send_message(self):
        assert self.ws_comm is not None
        return self.ws_comm.send_message

    @property
    def throw_error(self):
        assert self.ws_comm is not None
        return self.ws_comm.throw_error


class Middleware(ABC):
    """Base class for all pipeline middleware"""

    @abstractmethod
    async def process(
        self, context: PipelineContext, next_func: Callable[[], Awaitable[None]]
    ) -> None:
        """Process the context and call the next middleware"""
        pass


class Pipeline:
    """Pipeline for processing WebSocket code generation requests"""

    def __init__(self):
        self.middlewares: List[Middleware] = []

    def use(self, middleware: Middleware) -> "Pipeline":
        """Add a middleware to the pipeline"""
        self.middlewares.append(middleware)
        return self

    async def execute(self, websocket: WebSocket) -> None:
        """Execute the pipeline with the given WebSocket"""
        context = PipelineContext(websocket=websocket)

        # Build the middleware chain
        async def start(ctx: PipelineContext):
            pass  # End of pipeline

        chain = start
        for middleware in reversed(self.middlewares):
            chain = self._wrap_middleware(middleware, chain)

        await chain(context)

    def _wrap_middleware(
        self,
        middleware: Middleware,
        next_func: Callable[[PipelineContext], Awaitable[None]],
    ) -> Callable[[PipelineContext], Awaitable[None]]:
        """Wrap a middleware with its next function"""

        async def wrapped(context: PipelineContext) -> None:
            await middleware.process(context, lambda: next_func(context))

        return wrapped


class WebSocketCommunicator:
    """Handles WebSocket communication with consistent error handling"""

    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self.is_closed = False

    async def accept(self) -> None:
        """Accept the WebSocket connection"""
        await self.websocket.accept()
        print("Incoming websocket connection...")

    async def send_message(
        self,
        type: MessageType,
        value: str | None,
        variantIndex: int,
        data: Dict[str, Any] | None = None,
        eventId: str | None = None,
    ) -> None:
        """Send a message to the client with debug logging"""
        if self.is_closed:
            return

        # Print for debugging on the backend
        if type == "error":
            print(f"Error (variant {variantIndex + 1}): {value}")
        elif type == "status":
            print(f"Status (variant {variantIndex + 1}): {value}")
        elif type == "variantComplete":
            print(f"Variant {variantIndex + 1} complete")
        elif type == "variantError":
            print(f"Variant {variantIndex + 1} error: {value}")

        try:
            payload: Dict[str, Any] = {"type": type, "variantIndex": variantIndex}
            if value is not None:
                payload["value"] = value
            if data is not None:
                payload["data"] = data
            if eventId is not None:
                payload["eventId"] = eventId
            await self.websocket.send_json(payload)
        except (
            ConnectionClosedOK,
            ConnectionClosedError,
            RuntimeError,
            WebSocketDisconnect,
        ):
            print(f"WebSocket closed by client, skipping message: {type}")
            self.is_closed = True

    async def throw_error(self, message: str) -> None:
        """Send an error message and close the connection"""
        print(message)
        if not self.is_closed:
            try:
                await self.websocket.send_json({"type": "error", "value": message})
                await self.websocket.close(APP_ERROR_WEB_SOCKET_CODE)
            except (
                ConnectionClosedOK,
                ConnectionClosedError,
                RuntimeError,
                WebSocketDisconnect,
            ):
                print("WebSocket already closed by client")
            self.is_closed = True

    async def receive_params(self) -> Dict[str, Any]:
        """Receive parameters from the client"""
        try:
            params: Dict[str, Any] = await self.websocket.receive_json()
        except WebSocketDisconnect:
            self.is_closed = True
            raise
        print("Received params")
        return params

    async def close(self) -> None:
        """Close the WebSocket connection"""
        if not self.is_closed:
            try:
                await self.websocket.close()
            except (
                ConnectionClosedOK,
                ConnectionClosedError,
                RuntimeError,
                WebSocketDisconnect,
            ):
                pass  # Already closed by client
            self.is_closed = True


@dataclass
class ExtractedParams:
    stack: Stack
    input_mode: InputMode
    should_generate_images: bool
    replicate_api_key: str | None
    generation_type: Literal["create", "update"]
    prompt: UserTurnInput
    history: List[PromptHistoryMessage]
    file_state: Dict[str, str] | None
    option_codes: List[str]
    asset_base_url: str = ""
    design_system: str | None = None
    # The chosen model — free-form string from the settings dialog; the
    # backend never tries to map it back to the Llm enum.
    code_generation_model: str | None = None
    # Which provider the operator is using. Frontend derives this from
    # whichever credentials slot is filled in, since the model string is no
    # longer a reliable provider signal.
    code_generation_provider: str | None = None
    # Resolved credentials for the active provider. Both are sourced strictly
    # from the settings dialog — the backend no longer reads per-provider
    # env vars (OPENAI_API_KEY, etc.) as fallbacks. If either field is
    # missing the factory will raise a clear error.
    api_key: str | None = None
    base_url: str | None = None


class ParameterExtractionStage:
    """Handles parameter extraction and validation from WebSocket requests"""

    def __init__(
        self,
        throw_error: Callable[[str], Coroutine[Any, Any, None]],
        asset_base_url: str = "",
    ):
        self.throw_error = throw_error
        self.asset_base_url = asset_base_url

    async def extract_and_validate(self, params: Dict[str, Any]) -> ExtractedParams:
        """Extract and validate all parameters from the request"""
        # Read the code config settings (stack) from the request.
        generated_code_config = params.get("generatedCodeConfig", "")
        if generated_code_config not in get_args(Stack):
            await self.throw_error(
                f"无效的代码生成配置:{generated_code_config}"
            )
            raise ValueError(f"Invalid generated code config: {generated_code_config}")
        validated_stack = cast(Stack, generated_code_config)

        # Validate the input mode
        input_mode = params.get("inputMode")
        if input_mode not in get_args(InputMode):
            await self.throw_error(f"无效的输入模式:{input_mode}")
            raise ValueError(f"Invalid input mode: {input_mode}")
        validated_input_mode = cast(InputMode, input_mode)

        replicate_api_key = self._get_from_settings_dialog_or_env(
            params, "replicateApiKey", REPLICATE_API_KEY
        )

        # Resolve the chosen model. Free-form string from the settings dialog —
        # no enum validation, the backend just forwards it to the provider.
        code_generation_model: str | None = None
        raw_code_generation_model = params.get("codeGenerationModel")
        if isinstance(raw_code_generation_model, str) and raw_code_generation_model.strip():
            code_generation_model = raw_code_generation_model.strip()

        # Which provider owns those credentials. Frontend derives this from
        # the credentials dialog; fall back to the legacy model-based lookup
        # so external callers (tests, curl) keep working.
        code_generation_provider: str | None = None
        raw_provider = params.get("codeGenerationProvider")
        if isinstance(raw_provider, str) and raw_provider.strip():
            code_generation_provider = raw_provider.strip()
        elif code_generation_model is not None:
            try:
                code_generation_provider = get_provider_for_model(
                    Llm(code_generation_model)
                )
            except ValueError:
                # Unknown model string — leave provider unset; we'll catch
                # the missing provider/credentials below.
                code_generation_provider = None

        # Pull the active provider's credentials straight from the settings dialog.
        # No env-var fallback: leaving a field empty means "not configured"
        # and the factory will raise a clear error when it tries to build the
        # provider client. This matches the "user-owned config" contract the
        # UI advertises.
        api_key = self._get_from_settings_dialog(
            params, "apiKey"
        )
        base_url = self._get_from_settings_dialog(
            params, "baseURL"
        )

        # Get the image generation flag from the request. Fall back to True if not provided.
        should_generate_images = bool(params.get("isImageGenerationEnabled", True))

        # Extract and validate generation type
        generation_type = params.get("generationType", "create")
        if generation_type not in ["create", "update"]:
            await self.throw_error(f"无效的生成类型:{generation_type}")
            raise ValueError(f"Invalid generation type: {generation_type}")
        generation_type = cast(Literal["create", "update"], generation_type)

        # Extract prompt content
        prompt: UserTurnInput = parse_prompt_content(params.get("prompt"))

        # Extract history (default to empty list)
        history: List[PromptHistoryMessage] = parse_prompt_history(
            params.get("history")
        )

        prompt = append_uploaded_asset_ids_to_prompt(prompt, self.asset_base_url)
        history = append_uploaded_asset_ids_to_history(history, self.asset_base_url)

        # Extract file state for agent edits
        raw_file_state = params.get("fileState")
        file_state: Dict[str, str] | None = None
        if isinstance(raw_file_state, dict):
            content = raw_file_state.get("content")
            if isinstance(content, str) and content.strip():
                path = raw_file_state.get("path") or "index.html"
                file_state = {"path": path, "content": content}

        raw_option_codes = params.get("optionCodes")
        option_codes: List[str] = []
        if isinstance(raw_option_codes, list):
            for entry in raw_option_codes:
                if isinstance(entry, str):
                    option_codes.append(entry)
                elif entry is None:
                    option_codes.append("")
                else:
                    option_codes.append(str(entry))

        raw_design_system = params.get("designSystem")
        design_system = (
            raw_design_system.strip()
            if isinstance(raw_design_system, str) and raw_design_system.strip()
            else None
        )

        return ExtractedParams(
            stack=validated_stack,
            input_mode=validated_input_mode,
            should_generate_images=should_generate_images,
            replicate_api_key=replicate_api_key,
            generation_type=generation_type,
            prompt=prompt,
            history=history,
            file_state=file_state,
            option_codes=option_codes,
            asset_base_url=self.asset_base_url,
            design_system=design_system,
            code_generation_model=code_generation_model,
            code_generation_provider=code_generation_provider,
            api_key=api_key,
            base_url=base_url,
        )

    def _get_from_settings_dialog(
        self, params: dict[str, Any], key: str
    ) -> str | None:
        """Read a credential the user typed into the settings dialog.

        No env-var fallback — leaving the field blank means "not configured"
        and downstream stages will surface that as an error.
        """
        value = params.get(key)
        if value:
            print(f"Using {key} from client-side settings dialog")
            return value
        return None

    def _get_from_settings_dialog_or_env(
        self, params: dict[str, Any], key: str, env_var: str | None
    ) -> str | None:
        """Read a credential that supports both the dialog and an env-var
        fallback. Used only for credentials that pre-date the
        user-owned-config contract (e.g. Replicate)."""
        value = params.get(key)
        if value:
            print(f"Using {key} from client-side settings dialog")
            return value

        if env_var:
            print(f"Using {key} from environment variable")
            return env_var

        return None


class ModelSelectionStage:
    """Handles selection of variant models based on available API keys and generation type"""

    def __init__(self, throw_error: Callable[[str], Coroutine[Any, Any, None]]):
        self.throw_error = throw_error

    async def select_models(
        self,
        generation_type: Literal["create", "update"],
        input_mode: InputMode,
        api_key: str | None,
        code_generation_model: str | None = None,
    ) -> List[str]:
        """Select appropriate models based on available API keys"""
        try:
            # Video mode always uses Gemini for vision, regardless of the
            # operator's chosen model — keep that as the override rule.
            if input_mode == "video":
                if not _has_gemini_key(api_key):
                    raise Exception(
                        "Video mode requires a Gemini API key. "
                        "Please add a Gemini API key in the settings dialog"
                    )
                return list(VIDEO_VARIANT_MODELS)

            num_variants = 2 if generation_type == "update" else NUM_VARIANTS

            # When the user picked a specific model in the settings panel,
            # honor it. We still need a non-empty key — the factory raises a
            # friendly error if the credential doesn't actually belong to
            # this model's provider.
            if code_generation_model is not None and api_key:
                pinned = self._pin_variant_models(
                    code_generation_model,
                    num_variants,
                )
                # Print the variant models (one per line)
                print("Variant models:")
                for index, model in enumerate(pinned):
                    print(f"Variant {index + 1}: {model}")
                return pinned

            # No model pinned — fail fast so the user knows to pick one in
            # the settings dialog. (The original logic cycled through
            # per-provider model sets, but with a single credentials slot we
            # can no longer decide which models are available.)
            raise Exception(
                "未选择代码生成模型。请在设置中选择一个模型并填写对应的 API 密钥。"
            )
        except Exception:
            await self.throw_error(
                "未找到可用的 API 密钥。请在设置对话框中填写对应提供商的 "
                "Base URL、API 密钥与模型标识符。"
            )
            raise Exception("No API key")

    @staticmethod
    def _pin_variant_models(model: str, num_variants: int) -> List[str]:
        """Repeat a single model identifier to fill the requested variant count."""
        return [model for _ in range(max(1, num_variants))]


def _has_gemini_key(api_key: str | None) -> bool:
    """Video mode always needs a Gemini key. Only the settings dialog is
    consulted — the env-var fallback has been retired along with the rest
    of the per-provider defaults."""
    return bool(api_key)


class PromptCreationStage:
    """Handles prompt assembly for code generation"""

    def __init__(self, throw_error: Callable[[str], Coroutine[Any, Any, None]]):
        self.throw_error = throw_error

    async def build_prompt_messages(
        self,
        extracted_params: ExtractedParams,
    ) -> List[ChatCompletionMessageParam]:
        """Create prompt messages"""
        try:
            prompt_messages = await build_prompt_messages(
                stack=extracted_params.stack,
                input_mode=extracted_params.input_mode,
                generation_type=extracted_params.generation_type,
                prompt=extracted_params.prompt,
                history=extracted_params.history,
                file_state=extracted_params.file_state,
                image_generation_enabled=extracted_params.should_generate_images,
                design_system=extracted_params.design_system,
            )
            print_prompt_preview(prompt_messages)

            return prompt_messages
        except Exception:
            await self.throw_error(
                "组装提示词失败。请联系支持:support@getwhimsyworks.com"
            )
            raise


class PostProcessingStage:
    """Handles post-processing after code generation completes"""

    def __init__(self):
        pass

    async def process_completions(
        self,
        completions: List[str],
        websocket: WebSocket,
    ) -> None:
        """Process completions and perform cleanup."""
        return None


class AgenticGenerationStage:
    """Handles agent tool-calling generation for each variant."""

    def __init__(
        self,
        send_message: Callable[[MessageType, str | None, int, Dict[str, Any] | None, str | None], Coroutine[Any, Any, None]],
        code_generation_model: str | None,
        code_generation_provider: str | None,
        api_key: str | None,
        base_url: str | None,
        replicate_api_key: str | None,
        should_generate_images: bool = True,
        file_state: Dict[str, str] | None = None,
        asset_base_url: str = "",
        option_codes: List[str] | None = None,
    ):
        self.send_message = send_message
        self.code_generation_model = code_generation_model
        self.code_generation_provider = code_generation_provider
        self.api_key = api_key
        self.base_url = base_url
        self.replicate_api_key = replicate_api_key
        self.should_generate_images = should_generate_images
        self.file_state = file_state
        self.asset_base_url = asset_base_url
        self.option_codes = option_codes or []

    async def process_variants(
        self,
        variant_models: List[str],
        prompt_messages: List[ChatCompletionMessageParam],
    ) -> Dict[int, str]:
        tasks: List[asyncio.Task[str]] = []
        for index, model in enumerate(variant_models):
            tasks.append(
                asyncio.create_task(
                    self._run_variant(index, model, prompt_messages)
                )
            )

        results = await asyncio.gather(*tasks, return_exceptions=True)
        variant_completions: Dict[int, str] = {}
        for index, result in enumerate(results):
            if isinstance(result, BaseException):
                print(f"Variant {index + 1} failed: {result}")
                continue
            if result:
                variant_completions[index] = result

        return variant_completions

    async def _run_variant(
        self,
        index: int,
        model: str,
        prompt_messages: List[ChatCompletionMessageParam],
    ) -> str:
        try:
            async def send_runner_message(
                type: str,
                value: str | None,
                variant_index: int,
                data: Dict[str, Any] | None,
                event_id: str | None,
            ) -> None:
                await self.send_message(
                    cast(MessageType, type),
                    value,
                    variant_index,
                    data,
                    event_id,
                )

            runner = Agent(
                send_message=send_runner_message,
                variant_index=index,
                api_key=self.api_key,
                base_url=self.base_url,
                replicate_api_key=self.replicate_api_key,
                should_generate_images=self.should_generate_images,
                asset_base_url=self.asset_base_url,
                initial_file_state=self.file_state,
                option_codes=self.option_codes,
            )
            completion = await runner.run(model, self.code_generation_provider or "", prompt_messages)
            if completion:
                await self.send_message("setCode", completion, index, None, None)
            await self.send_message(
                "variantComplete",
                "变体生成完成",
                index,
                None,
                None,
            )
            return completion
        except openai.AuthenticationError as e:
            print(f"[VARIANT {index + 1}] OpenAI Authentication failed", e)
            error_message = (
                "OpenAI 密钥不正确。请确认您的 OpenAI API 密钥是否正确,或在 OpenAI 控制台创建新的 API 密钥。"
                + (
                    " 您也可以直接在本网站购买代码生成额度。"
                    if IS_PROD
                    else ""
                )
            )
            await self.send_message("variantError", error_message, index, None, None)
            return ""
        except openai.NotFoundError as e:
            print(f"[VARIANT {index + 1}] OpenAI Model not found", e)
            error_message = (
                e.message
                + "。请确认您已按照说明正确获取具备 GPT 视觉能力的 OpenAI 密钥:"
                " https://github.com/abi/screenshot-to-code/blob/main/Troubleshooting.md"
                + (
                    " 您也可以直接在本网站购买代码生成额度。"
                    if IS_PROD
                    else ""
                )
            )
            await self.send_message("variantError", error_message, index, None, None)
            return ""
        except openai.RateLimitError as e:
            print(f"[VARIANT {index + 1}] OpenAI Rate limit exceeded", e)
            error_message = (
                "OpenAI 错误 - \"您已超出当前配额,请检查您的套餐和账单详情\"。"
                + (
                    " 您也可以直接在本网站购买代码生成额度。"
                    if IS_PROD
                    else ""
                )
            )
            await self.send_message("variantError", error_message, index, None, None)
            return ""
        except Exception as e:
            print(f"Error in variant {index + 1}: {e}")
            traceback.print_exception(type(e), e, e.__traceback__)
            await self.send_message("variantError", str(e), index, None, None)
            return ""


# Pipeline Middleware Implementations


class WebSocketSetupMiddleware(Middleware):
    """Handles WebSocket setup and teardown"""

    async def process(
        self, context: PipelineContext, next_func: Callable[[], Awaitable[None]]
    ) -> None:
        # Create and setup WebSocket communicator
        context.ws_comm = WebSocketCommunicator(context.websocket)
        await context.ws_comm.accept()

        try:
            await next_func()
        finally:
            # Always close the WebSocket
            await context.ws_comm.close()


class ParameterExtractionMiddleware(Middleware):
    """Handles parameter extraction and validation"""

    async def process(
        self, context: PipelineContext, next_func: Callable[[], Awaitable[None]]
    ) -> None:
        # Receive parameters
        assert context.ws_comm is not None
        context.params = await context.ws_comm.receive_params()

        # Extract and validate
        param_extractor = ParameterExtractionStage(
            context.throw_error,
            infer_local_asset_base_url(context.websocket),
        )
        context.extracted_params = await param_extractor.extract_and_validate(
            context.params
        )

        # Log what we're generating
        print(
            f"Generating {context.extracted_params.stack} code in {context.extracted_params.input_mode} mode"
        )

        await next_func()


class StatusBroadcastMiddleware(Middleware):
    """Sends initial status messages to all variants"""

    async def process(
        self, context: PipelineContext, next_func: Callable[[], Awaitable[None]]
    ) -> None:
        # Determine variant count based on input mode and generation type.
        # Edit/update flows use two variants to keep latency and cost down.
        assert context.extracted_params is not None
        is_video_mode = context.extracted_params.input_mode == "video"
        is_update = context.extracted_params.generation_type == "update"
        num_variants = (
            NUM_VARIANTS_VIDEO if is_video_mode else 2 if is_update else NUM_VARIANTS
        )

        # Tell frontend how many variants we're using
        await context.send_message("variantCount", str(num_variants), 0)

        for i in range(num_variants):
            await context.send_message("status", "正在生成代码...", i)

        await next_func()


class PromptCreationMiddleware(Middleware):
    """Handles prompt creation"""

    async def process(
        self, context: PipelineContext, next_func: Callable[[], Awaitable[None]]
    ) -> None:
        prompt_creator = PromptCreationStage(context.throw_error)
        assert context.extracted_params is not None
        context.prompt_messages = await prompt_creator.build_prompt_messages(
            context.extracted_params,
        )
        await next_func()


class CodeGenerationMiddleware(Middleware):
    """Handles the main code generation logic"""

    async def process(
        self, context: PipelineContext, next_func: Callable[[], Awaitable[None]]
    ) -> None:
        try:
            assert context.extracted_params is not None

            # Select models (handles video mode internally)
            model_selector = ModelSelectionStage(context.throw_error)
            context.variant_models = await model_selector.select_models(
                generation_type=context.extracted_params.generation_type,
                input_mode=context.extracted_params.input_mode,
                api_key=context.extracted_params.api_key,
                code_generation_model=context.extracted_params.code_generation_model,
            )
            if IS_DEBUG_ENABLED:
                await context.send_message(
                    "variantModels",
                    None,
                    0,
                    {"models": list(context.variant_models)},
                    None,
                )

            generation_stage = AgenticGenerationStage(
                send_message=context.send_message,
                code_generation_model=context.extracted_params.code_generation_model,
                code_generation_provider=context.extracted_params.code_generation_provider,
                api_key=context.extracted_params.api_key,
                base_url=context.extracted_params.base_url,
                replicate_api_key=context.extracted_params.replicate_api_key,
                should_generate_images=context.extracted_params.should_generate_images,
                file_state=context.extracted_params.file_state,
                asset_base_url=context.extracted_params.asset_base_url,
                option_codes=context.extracted_params.option_codes,
            )

            context.variant_completions = await generation_stage.process_variants(
                variant_models=context.variant_models,
                prompt_messages=context.prompt_messages,
            )

            # Check if all variants failed
            if len(context.variant_completions) == 0:
                await context.throw_error(
                    "代码生成失败,请联系支持。"
                )
                return  # Don't continue the pipeline

            # Convert to list format
            context.completions = []
            for i in range(len(context.variant_models)):
                if i in context.variant_completions:
                    context.completions.append(context.variant_completions[i])
                else:
                    context.completions.append("")

        except Exception as e:
            print(f"[GENERATE_CODE] Unexpected error: {e}")
            await context.throw_error(f"发生未知错误:{str(e)}")
            return  # Don't continue the pipeline

        await next_func()


class PostProcessingMiddleware(Middleware):
    """Handles post-processing and logging"""

    async def process(
        self, context: PipelineContext, next_func: Callable[[], Awaitable[None]]
    ) -> None:
        post_processor = PostProcessingStage()
        await post_processor.process_completions(
            context.completions, context.websocket
        )

        await next_func()


@router.websocket("/generate-code")
async def stream_code(websocket: WebSocket):
    """Handle WebSocket code generation requests using a pipeline pattern"""
    pipeline = Pipeline()

    # Configure the pipeline
    pipeline.use(WebSocketSetupMiddleware())
    pipeline.use(ParameterExtractionMiddleware())
    pipeline.use(StatusBroadcastMiddleware())
    pipeline.use(PromptCreationMiddleware())
    pipeline.use(CodeGenerationMiddleware())
    pipeline.use(PostProcessingMiddleware())

    # Execute the pipeline
    await pipeline.execute(websocket)


class TestConnectionRequest(BaseModel):
    provider: str
    apiKey: str
    baseURL: str | None = None
    model: str


class TestConnectionResponse(BaseModel):
    ok: bool
    message: str


@router.post("/api/test-model-connection", response_model=TestConnectionResponse)
async def test_model_connection(request: TestConnectionRequest) -> TestConnectionResponse:
    """Smoke-test the operator's configured credentials against the chosen
    provider with a one-token request. Surfaces auth, DNS, and routing
    problems without running a full code generation."""
    provider = request.provider.strip().lower()
    api_key = request.apiKey.strip()
    model = request.model.strip()
    base_url = request.baseURL.strip() if request.baseURL else None

    if not api_key:
        return TestConnectionResponse(
            ok=False, message="API 密钥不能为空。"
        )
    if not model:
        return TestConnectionResponse(
            ok=False, message="模型标识符不能为空。"
        )

    try:
        if provider == "openai":
            client = AsyncOpenAI(api_key=api_key, base_url=base_url)
            try:
                await client.responses.create(
                    model=model,
                    input=[{"role": "user", "content": "ping"}],
                    max_output_tokens=1,
                )
            finally:
                await client.close()
        elif provider == "anthropic":
            client = AsyncAnthropic(api_key=api_key, base_url=base_url)
            try:
                await client.messages.create(
                    model=model,
                    max_tokens=1,
                    messages=[{"role": "user", "content": "ping"}],
                )
            finally:
                await client.close()
        elif provider == "kimi":
            client = AsyncOpenAI(api_key=api_key, base_url=base_url)
            try:
                await client.chat.completions.create(
                    model=model,
                    messages=[{"role": "user", "content": "ping"}],
                    max_tokens=1,
                )
            finally:
                await client.close()
        elif provider == "gemini":
            from agent.providers.factory import _build_gemini_client

            client = _build_gemini_client(api_key=api_key, base_url=base_url)
            await client.aio.models.generate_content(
                model=model,
                contents="ping",
                config={"max_output_tokens": 1},
            )
        else:
            return TestConnectionResponse(
                ok=False,
                message=f"不支持的提供商:{provider}",
            )
    except Exception as e:
        return TestConnectionResponse(
            ok=False,
            message=_format_connection_error(provider, e),
        )

    return TestConnectionResponse(
        ok=True,
        message=f"连通正常 — 已成功调用 {provider} 的 {model}。",
    )


def _format_connection_error(provider: str, error: Exception) -> str:
    """Reduce a verbose provider SDK exception into a user-facing sentence.

    We don't want to leak the entire stack trace, but we do want the
    underlying message so the user can see whether the issue is auth,
    network, or model-name."""
    name = type(error).__name__
    message = str(error).strip() or name
    # Trim very long error bodies (Anthropic and OpenAI sometimes include
    # the full request payload in the exception).
    if len(message) > 240:
        message = message[:240] + "…"
    return f"{provider} 连接失败 ({name}):{message}"