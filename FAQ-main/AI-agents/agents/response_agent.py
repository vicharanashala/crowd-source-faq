from __future__ import annotations

import logging
from typing import Any

from config import get_settings

logger = logging.getLogger(__name__)


def response_generation_node(state: dict[str, Any]) -> dict[str, Any]:
    """Generate a final answer from retrieved context.

    Reads 'query', 'faq_context', 'doc_context', 'faq_sources',
    'doc_sources', and 'llm_service' from state.
    Writes 'answer', 'confidence', 'sources', 'is_unanswered' to state.
    """
    query: str = state["query"]
    faq_context: str = state.get("faq_context", "")
    doc_context: str = state.get("doc_context", "")
    faq_sources: list[dict] = state.get("faq_sources", [])
    doc_sources: list[dict] = state.get("doc_sources", [])
    llm_service = state["llm_service"]
    settings = get_settings()

    logger.info("Response Generation Agent: generating answer")

    # Combine context
    context_parts: list[str] = []
    if faq_context:
        context_parts.append(f"=== FAQ Context ===\n{faq_context}")
    if doc_context:
        context_parts.append(f"=== Document Context ===\n{doc_context}")

    combined_context = "\n\n".join(context_parts) if context_parts else "No relevant context found."

    try:
        result = llm_service.generate_response(query, combined_context)
        answer = result["answer"]
        confidence = result["confidence"]

        # Combine sources
        all_sources = faq_sources + doc_sources

        is_unanswered = confidence < settings.confidence_threshold

        logger.info(
            "Response Generation Agent: confidence=%.2f, unanswered=%s",
            confidence,
            is_unanswered,
        )

        return {
            "answer": answer,
            "confidence": confidence,
            "sources": all_sources,
            "is_unanswered": is_unanswered,
        }

    except Exception:
        logger.exception("Response Generation Agent failed")
        return {
            "answer": "An error occurred while generating the response.",
            "confidence": 0.0,
            "sources": [],
            "is_unanswered": True,
        }
