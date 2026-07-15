import pytest
from unittest.mock import AsyncMock
from routes.generate_code import ModelSelectionStage
from llm import Llm


def _selector() -> ModelSelectionStage:
    return ModelSelectionStage(AsyncMock())


@pytest.mark.asyncio
async def test_explicit_model_is_repeated_for_create():
    """When the operator pins a model, every variant uses it."""
    models = await _selector().select_models(
        generation_type="create",
        input_mode="text",
        api_key="key",
        code_generation_model=Llm.GEMINI_3_FLASH_PREVIEW_MINIMAL,
    )
    assert models == [Llm.GEMINI_3_FLASH_PREVIEW_MINIMAL] * 4


@pytest.mark.asyncio
async def test_explicit_model_is_repeated_for_update():
    """Update flow pins to two variants of the same model."""
    models = await _selector().select_models(
        generation_type="update",
        input_mode="text",
        api_key="key",
        code_generation_model=Llm.CLAUDE_OPUS_4_8_MEDIUM,
    )
    assert models == [Llm.CLAUDE_OPUS_4_8_MEDIUM, Llm.CLAUDE_OPUS_4_8_MEDIUM]


@pytest.mark.asyncio
async def test_no_model_and_no_key_raises():
    """Without a pinned model and without any key, surface the error path."""
    with pytest.raises(Exception, match="No API key"):
        await _selector().select_models(
            generation_type="create",
            input_mode="text",
            api_key=None,
        )


@pytest.mark.asyncio
async def test_explicit_model_with_no_key_raises():
    """Pinning a model without a credential fails fast."""
    with pytest.raises(Exception, match="No API key"):
        await _selector().select_models(
            generation_type="create",
            input_mode="text",
            api_key=None,
            code_generation_model=Llm.GEMINI_3_FLASH_PREVIEW_MINIMAL,
        )


@pytest.mark.asyncio
async def test_video_mode_uses_video_variant_set():
    """Video mode overrides the pinned model with the Gemini video pair."""
    models = await _selector().select_models(
        generation_type="create",
        input_mode="video",
        api_key="key",
        code_generation_model=Llm.GPT_5_5_HIGH,
    )
    # VIDEO_VARIANT_MODELS is two Gemini models — the pinned model is ignored.
    assert len(models) == 2
    assert all(model != Llm.GPT_5_5_HIGH for model in models)


@pytest.mark.asyncio
async def test_video_mode_without_key_raises():
    with pytest.raises(Exception, match="No API key"):
        await _selector().select_models(
            generation_type="create",
            input_mode="video",
            api_key=None,
            code_generation_model=Llm.GPT_5_5_HIGH,
        )