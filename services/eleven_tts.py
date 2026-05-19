import os

import httpx


class ElevenTTSError(Exception):
    pass


async def synthesize_speech(text: str) -> tuple[bytes, str]:
    api_key = os.getenv("ELEVENLABS_API_KEY")
    voice_id = os.getenv("ELEVENLABS_VOICE_ID")

    if not api_key:
        raise ElevenTTSError("Thiếu ELEVENLABS_API_KEY trong file .env")
    if not voice_id:
        raise ElevenTTSError("Thiếu ELEVENLABS_VOICE_ID trong file .env")

    model_id = os.getenv("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2")
    output_format = os.getenv("ELEVENLABS_OUTPUT_FORMAT", "mp3_44100_128")
    base_url = os.getenv("ELEVENLABS_BASE_URL", "https://api.elevenlabs.io").rstrip("/")
    language_code = os.getenv("ELEVENLABS_LANGUAGE_CODE", "vi")

    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    payload = {
        "text": text,
        "model_id": model_id,
        "language_code": language_code,
    }
    timeout = httpx.Timeout(90.0, connect=15.0)

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            f"{base_url}/v1/text-to-speech/{voice_id}",
            params={"output_format": output_format},
            headers=headers,
            json=payload,
        )

    if response.status_code >= 400:
        detail = response.text
        try:
            error_payload = response.json()
            detail = error_payload.get("detail") or error_payload.get("message") or detail
        except ValueError:
            pass

        raise ElevenTTSError(
            f"ElevenLabs TTS lỗi ({response.status_code}): {detail}"
        )

    media_type = response.headers.get("content-type", "audio/mpeg")
    if not response.content:
        raise ElevenTTSError("ElevenLabs TTS không trả về audio hợp lệ.")

    return response.content, media_type
