from __future__ import annotations

import logging
from typing import Sequence

from chromadb.utils.embedding_functions import DefaultEmbeddingFunction

logger = logging.getLogger(__name__)


class EmbeddingService:
    """Generates embeddings using ChromaDB's built-in ONNX model (all-MiniLM-L6-v2).

    No external API key required — runs locally via ONNX Runtime.
    """

    def __init__(self) -> None:
        self._ef = DefaultEmbeddingFunction()
        logger.info("EmbeddingService initialized (local ONNX all-MiniLM-L6-v2)")

    def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        """Generate embeddings for a batch of texts.

        Args:
            texts: Sequence of text strings to embed.

        Returns:
            List of embedding vectors.
        """
        if not texts:
            return []

        try:
            embeddings = self._ef(list(texts))
            logger.debug("Generated %d document embeddings", len(embeddings))
            return [[float(x) for x in e] for e in embeddings]
        except Exception:
            logger.exception("Failed to generate document embeddings")
            raise

    def embed_query(self, text: str) -> list[float]:
        """Generate an embedding for a single query.

        Args:
            text: The query text.

        Returns:
            Embedding vector.
        """
        try:
            embeddings = self._ef([text])
            embedding = [float(x) for x in embeddings[0]]
            logger.debug("Generated query embedding (dim=%d)", len(embedding))
            return embedding
        except Exception:
            logger.exception("Failed to generate query embedding")
            raise
