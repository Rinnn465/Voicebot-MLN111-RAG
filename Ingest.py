import argparse
import os
from pathlib import Path

from dotenv import load_dotenv
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_community.document_loaders import TextLoader
from Qwen_embeddings import Qwen3Embedding4B    

load_dotenv()


def ingest_markdown(
    md_path: str,
    persist_dir: str = "chroma_db",
    chunk_size: int = 800,
    chunk_overlap: int = 120,
) -> None:
    """Đọc Markdown, chunk văn bản và lưu vào Chroma DB."""
    md_file = Path(md_path)
    if not md_file.exists():
        raise FileNotFoundError(f"Không tìm thấy file Markdown: {md_file}")

    api_key = os.getenv("GEMINI_API_KEY") 
    if not api_key:
        raise ValueError("Thiếu GEMINI_API_KEY trong file .env")

    loader = TextLoader(str(md_file), encoding="utf-8")
    docs = loader.load()

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ".", " ", ""],
    )
    chunks = splitter.split_documents(docs)

    if not chunks:
        raise ValueError("Không tạo được chunk nào từ Markdown.")

    persist_path = Path(persist_dir)
    persist_path.mkdir(parents=True, exist_ok=True)

    embeddings = Qwen3Embedding4B()

    Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        persist_directory=str(persist_path),
    )

    print(f"✅ Ingest thành công: {len(chunks)} chunks -> {persist_path.resolve()}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest Markdown vào ChromaDB")
    parser.add_argument(
        "--md",
        default="data/MLN111_Chapter2.md",
        help="Đường dẫn file Markdown",
    )
    parser.add_argument("--db", default="chroma_db", help="Thư mục lưu Chroma DB")
    parser.add_argument("--chunk-size", type=int, default=800)
    parser.add_argument("--chunk-overlap", type=int, default=120)
    args = parser.parse_args()

    ingest_markdown(
        md_path=args.md,
        persist_dir=args.db,
        chunk_size=args.chunk_size,
        chunk_overlap=args.chunk_overlap,
    )