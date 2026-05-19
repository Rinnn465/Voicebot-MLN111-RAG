import os
from pathlib import Path
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
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

@app.post("/voice/event")
def voice_event(payload: Dict[str, Any]):
    return {"received": True, "payload": payload}