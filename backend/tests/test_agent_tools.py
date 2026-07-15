from typing import Any, cast

import pytest

from agent.state import AgentFileState
from agent.providers.factory import create_provider_session
from agent.tools import canonical_tool_definitions, summarize_tool_input
from agent.tools.types import ToolCall
from image_generation.replicate import P_IMAGE_EDIT_ASPECT_RATIOS



def _tool_names(session) -> list[str]:
    """Tool names work across dict-shaped (OpenAI/Anthropic) and object-shaped
    (Gemini) serializers. Gemini wraps declarations inside a single Tool."""
    tools = getattr(session, '_tools', [])
    names: list[str] = []
    for tool in tools:
        if isinstance(tool, dict):
            names.append(tool.get('name', ''))
            continue
        direct = getattr(tool, 'name', None)
        if direct:
            names.append(direct)
            continue
        declarations = getattr(tool, 'function_declarations', None) or []
        for decl in declarations:
            name = getattr(decl, 'name', None)
            if name:
                names.append(name)
    return names


def test_canonical_tool_definitions_include_generate_images_when_enabled() -> None:
    tool_names = [tool.name for tool in canonical_tool_definitions(True)]
    assert "generate_images" in tool_names


def test_canonical_tool_definitions_exclude_generate_images_when_disabled() -> None:
    tool_names = [tool.name for tool in canonical_tool_definitions(False)]
    assert "generate_images" not in tool_names


def test_edit_file_tool_description_matches_runtime_output_shape() -> None:
    edit_tool = next(
        tool for tool in canonical_tool_definitions(True) if tool.name == "edit_file"
    )

    assert "success message" in edit_tool.description
    assert "unified diff" in edit_tool.description


def test_canonical_tool_definitions_include_save_assets() -> None:
    tools = canonical_tool_definitions(True)
    tool_names = [tool.name for tool in tools]
    assert "save_assets" in tool_names
    save_assets_tool = next(tool for tool in tools if tool.name == "save_assets")
    assert save_assets_tool.parameters["required"] == ["asset_ids"]
    assert save_assets_tool.parameters["properties"]["asset_ids"]["type"] == "array"


def test_save_assets_tool_input_summary_uses_asset_ids() -> None:
    summary = summarize_tool_input(
        ToolCall(
            id="call-1",
            name="save_assets",
            arguments={"asset_ids": ["asset_one", "asset_two"]},
        ),
        AgentFileState(),
    )

    assert summary == {
        "count": 2,
        "asset_ids": ["asset_one", "asset_two"],
    }


def test_canonical_tool_definitions_include_extract_assets() -> None:
    tools = canonical_tool_definitions(True, asset_extraction_enabled=True)
    tool_names = [tool.name for tool in tools]
    assert "extract_assets" in tool_names
    extract_assets_tool = next(tool for tool in tools if tool.name == "extract_assets")
    assert extract_assets_tool.parameters["required"] == ["asset_descriptions"]
    assert (
        extract_assets_tool.parameters["properties"]["asset_descriptions"]["type"]
        == "array"
    )


def test_canonical_tool_definitions_exclude_extract_assets_when_disabled() -> None:
    tool_names = [
        tool.name
        for tool in canonical_tool_definitions(True, asset_extraction_enabled=False)
    ]
    assert "extract_assets" not in tool_names


def test_provider_session_excludes_extract_assets_without_gemini_key() -> None:
    session = create_provider_session(
        model="gpt-5.5 (high thinking)",
        provider="openai",
        prompt_messages=[{"role": "user", "content": "Build a page."}],
        should_generate_images=True,
        api_key="openai-key",
        base_url=None,
        replicate_api_key=None,
    )

    tool_names = _tool_names(session)
    assert "extract_assets" not in tool_names


def test_provider_session_includes_extract_assets_with_gemini_key() -> None:
    session = create_provider_session(
        model="gemini-3-flash-preview (minimal thinking)",
        provider="gemini",
        prompt_messages=[{"role": "user", "content": "Build a page."}],
        should_generate_images=True,
        api_key="gemini-key",
        base_url=None,
        replicate_api_key=None,
    )

    tool_names = _tool_names(session)
    assert "extract_assets" in tool_names


def test_provider_session_excludes_screenshot_preview_when_chromium_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "agent.providers.factory.is_screenshot_preview_available", lambda: False
    )
    session = create_provider_session(
        model="gpt-5.5 (high thinking)",
        provider="openai",
        prompt_messages=[{"role": "user", "content": "Build a page."}],
        should_generate_images=True,
        api_key="openai-key",
        base_url=None,
        replicate_api_key=None,
    )

    tool_names = _tool_names(session)
    assert "screenshot_preview" not in tool_names


def test_provider_session_includes_screenshot_preview_when_chromium_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "agent.providers.factory.is_screenshot_preview_available", lambda: True
    )
    session = create_provider_session(
        model="gpt-5.5 (high thinking)",
        provider="openai",
        prompt_messages=[{"role": "user", "content": "Build a page."}],
        should_generate_images=True,
        api_key="openai-key",
        base_url=None,
        replicate_api_key=None,
    )

    tool_names = _tool_names(session)
    assert "screenshot_preview" in tool_names


def test_extract_assets_tool_input_summary_uses_asset_descriptions() -> None:
    summary = summarize_tool_input(
        ToolCall(
            id="call-1",
            name="extract_assets",
            arguments={"asset_descriptions": ["logo", "avatar"]},
        ),
        AgentFileState(),
    )

    assert summary == {
        "count": 2,
        "asset_descriptions": ["logo", "avatar"],
    }


def test_canonical_tool_definitions_include_screenshot_preview() -> None:
    tools = canonical_tool_definitions(True)
    tool_names = [tool.name for tool in tools]
    assert "screenshot_preview" in tool_names
    screenshot_tool = next(
        tool for tool in tools if tool.name == "screenshot_preview"
    )
    assert screenshot_tool.parameters["properties"] == {}


def test_canonical_tool_definitions_exclude_screenshot_preview_when_disabled() -> None:
    tool_names = [
        tool.name
        for tool in canonical_tool_definitions(True, screenshot_enabled=False)
    ]
    assert "screenshot_preview" not in tool_names


def test_canonical_tool_definitions_include_edit_image() -> None:
    tools = canonical_tool_definitions(True)
    tool_names = [tool.name for tool in tools]
    assert "edit_image" in tool_names
    edit_image_tool = next(tool for tool in tools if tool.name == "edit_image")
    assert edit_image_tool.parameters["required"] == ["prompt", "image_urls"]
    properties = edit_image_tool.parameters["properties"]
    assert properties["image_urls"]["type"] == "array"
    assert "turbo" not in properties
    assert "seed" not in properties
    assert properties["aspect_ratio"]["enum"] == list(P_IMAGE_EDIT_ASPECT_RATIOS)


def test_canonical_tool_definitions_exclude_edit_image_when_disabled() -> None:
    tool_names = [
        tool.name
        for tool in canonical_tool_definitions(True, image_editing_enabled=False)
    ]
    assert "edit_image" not in tool_names


def test_edit_image_tool_input_summary_uses_prompt_and_image_urls() -> None:
    summary = summarize_tool_input(
        ToolCall(
            id="call-1",
            name="edit_image",
            arguments={
                "prompt": "Make image 1 monochrome",
                "image_urls": ["https://example.com/input.png"],
                "aspect_ratio": "match_input_image",
            },
        ),
        AgentFileState(),
    )

    assert summary == {
        "count": 1,
        "prompt": "Make image 1 monochrome",
        "image_urls": ["https://example.com/input.png"],
        "aspect_ratio": "match_input_image",
    }
