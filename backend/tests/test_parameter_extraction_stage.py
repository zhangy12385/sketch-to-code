from unittest.mock import AsyncMock

import pytest

from llm import Llm
from routes.generate_code import ParameterExtractionStage


@pytest.mark.asyncio
async def test_extracts_api_key_from_settings_dialog() -> None:
    stage = ParameterExtractionStage(AsyncMock())

    extracted = await stage.extract_and_validate(
        {
            "generatedCodeConfig": "html_tailwind",
            "inputMode": "text",
            "codeGenerationModel": Llm.GEMINI_3_FLASH_PREVIEW_MINIMAL.value,
            "apiKey": "gemini-from-ui",
            "prompt": {"text": "hello"},
        }
    )

    assert extracted.api_key == "gemini-from-ui"


@pytest.mark.asyncio
async def test_does_not_fall_back_to_env_when_api_key_missing() -> None:
    """Empty ``apiKey`` means "not configured" — the backend no longer
    reaches for provider env vars. The extracted credential is None and
    the factory will raise a clear error."""
    stage = ParameterExtractionStage(AsyncMock())

    extracted = await stage.extract_and_validate(
        {
            "generatedCodeConfig": "html_tailwind",
            "inputMode": "text",
            "codeGenerationModel": Llm.GEMINI_3_FLASH_PREVIEW_MINIMAL.value,
            "prompt": {"text": "hello"},
        }
    )

    assert extracted.api_key is None


@pytest.mark.asyncio
async def test_extracts_replicate_api_key_from_settings_dialog() -> None:
    stage = ParameterExtractionStage(AsyncMock())

    extracted = await stage.extract_and_validate(
        {
            "generatedCodeConfig": "html_tailwind",
            "inputMode": "text",
            "replicateApiKey": "replicate-from-ui",
            "prompt": {"text": "hello"},
        }
    )

    assert extracted.replicate_api_key == "replicate-from-ui"


@pytest.mark.asyncio
async def test_extracts_replicate_api_key_from_env_when_not_in_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("routes.generate_code.REPLICATE_API_KEY", "replicate-from-env")
    stage = ParameterExtractionStage(AsyncMock())

    extracted = await stage.extract_and_validate(
        {
            "generatedCodeConfig": "html_tailwind",
            "inputMode": "text",
            "prompt": {"text": "hello"},
        }
    )

    assert extracted.replicate_api_key == "replicate-from-env"


@pytest.mark.asyncio
async def test_extracts_design_system_from_request() -> None:
    stage = ParameterExtractionStage(AsyncMock())

    extracted = await stage.extract_and_validate(
        {
            "generatedCodeConfig": "html_css",
            "inputMode": "text",
            "prompt": {"text": "hello"},
            "designSystem": "  Reuse .mockup-frame  ",
        }
    )

    assert extracted.design_system == "Reuse .mockup-frame"
