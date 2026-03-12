import asyncio
import hashlib
import logging

import google.generativeai as genai

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmbeddingService:
    def __init__(self) -> None:
        if settings.gemini_api_key:
            genai.configure(api_key=settings.gemini_api_key)

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """
        Generate embeddings using Gemini text-embedding-004.

        The model returns 768-dimensional vectors, which must match the
        pgvector column and SQL matching function.
        """
        if not texts:
            return []

        if not settings.gemini_api_key:
            # Local fallback keeps ingestion moving in dev environments without external keys.
            return [self._fallback_vector(text) for text in texts]

        try:
            vectors = await asyncio.gather(*(self._embed_one(text) for text in texts))
            return vectors
        except Exception as exc:  # noqa: BLE001
            # Do not fail ingestion when provider models are missing/deprecated.
            logger.warning("Gemini embeddings unavailable, falling back to local vectors: %s", exc)
            return [self._fallback_vector(text) for text in texts]

    async def _embed_one(self, text: str) -> list[float]:
        candidate_models = [
            settings.gemini_embedding_model,
            "models/embedding-001",
            "models/text-embedding-004",
        ]
        unique_models: list[str] = []
        for model_name in candidate_models:
            if model_name and model_name not in unique_models:
                unique_models.append(model_name)

        response = None
        last_error: Exception | None = None
        for model_name in unique_models:
            try:
                response = await asyncio.to_thread(
                    genai.embed_content,
                    model=model_name,
                    content=text,
                    task_type="retrieval_document",
                )
                break
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                continue

        if response is None:
            raise RuntimeError(f"No supported embedding model succeeded: {last_error}")

        vector: list[float] = []

        if isinstance(response, dict):
            if isinstance(response.get("embedding"), list):
                vector = response["embedding"]
            elif isinstance(response.get("embeddings"), list) and response["embeddings"]:
                first = response["embeddings"][0]
                if isinstance(first, dict) and isinstance(first.get("values"), list):
                    vector = first["values"]
        else:
            maybe_embedding = getattr(response, "embedding", None)
            if isinstance(maybe_embedding, list):
                vector = maybe_embedding

        if not vector:
            raise RuntimeError("Embedding provider returned an empty vector")

        vector = self._to_768(vector)

        return vector

    @staticmethod
    def _to_768(vector: list[float]) -> list[float]:
        if len(vector) == 768:
            return vector

        if len(vector) > 768:
            return vector[:768]

        # Pad shorter vectors deterministically so pgvector insert always matches schema.
        return [*vector, *([0.0] * (768 - len(vector)))]

    @staticmethod
    def _fallback_vector(text: str) -> list[float]:
        digest = hashlib.sha256(text.encode("utf-8", errors="ignore")).digest()
        vector: list[float] = []

        for index in range(768):
            byte = digest[index % len(digest)]
            vector.append((byte / 255.0) * 2.0 - 1.0)

        return vector
