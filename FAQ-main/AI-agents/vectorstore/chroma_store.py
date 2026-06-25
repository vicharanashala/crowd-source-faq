from __future__ import annotations

import logging
from typing import Any

import chromadb

from config import get_settings

logger = logging.getLogger(__name__)


class ChromaStore:
    """Manages FAQ and Document collections in ChromaDB."""

    def __init__(self) -> None:
        settings = get_settings()

        # Use CloudClient if credentials are provided, otherwise fall back to local persistent
        if settings.chroma_api_key and settings.chroma_tenant and settings.chroma_database:
            self._client = chromadb.CloudClient(
                tenant=settings.chroma_tenant,
                database=settings.chroma_database,
                api_key=settings.chroma_api_key,
            )
            logger.info(
                "ChromaStore initialized — Cloud (tenant=%s, db=%s)",
                settings.chroma_tenant,
                settings.chroma_database,
            )
        else:
            self._client = chromadb.PersistentClient(path="./chroma_data")
            logger.info("ChromaStore initialized — Local persistent (./chroma_data)")

        self._faq_collection = self._client.get_or_create_collection(
            name=settings.chroma_faq_collection,
            metadata={"hnsw:space": "cosine"},
        )
        self._doc_collection = self._client.get_or_create_collection(
            name=settings.chroma_doc_collection,
            metadata={"hnsw:space": "cosine"},
        )
        self._discussion_collection = self._client.get_or_create_collection(
            name=settings.chroma_discussion_collection,
            metadata={"hnsw:space": "cosine"},
        )
        logger.info(
            "ChromaStore collections: faq=%s, doc=%s, discussion=%s",
            settings.chroma_faq_collection,
            settings.chroma_doc_collection,
            settings.chroma_discussion_collection,
        )

    # ── FAQ Operations ──────────────────────────────────────────

    def add_faqs(
        self,
        faqs: list[dict[str, str]],
        embeddings: list[list[float]],
    ) -> int:
        """Add FAQ entries to the FAQ collection.

        Args:
            faqs: List of dicts with 'question' and 'answer' keys.
            embeddings: Corresponding embedding vectors.

        Returns:
            Number of FAQs added.
        """
        if not faqs:
            return 0

        existing_count = self._faq_collection.count()
        ids = [f"faq_{existing_count + i}" for i in range(len(faqs))]
        documents = [f"Q: {f['question']}\nA: {f['answer']}" for f in faqs]
        metadatas = [
            {"question": f["question"], "answer": f["answer"], "source_type": "faq"}
            for f in faqs
        ]

        self._faq_collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=documents,
            metadatas=metadatas,
        )
        logger.info("Added %d FAQs to collection", len(faqs))
        return len(faqs)

    def query_faqs(
        self,
        query_embedding: list[float],
        top_k: int | None = None,
    ) -> list[dict[str, Any]]:
        """Query the FAQ collection.

        Args:
            query_embedding: The query embedding vector.
            top_k: Number of results to return.

        Returns:
            List of result dicts with 'content', 'metadata', 'distance' keys.
        """
        settings = get_settings()
        top_k = top_k or settings.top_k_results

        count = self._faq_collection.count()
        if count == 0:
            logger.warning("FAQ collection is empty")
            return []

        effective_k = min(top_k, count)
        results = self._faq_collection.query(
            query_embeddings=[query_embedding],
            n_results=effective_k,
            include=["documents", "metadatas", "distances"],
        )

        parsed = self._parse_results(results)
        logger.debug("FAQ query returned %d results", len(parsed))
        return parsed

    # ── Document Operations ─────────────────────────────────────

    def add_documents(
        self,
        doc_id: str,
        chunks: list[str],
        embeddings: list[list[float]],
        filename: str = "",
    ) -> int:
        """Add document chunks to the document collection.

        Args:
            doc_id: Unique document identifier.
            chunks: Text chunks from the document.
            embeddings: Corresponding embedding vectors.
            filename: Original filename for metadata.

        Returns:
            Number of chunks added.
        """
        if not chunks:
            return 0

        ids = [f"{doc_id}_chunk_{i}" for i in range(len(chunks))]
        metadatas = [
            {
                "doc_id": doc_id,
                "chunk_index": i,
                "filename": filename,
                "source_type": "document",
            }
            for i in range(len(chunks))
        ]

        self._doc_collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=chunks,
            metadatas=metadatas,
        )
        logger.info("Added %d chunks for document %s", len(chunks), doc_id)
        return len(chunks)

    def query_documents(
        self,
        query_embedding: list[float],
        top_k: int | None = None,
    ) -> list[dict[str, Any]]:
        """Query the document collection.

        Args:
            query_embedding: The query embedding vector.
            top_k: Number of results to return.

        Returns:
            List of result dicts with 'content', 'metadata', 'distance' keys.
        """
        settings = get_settings()
        top_k = top_k or settings.top_k_results

        count = self._doc_collection.count()
        if count == 0:
            logger.warning("Document collection is empty")
            return []

        effective_k = min(top_k, count)
        results = self._doc_collection.query(
            query_embeddings=[query_embedding],
            n_results=effective_k,
            include=["documents", "metadatas", "distances"],
        )

        parsed = self._parse_results(results)
        logger.debug("Document query returned %d results", len(parsed))
        return parsed

    # ── Discussion Question Operations (Feature 2) ──────────────

    def add_discussion_question(
        self,
        post_id: str,
        title: str,
        embedding: list[float],
        cluster_id: str = "",
    ) -> str:
        """Store a discussion post embedding for repetition detection.

        Args:
            post_id: The Post's unique id (custom slug or ObjectId string).
            title: The post title (stored as document text).
            embedding: Pre-computed embedding vector.
            cluster_id: Optional cluster id to store in metadata.

        Returns:
            The Chroma document id used.
        """
        doc_id = f"discq_{post_id}"
        metadata: dict[str, Any] = {"post_id": post_id, "title": title}
        if cluster_id:
            metadata["cluster_id"] = cluster_id

        # Upsert — safe to call even if the post was already stored
        try:
            self._discussion_collection.upsert(
                ids=[doc_id],
                embeddings=[embedding],
                documents=[title],
                metadatas=[metadata],
            )
        except Exception:
            self._discussion_collection.add(
                ids=[doc_id],
                embeddings=[embedding],
                documents=[title],
                metadatas=[metadata],
            )

        logger.debug("Stored discussion question id=%s (post_id=%s)", doc_id, post_id)
        return doc_id

    def query_similar_discussion_questions(
        self,
        query_embedding: list[float],
        top_k: int = 10,
    ) -> list[dict[str, Any]]:
        """Find discussion posts similar to the given embedding.

        Args:
            query_embedding: Embedding of the new post to compare against.
            top_k: Maximum number of neighbours to return.

        Returns:
            List of dicts with 'content', 'metadata', 'distance' keys —
            same shape as query_faqs / query_documents.
        """
        count = self._discussion_collection.count()
        if count == 0:
            logger.debug("Discussion collection is empty — no matches")
            return []

        effective_k = min(top_k, count)
        results = self._discussion_collection.query(
            query_embeddings=[query_embedding],
            n_results=effective_k,
            include=["documents", "metadatas", "distances"],
        )

        parsed = self._parse_results(results)
        logger.debug("Discussion query returned %d results", len(parsed))
        return parsed

    # ── Helpers ─────────────────────────────────────────────────

    @staticmethod
    def _parse_results(results: dict) -> list[dict[str, Any]]:
        """Parse ChromaDB query results into a flat list."""
        parsed: list[dict[str, Any]] = []
        documents = results.get("documents", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]

        for doc, meta, dist in zip(documents, metadatas, distances):
            parsed.append({
                "content": doc,
                "metadata": meta or {},
                "distance": dist,
            })
        return parsed
