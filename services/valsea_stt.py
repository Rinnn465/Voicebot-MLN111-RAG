import os
from typing import Any

import httpx


class ValseaSTTError(Exception):
    pass


async def transcribe_audio(
    file_bytes: bytes,
    filename: str,
    content_type: str | None,
) -> str:
    api_key = os.getenv("VALSEA_API_KEY")
    if not api_key:
        raise ValseaSTTError("Thiếu VALSEA_API_KEY trong file .env")

    base_url = os.getenv("VALSEA_BASE_URL", "https://api.valsea.ai").rstrip("/")
    language = os.getenv("VALSEA_LANGUAGE", "vietnamese")

    files = {
        "file": (
            filename,
            file_bytes,
            content_type or "audio/webm",
        )
    }
    data = {
        "model": "valsea-transcribe",
        "language": language,
        "response_format": "json",
        "enable_correction": "true",
        "enable_tags": "false",
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
    }

    timeout = httpx.Timeout(60.0, connect=15.0)

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            f"{base_url}/v1/audio/transcriptions",
            headers=headers,
            data=data,
            files=files,
        )

    try:
        payload: dict[str, Any] = response.json()
    except ValueError:
        payload = {}

    if response.status_code >= 400:
        detail = payload.get("detail") or payload.get("message") or response.text
        raise ValseaSTTError(
            f"Valsea STT lỗi ({response.status_code}): {detail}"
        )

    transcript = (payload.get("text") or "").strip()
    if not transcript:
        raise ValseaSTTError("Valsea STT không trả về transcript hợp lệ.")

    return transcript
