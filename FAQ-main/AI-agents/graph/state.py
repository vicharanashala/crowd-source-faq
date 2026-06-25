from __future__ import annotations

from typing import Any, TypedDict


class GraphState(TypedDict, total=False):
    """State shared across all nodes in the LangGraph workflow."""

    # ── Input ───────────────────────────────────────────────────
    query: str

    # ── Routing ─────────────────────────────────────────────────
    route: str  # "FAQ", "DOCUMENT", or "BOTH"

    # ── Retrieved Context ───────────────────────────────────────
    faq_context: str
    faq_sources: list[dict[str, Any]]
    doc_context: str
    doc_sources: list[dict[str, Any]]

    # ── Response ────────────────────────────────────────────────
    answer: str
    confidence: float
    sources: list[dict[str, Any]]
    is_unanswered: bool

    # ── Injected Dependencies (not serialised) ─────────────────
    embedding_service: Any
    llm_service: Any
    chroma_store: Any
    mongo_client: Any
