from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def faq_retrieval_node(state: dict[str, Any]) -> dict[str, Any]:
    """Retrieve relevant FAQs from ChromaDB.

    Reads 'query' and 'embedding_service'/'chroma_store' from state.
    Writes 'faq_context' and 'faq_sources' to state.
    """
    query: str = state["query"]
    embedding_service = state["embedding_service"]
    chroma_store = state["chroma_store"]

    logger.info("FAQ Retrieval Agent: processing query")

    try:
        query_embedding = embedding_service.embed_query(query)
        results = chroma_store.query_faqs(query_embedding)

        faq_context_parts: list[str] = []
        faq_sources: list[dict[str, Any]] = []

        for r in results:
            faq_context_parts.append(r["content"])
            faq_sources.append({
                "source_type": "faq",
                "content": r["content"],
                "metadata": r["metadata"],
            })

        faq_context = "\n\n".join(faq_context_parts) if faq_context_parts else ""
        logger.info("FAQ Retrieval Agent: found %d results", len(results))

        return {
            "faq_context": faq_context,
            "faq_sources": faq_sources,
        }

    except Exception:
        logger.exception("FAQ Retrieval Agent failed")
        return {
            "faq_context": "",
            "faq_sources": [],
        }
