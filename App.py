import os
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from rag import RAGPipeline

load_dotenv()

app = FastAPI(title="Voicebot MLN111 RAG API", version="1.0.0")


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
        _rag = RAGPipeline(persist_dir=db_path, top_k=int(os.getenv("TOP_K", "4")))
    return _rag


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/ask", response_model=AskResponse)
def ask(req: AskRequest):
    try:
        rag = get_rag()
        result = rag.answer(req.question)
        return AskResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


# Endpoint gợi ý để Agora callback text (nếu cần tích hợp realtime gateway)
@app.post("/voice/event")
def voice_event(payload: Dict[str, Any]):
    """Stub endpoint để bạn map sự kiện từ Agora AI Realtime Voice về backend."""
    return {"received": True, "payload": payload}
