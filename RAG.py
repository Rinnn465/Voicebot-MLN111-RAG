import os
import time
from typing import Dict, List

from dotenv import load_dotenv
from langchain_chroma import Chroma
from openai import OpenAI

from Qwen_embeddings import Qwen3Embedding4B

load_dotenv()

SYSTEM_PROMPT = """Bạn là voicebot tiếng Việt cho một buổi demo môn Triết học Mác-Lênin.
Bạn nói như một người đang trò chuyện trực tiếp, không như đang đọc giáo trình.

Phong cách bắt buộc:
- Không dùng Markdown.
- Không dùng gạch đầu dòng.
- Không đặt tiêu đề như "Lập luận mở rộng" hay "Nói ngắn gọn hơn".
- Không in đậm, không đánh số ý.
- Trả lời bằng 2 đến 5 câu ngắn, tự nhiên, dễ nghe khi chuyển thành giọng nói.
- Luôn kết thúc bằng một câu hoàn chỉnh; nếu câu trả lời có nguy cơ dài, hãy rút gọn thay vì dừng giữa câu.
- Ưu tiên câu nói đời thường, ví dụ: "Hiểu đơn giản là...", "Mình sẽ nói thế này...", "Điểm đáng tranh luận là...".

Về nội dung:
- Nếu tài liệu truy xuất có thông tin liên quan, hãy dùng nó làm nền.
- Không cần luôn nói "theo tài liệu"; chỉ nói khi thật sự cần phân biệt nguồn.
- Được phép dùng kiến thức nền, ví dụ và lập luận logic để mở rộng cho debate.
- Nếu người dùng hỏi theo kiểu tranh luận, hãy đưa một lập trường rõ, rồi phản biện ngắn gọn phía còn lại.
- Nếu người dùng chỉ hỏi định nghĩa, hãy giải thích mềm, ngắn và dễ hiểu, không biến thành bài giảng.
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

        user_prompt = f"""Câu hỏi của người dùng:
{question}

Ngữ cảnh tài liệu có thể tham khảo:
{context}

Hãy trả lời như đang nói chuyện trong một voicebot demo. Viết thành một đoạn hội thoại ngắn, không Markdown, không bullet, không tiêu đề. Nếu câu hỏi không yêu cầu tranh luận, đừng tự thêm phần tranh luận riêng. Nếu cần giải thích khái niệm, hãy nói dễ hiểu bằng ví dụ gần gũi. Kết thúc bằng câu hoàn chỉnh, không dừng giữa ý.
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
<<<<<<< HEAD
            max_output_tokens=220,
            temperature=0.2,
=======
>>>>>>> main
            store=False,
        )

        answer_text = (
            response.output_text.strip()
            if getattr(response, "output_text", None)
<<<<<<< HEAD
            else "Mình chưa tìm thấy nội dung này trong chương tài liệu hiện có."
=======
            else "Mình chưa tạo được câu trả lời phù hợp lúc này."
>>>>>>> main
        )

        generation_end = time.perf_counter()

<<<<<<< HEAD
        if not answer_text:
            answer_text = "Mình chưa tìm thấy nội dung này trong chương tài liệu hiện có."
=======
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

        if not answer_text:
            answer_text = "Mình chưa tạo được câu trả lời phù hợp lúc này."
>>>>>>> main

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
