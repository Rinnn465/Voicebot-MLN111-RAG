import os
from typing import Dict, List

from dotenv import load_dotenv
from google import genai
from langchain_chroma import Chroma
from Qwen_embeddings import Qwen3Embedding4B

load_dotenv()

SYSTEM_PROMPT = """Bạn là trợ lý học tập môn Triết học Mác-Lênin.
Chỉ được trả lời dựa trên ngữ cảnh được cung cấp.
Nếu không tìm thấy thông tin trong ngữ cảnh, hãy nói rõ:
"Mình chưa tìm thấy nội dung này trong chương tài liệu hiện có."
"""


class RAGPipeline:
    def __init__(self, persist_dir: str = "chroma_db", top_k: int = 4):
        self.top_k = top_k

        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError(
                "Thiếu GEMINI_API_KEY hoặc GOOGLE_API_KEY trong file .env"
            )

        # Embedding query bằng Qwen.
        # Vector DB cũng phải được ingest bằng cùng model Qwen/Qwen3-Embedding-4B.
        self.embeddings = Qwen3Embedding4B()

        self.vectordb = Chroma(
            persist_directory=persist_dir,
            embedding_function=self.embeddings,
        )

        self.client = genai.Client(api_key=api_key)

        # GEMINI_MODEL=gemini-3.1-flash-lite
        self.model = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")

    def retrieve(self, question: str):
        return self.vectordb.similarity_search(question, k=self.top_k)

    def answer(self, question: str) -> Dict[str, object]:
        docs = self.retrieve(question)

        context_parts: List[str] = []
        sources: List[Dict[str, object]] = []

        for i, doc in enumerate(docs, start=1):
            source = doc.metadata.get("source", "unknown")

            context_parts.append(f"[{i}] {doc.page_content}")
            sources.append({"source": source})

        context = "\n\n".join(context_parts)

        prompt = f"""
{SYSTEM_PROMPT}

Câu hỏi:
{question}

Ngữ cảnh:
{context}

Yêu cầu:
- Trả lời ngắn gọn, đúng trọng tâm, bằng tiếng Việt.
- Không bổ sung thông tin ngoài ngữ cảnh.
- Nếu ngữ cảnh không đủ để trả lời, dùng đúng câu từ chối đã được quy định.
"""

        response = self.client.models.generate_content(
            model=self.model,
            contents=prompt,
        )

        answer_text = (
            response.text.strip()
            if response.text
            else "Mình chưa tìm thấy nội dung này trong chương tài liệu hiện có."
        )

        return {
            "answer": answer_text,
            "sources": sources,
            "context_count": len(docs),
        }