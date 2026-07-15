from typing import Optional

from anthropic import AsyncAnthropic
from google import genai
from google.genai import types as genai_types
from openai import AsyncOpenAI
from openai.types.chat import ChatCompletionMessageParam

from agent.providers.anthropic import AnthropicProviderSession, serialize_anthropic_tools
from agent.providers.base import ProviderSession
from agent.providers.gemini import GeminiProviderSession, serialize_gemini_tools
from agent.providers.kimi import (
    KimiProviderSession,
    serialize_kimi_tools,
)
from agent.providers.openai import OpenAIProviderSession, serialize_openai_tools
from agent.tools import canonical_tool_definitions
from config import REPLICATE_API_KEY
from llm import Llm
from preview_screenshot import is_screenshot_preview_available

ProviderName = str  # "openai" | "anthropic" | "gemini" | "kimi"


def create_provider_session(
    model: str,
    provider: ProviderName,
    prompt_messages: list[ChatCompletionMessageParam],
    should_generate_images: bool,
    api_key: Optional[str],
    base_url: Optional[str],
    replicate_api_key: Optional[str],
) -> ProviderSession:
    """Build a provider session for the requested (provider, model) pair.

    ``model`` is a free-form string the user typed into the settings panel;
    we never try to map it back to the ``Llm`` enum. The chosen provider
    tells us which client to construct; ``api_model`` is set on every session
    so all per-Llm lookup helpers (``reasoning_effort``, ``image_detail``,
    etc.) are bypassed and the string is sent verbatim to the API.
    """
    # extract_assets only makes sense when the chosen provider is Gemini —
    # that's the same credential used to run the agent.
    asset_extraction_enabled = provider == "gemini" and bool(api_key)

    canonical_tools = canonical_tool_definitions(
        image_generation_enabled=should_generate_images,
        # The edit_image tool calls Replicate, so don't offer it without a key.
        image_editing_enabled=bool(replicate_api_key or REPLICATE_API_KEY),
        asset_extraction_enabled=asset_extraction_enabled,
        # screenshot_preview needs headless Chromium; skip it if it can't launch.
        screenshot_enabled=is_screenshot_preview_available(),
    )

    if not api_key:
        raise Exception(
            f"{provider.capitalize()} API key is missing. "
            "Add it to backend/.env or in the settings dialog."
        )

    if provider == "openai":
        client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        return OpenAIProviderSession(
            client=client,
            # Use a placeholder Llm for backwards-compatible enum-shaped code
            # paths that only touch ``api_model`` via _resolved_api_model().
            # The placeholder is never sent to the API.
            model=_placeholder_model_for_provider("openai"),
            api_model=model,
            prompt_messages=prompt_messages,
            tools=serialize_openai_tools(canonical_tools),
        )

    if provider == "anthropic":
        client = AsyncAnthropic(api_key=api_key, base_url=base_url)
        return AnthropicProviderSession(
            client=client,
            model=_placeholder_model_for_provider("anthropic"),
            api_model=model,
            prompt_messages=prompt_messages,
            tools=serialize_anthropic_tools(canonical_tools),
        )

    if provider == "gemini":
        client = _build_gemini_client(api_key=api_key, base_url=base_url)
        return GeminiProviderSession(
            client=client,
            model=_placeholder_model_for_provider("gemini"),
            api_model=model,
            prompt_messages=prompt_messages,
            tools=serialize_gemini_tools(canonical_tools),
        )

    if provider == "kimi":
        client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        return KimiProviderSession(
            client=client,
            model=_placeholder_model_for_provider("kimi"),
            api_model=model,
            prompt_messages=prompt_messages,
            tools=serialize_kimi_tools(canonical_tools),
        )

    raise ValueError(f"Unsupported provider: {provider!r}")


def _placeholder_model_for_provider(provider: ProviderName) -> Llm:
    """Return any Llm from the requested provider so enum-shaped session
    internals have something to bind to. The real API model is passed via
    ``api_model`` and overrides this in every code path."""
    by_provider = {
        "openai": Llm.GPT_5_5_MEDIUM,
        "anthropic": Llm.CLAUDE_OPUS_4_8_MEDIUM,
        "gemini": Llm.GEMINI_3_FLASH_PREVIEW_MINIMAL,
        "kimi": Llm.KIMI_FOR_CODING,
    }
    return by_provider[provider]


def _build_gemini_client(
    api_key: str,
    base_url: Optional[str],
) -> genai.Client:
    """Create a Gemini client, optionally pointing at a custom base URL.

    The google-genai SDK exposes the custom endpoint through
    ``HttpOptions(base_url=...)``. Without a base URL we keep the default
    Google endpoint so the SDK can apply its own URL handling for the
    Generative Language API.
    """
    if base_url:
        return genai.Client(
            api_key=api_key,
            http_options=genai_types.HttpOptions(base_url=base_url),
        )
    return genai.Client(api_key=api_key)