import argparse
from pathlib import Path

from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_community.document_loaders import PyPDFLoader
from langchain_openai import OpenAIEmbeddings


def ingest_pdf(
    pdf_path: str,
    persist_dir: str = "chroma_db",
    chunk_size: int = 800,
    chunk_overlap: int = 120,
) -> None:
    """Đọc PDF, chunk văn bản và lưu vào Chroma DB."""
    pdf_file = Path(pdf_path)
    if not pdf_file.exists():
        raise FileNotFoundError(f"Không tìm thấy file PDF: {pdf_file}")

    loader = PyPDFLoader(str(pdf_file))
    docs = loader.load()

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ".", " ", ""],
    )
    chunks = splitter.split_documents(docs)

    if not chunks:
        raise ValueError("Không tạo được chunk nào từ PDF.")

    persist_path = Path(persist_dir)
    persist_path.mkdir(parents=True, exist_ok=True)

    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

    Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        persist_directory=str(persist_path),
    )

    print(f"✅ Ingest thành công: {len(chunks)} chunks -> {persist_path.resolve()}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest PDF vào ChromaDB")
    parser.add_argument("--pdf", default="data/chuong_1.pdf", help="Đường dẫn PDF")
    parser.add_argument("--db", default="chroma_db", help="Thư mục lưu Chroma DB")
    parser.add_argument("--chunk-size", type=int, default=800)
    parser.add_argument("--chunk-overlap", type=int, default=120)
    args = parser.parse_args()

    ingest_pdf(
        pdf_path=args.pdf,
        persist_dir=args.db,
        chunk_size=args.chunk_size,
        chunk_overlap=args.chunk_overlap,
    )
