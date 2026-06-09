import asyncio
import json
import os
from contextlib import suppress
from pathlib import Path
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from RAG import RAGPipeline
from services.eleven_tts import ElevenTTSError, synthesize_speech
from services.valsea_rtt import create_realtime_connection, get_realtime_start_message
from services.valsea_stt import ValseaSTTError, transcribe_audio

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
WEB_DIR = BASE_DIR / "web"
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="Voicebot MLN111 RAG API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


class AskRequest(BaseModel):
    question: str = Field(..., min_length=2, description="Câu hỏi người dùng")


class AskResponse(BaseModel):
    answer: str
    sources: list[Dict[str, Any]]
    context_count: int


class SpeechToTextResponse(BaseModel):
    transcript: str


class TextToSpeechRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Văn bản cần chuyển thành giọng nói")


_rag: RAGPipeline | None = None


def get_rag() -> RAGPipeline:
    global _rag
    if _rag is None:
        db_path = os.getenv("CHROMA_DIR", "chroma_db")
        top_k = int(os.getenv("TOP_K", "4"))
        _rag = RAGPipeline(persist_dir=db_path, top_k=top_k)
    return _rag

@app.on_event("startup")
def warm_up_rag():
    rag = get_rag()
    rag.retrieve("khởi động hệ thống")
    print("[APP] RAG warm-up completed.")


@app.get("/")
def serve_homepage():
    index_file = WEB_DIR / "index.html"

    if not index_file.exists():
        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy file web/index.html",
        )

    return FileResponse(str(index_file))


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/ask", response_model=AskResponse)
def ask(req: AskRequest):
    try:
        rag = get_rag()
        result = rag.answer(req.question.strip())
        return AskResponse(**result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/text-to-speech")
async def text_to_speech(req: TextToSpeechRequest):
    try:
        text = req.text.strip()
        if not text:
            raise HTTPException(status_code=400, detail="Nội dung cần đọc đang trống.")

        audio_bytes, media_type = await synthesize_speech(text)
        return Response(content=audio_bytes, media_type=media_type)
    except ElevenTTSError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail="Không thể tạo giọng đọc cho câu trả lời.",
        ) from exc


@app.post("/speech-to-text", response_model=SpeechToTextResponse)
async def speech_to_text(file: UploadFile = File(...)):
    audio_bytes = await file.read()

    if not audio_bytes:
        raise HTTPException(status_code=400, detail="File audio đang trống.")

    try:
        transcript = await transcribe_audio(
            file_bytes=audio_bytes,
            filename=file.filename or "recording.webm",
            content_type=file.content_type,
        )
        return SpeechToTextResponse(transcript=transcript)
    except ValseaSTTError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail="Không thể chuyển giọng nói thành văn bản.",
        ) from exc


@app.websocket("/ws/speech-to-text/live")
async def live_speech_to_text(websocket: WebSocket):
    await websocket.accept()
    print("[WS] Browser realtime connection accepted.")

    try:
        async with create_realtime_connection() as valsea_ws:
            print("[WS] Connected to Valsea realtime.")
            await valsea_ws.send(get_realtime_start_message())

            async def forward_browser_audio():
                while True:
                    client_message = await websocket.receive_json()
                    message_type = client_message.get("type")

                    if message_type not in {"audio.append", "audio.commit", "session.stop"}:
                        await websocket.send_json(
                            {
                                "type": "error",
                                "message": f"Loại message không hỗ trợ: {message_type}",
                            }
                        )
                        continue

                    await valsea_ws.send(json.dumps(client_message))

                    if message_type == "session.stop":
                        break

            async def forward_valsea_events():
                async for message in valsea_ws:
                    if isinstance(message, bytes):
                        continue
                    await websocket.send_text(message)

            try:
                browser_task = asyncio.create_task(forward_browser_audio())
                valsea_task = asyncio.create_task(forward_valsea_events())
                done, pending = await asyncio.wait(
                    {browser_task, valsea_task},
                    return_when=asyncio.FIRST_COMPLETED,
                )

                for task in pending:
                    task.cancel()
                    with suppress(asyncio.CancelledError):
                        await task

                for task in done:
                    exc = task.exception()
                    if exc and not isinstance(exc, WebSocketDisconnect):
                        raise exc
            finally:
                with suppress(Exception):
                    await valsea_ws.send(json.dumps({"type": "session.stop"}))
                with suppress(Exception):
                    await valsea_ws.close()
    except WebSocketDisconnect:
        print("[WS] Browser disconnected.")
        return
    except Exception as exc:
        import traceback
        traceback.print_exc()
        print(f"[WS] Realtime bridge error: {exc}")
        with suppress(Exception):
            await websocket.send_json(
                {
                    "type": "error",
                    "message": str(exc),
                }
            )
        with suppress(Exception):
            await websocket.close(code=1011)


@app.post("/voice/event")
def voice_event(payload: Dict[str, Any]):
    return {"received": True, "payload": payload}
