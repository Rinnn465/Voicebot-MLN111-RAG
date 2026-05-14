from typing import Dict, List

from langchain_chroma import Chroma
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

SYSTEM_PROMPT = """Bạn là trợ lý học tập môn Triết học Mác-Lênin.
Chỉ được trả lời dựa trên ngữ cảnh được cung cấp.
Nếu không tìm thấy thông tin trong ngữ cảnh, hãy nói rõ: "Mình chưa tìm thấy nội dung này trong chương tài liệu hiện có."""


class RAGPipeline:
    def __init__(self, persist_dir: str = "chroma_db", top_k: int = 4):
        self.top_k = top_k
        self.embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
        self.vectordb = Chroma(
            persist_directory=persist_dir,
            embedding_function=self.embeddings,
        )
        self.llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.2)

    def retrieve(self, question: str):
        return self.vectordb.similarity_search(question, k=self.top_k)

    def answer(self, question: str) -> Dict[str, object]:
        docs = self.retrieve(question)

        context_parts: List[str] = []
        sources: List[Dict[str, object]] = []

        for i, doc in enumerate(docs, start=1):
            source = doc.metadata.get("source", "unknown")
            page = doc.metadata.get("page", None)
            context_parts.append(f"[{i}] {doc.page_content}")
            sources.append({"source": source, "page": page})

        context = "\n\n".join(context_parts)

        prompt = (
            f"{SYSTEM_PROMPT}\n\n"
            f"Câu hỏi: {question}\n\n"
            f"Ngữ cảnh:\n{context}\n\n"
            "Hãy trả lời ngắn gọn, đúng trọng tâm, bằng tiếng Việt."
        )

        resp = self.llm.invoke(prompt)
        return {
            "answer": resp.content,
            "sources": sources,
            "context_count": len(docs),
        }
