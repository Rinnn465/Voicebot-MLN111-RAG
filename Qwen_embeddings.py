import os
from typing import List

from sentence_transformers import SentenceTransformer


class Qwen3Embedding4B:
    def __init__(self):
        model_name = os.getenv("EMBEDDING_MODEL", "Qwen/Qwen3-Embedding-0.6B")
        device = os.getenv("EMBEDDING_DEVICE", "cpu")
        cache_folder = os.getenv("SENTENCE_TRANSFORMERS_HOME") or None
        self.batch_size = int(os.getenv("EMBEDDING_BATCH_SIZE", "1"))

        self.model = SentenceTransformer(
            model_name,
            device=device,
            trust_remote_code=True,
            cache_folder=cache_folder,
        )

        self.query_instruction = (
            "Given a Vietnamese student question about Marxism-Leninism philosophy, "
            "retrieve relevant passages from the course chapter that answer the question."
        )

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        embeddings = self.model.encode(
            texts,
            batch_size=self.batch_size,
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
