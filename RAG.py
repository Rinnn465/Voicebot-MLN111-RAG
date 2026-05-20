import os
import time
from typing import Dict, List

from dotenv import load_dotenv
from langchain_chroma import Chroma
from openai import OpenAI

from Qwen_embeddings import Qwen3Embedding4B

from prompt_contract import (
    SYSTEM_PROMPT,
    build_user_prompt,
    apply_intro_policy,
    sanitize_tts_text,
)

load_dotenv()


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

        user_prompt = build_user_prompt(context, question)

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
            store=False,
        )

        answer_text = (
            response.output_text.strip()
            if getattr(response, "output_text", None)
            else "Mình chưa tạo được câu trả lời phù hợp lúc này."
        )

        generation_end = time.perf_counter()

        usage = getattr(response, "usage", None)
        if usage:
            input_tokens = getattr(usage, "input_tokens", None)
            output_tokens = getattr(usage, "output_tokens", None)
            total_tokens = getattr(usage, "total_tokens", None)
            print(
                f"[RAG TOKENS] "
                f"input={input_tokens} | "
                f"output={output_tokens} | "
                f"total={total_tokens}"
            )

        answer_text = sanitize_tts_text(answer_text)
        if not answer_text:
            answer_text = "Mình chưa tạo được câu trả lời phù hợp lúc này."

        answer_text = apply_intro_policy(answer_text, question)

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
