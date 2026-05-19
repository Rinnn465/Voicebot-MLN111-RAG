import os
import time
from typing import Dict, List

from dotenv import load_dotenv
from langchain_chroma import Chroma
from openai import OpenAI

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

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("Thiếu OPENAI_API_KEY trong file .env")

        self.embeddings = Qwen3Embedding4B()

        self.vectordb = Chroma(
            persist_directory=persist_dir,
            embedding_function=self.embeddings,
        )

        self.client = OpenAI(api_key=api_key)

        self.model = os.getenv(
            "OPENAI_MODEL",
            "gpt-5.4-mini",
        )
        self.reasoning_effort = os.getenv(
            "OPENAI_REASONING_EFFORT",
            "low",
        )

        print(f"[RAG] OpenAI model: {self.model}")
        print(f"[RAG] OpenAI reasoning effort: {self.reasoning_effort}")
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

        response = self.client.responses.create(
            model=self.model,
            instructions=SYSTEM_PROMPT,
            input=user_prompt,
            reasoning={
                "effort": self.reasoning_effort,
            },
            text={
                "verbosity": "low",
            },
            max_output_tokens=220,
            temperature=0.2,
            store=False,
        )

        answer_text = (
            response.output_text.strip()
            if getattr(response, "output_text", None)
            else "Mình chưa tìm thấy nội dung này trong chương tài liệu hiện có."
        )

        generation_end = time.perf_counter()

        if not answer_text:
            answer_text = "Mình chưa tìm thấy nội dung này trong chương tài liệu hiện có."

        total_end = time.perf_counter()

        retrieve_time = retrieve_end - retrieve_start
        generation_time = generation_end - generation_start
        total_time = total_end - total_start

        print(
            f"[RAG TIMING] "
            f"retrieve={retrieve_time:.2f}s | "
            f"openai={generation_time:.2f}s | "
            f"total={total_time:.2f}s"
        )

        return {
            "answer": answer_text,
            "sources": sources,
            "context_count": len(docs),
        }
