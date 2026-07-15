from fastapi import APIRouter
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from preview_screenshot import probe_screenshot_preview

router = APIRouter()


@router.get("/")
async def get_status():
    return HTMLResponse(
        content="<h3>后端运行正常。请打开前端地址(默认为 http://localhost:5173)使用 screenshot-to-code。</h3>"
    )


class Capabilities(BaseModel):
    screenshot_preview: bool


@router.get("/api/capabilities", response_model=Capabilities)
async def get_capabilities() -> Capabilities:
    """Backend feature availability for the frontend to reflect in settings."""
    return Capabilities(screenshot_preview=await probe_screenshot_preview())
