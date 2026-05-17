import os
import time
from typing import Dict, List

from dotenv import load_dotenv
from cerebras.cloud.sdk import Cerebras
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

        api_key = os.getenv("CEREBRAS_API_KEY")
        if not api_key:
            raise ValueError("Thiếu CEREBRAS_API_KEY trong file .env")

        self.embeddings = Qwen3Embedding4B()

        self.vectordb = Chroma(
            persist_directory=persist_dir,
            embedding_function=self.embeddings,
        )

        self.client = Cerebras(api_key=api_key)

        self.model = os.getenv(
            "CEREBRAS_MODEL",
            "qwen-3-235b-a22b-instruct-2507",
        )

        print(f"[RAG] Cerebras model: {self.model}")
        print(f"[RAG] top_k: {self.top_k}")

    def retrieve(self, question: str):
        return self.vectordb.similarity_search(question, k=self.top_k)

    def answer(self, question: str) -> Dict[str, object]:
        total_start = time.perf_counter()

        retrieve_start = time.perf_counter()
        docs = self.retrieve(question)
        retrieve_end = time.perf_counter()

        context_parts: List[str] = []
        sources: List[Dict[str, object]] = []

        for i, doc in enumerate(docs, start=1):
            source = doc.metadata.get("source", "unknown")

            context_parts.append(f"[{i}] {doc.page_content}")
            sources.append({"source": source})

        context = "\n\n".join(context_parts)

        user_prompt = f"""Câu hỏi:
{question}

Ngữ cảnh:
{context}

Yêu cầu:
- Trả lời đúng trọng tâm, bằng tiếng Việt.
- Không lan man, không mở rộng ngoài câu hỏi.
- Không bổ sung thông tin ngoài ngữ cảnh.
- Nếu ngữ cảnh không đủ để trả lời, dùng đúng câu từ chối đã được quy định.
"""

        generation_start = time.perf_counter()

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": SYSTEM_PROMPT,
                },
                {
                    "role": "user",
                    "content": user_prompt,
                },
            ],
            temperature=0.2,
            max_completion_tokens=220,
        )

        generation_end = time.perf_counter()

        answer_text = (
            response.choices[0].message.content.strip()
            if response.choices
            and response.choices[0].message
            and response.choices[0].message.content
            else "Mình chưa tìm thấy nội dung này trong chương tài liệu hiện có."
        )

        total_end = time.perf_counter()

        retrieve_time = retrieve_end - retrieve_start
        generation_time = generation_end - generation_start
        total_time = total_end - total_start

        print(
            f"[RAG TIMING] "
            f"retrieve={retrieve_time:.2f}s | "
            f"cerebras={generation_time:.2f}s | "
            f"total={total_time:.2f}s"
        )

        return {
            "answer": answer_text,
            "sources": sources,
            "context_count": len(docs),
        }