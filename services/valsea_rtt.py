import json
import os

from websockets.asyncio.client import connect


def create_realtime_connection():
    api_key = os.getenv("VALSEA_API_KEY")
    if not api_key:
        raise RuntimeError("Thiếu VALSEA_API_KEY trong file .env")

    realtime_url = os.getenv(
        "VALSEA_REALTIME_URL",
        "wss://api.valsea.ai/v1/realtime",
    )

    return connect(
        realtime_url,
        additional_headers={
            "Authorization": f"Bearer {api_key}",
        },
        ping_interval=20,
        ping_timeout=20,
    )


def get_realtime_start_message() -> str:
    return json.dumps(
        {
            "type": "session.start",
            "model": "valsea-rtt",
            "language": "vietnamese",
            "enable_correction": True,
        }
    )
