from typing import List

from sentence_transformers import SentenceTransformer


class Qwen3Embedding4B:
    def __init__(self):
        self.model = SentenceTransformer(
            "Qwen/Qwen3-Embedding-4B",
            device="cuda",
            trust_remote_code=True,
            cache_folder=r"D:\AI_Cache\sentence_transformers",
        )

        self.query_instruction = (
            "Given a Vietnamese student question about Marxism-Leninism philosophy, "
            "retrieve relevant passages from the course chapter that answer the question."
        )

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        embeddings = self.model.encode(
            texts,
            batch_size=2,
            normalize_embeddings=True,
            show_progress_bar=True,
        )
        return embeddings.tolist()

    def embed_query(self, text: str) -> List[float]:
        query = f"Instruct: {self.query_instruction}\nQuery: {text}"

        embedding = self.model.encode(
            query,
            normalize_embeddings=True,
        )
        return embedding.tolist()