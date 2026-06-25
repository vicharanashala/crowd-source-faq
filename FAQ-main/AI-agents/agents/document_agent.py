from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def document_retrieval_node(state: dict[str, Any]) -> dict[str, Any]:
    """Retrieve relevant document chunks from ChromaDB.

    Reads 'query' and 'embedding_service'/'chroma_store' from state.
    Writes 'doc_context' and 'doc_sources' to state.
    """
    query: str = state["query"]
    embedding_service = state["embedding_service"]
    chroma_store = state["chroma_store"]

    logger.info("Document Retrieval Agent: processing query")

    try:
        query_embedding = embedding_service.embed_query(query)
        results = chroma_store.query_documents(query_embedding)

        doc_context_parts: list[str] = []
        doc_sources: list[dict[str, Any]] = []

        for r in results:
            doc_context_parts.append(r["content"])
            doc_sources.append({
                "source_type": "document",
                "content": r["content"],
                "metadata": r["metadata"],
            })

        doc_context = "\n\n".join(doc_context_parts) if doc_context_parts else ""
        logger.info("Document Retrieval Agent: found %d results", len(results))

        return {
            "doc_context": doc_context,
            "doc_sources": doc_sources,
        }

    except Exception:
        logger.exception("Document Retrieval Agent failed")
        return {
            "doc_context": "",
            "doc_sources": [],
        }
