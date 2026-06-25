from __future__ import annotations

import logging
from typing import Any

from langgraph.graph import END, StateGraph

from agents.document_agent import document_retrieval_node
from agents.faq_agent import faq_retrieval_node
from agents.response_agent import response_generation_node
from agents.router_agent import router_node
from agents.suggestion_agent import suggestion_node
from graph.state import GraphState

logger = logging.getLogger(__name__)


def _route_decision(state: dict[str, Any]) -> str:
    """Return the next node(s) based on the routing decision."""
    route = state.get("route", "BOTH").upper()
    if route == "FAQ":
        return "faq_only"
    elif route == "DOCUMENT":
        return "doc_only"
    else:
        return "both"


def build_workflow() -> Any:
    """Build and compile the LangGraph workflow.

    Flow:
        START → router → (conditional) →
            FAQ  →  faq_retrieval → response_generation
            DOC  →  doc_retrieval → response_generation
            BOTH →  faq_retrieval → doc_retrieval → response_generation
        → suggestion → END

    Returns:
        Compiled LangGraph graph.
    """
    graph = StateGraph(GraphState)

    #  Add nodes 
    graph.add_node("router", router_node)
    graph.add_node("faq_retrieval", faq_retrieval_node)
    graph.add_node("doc_retrieval", document_retrieval_node)
    graph.add_node("response_generation", response_generation_node)
    graph.add_node("suggestion", suggestion_node)

    #  Entry point 
    graph.set_entry_point("router")

    #  Conditional routing after router
    graph.add_conditional_edges(
        "router",
        _route_decision,
        {
            "faq_only": "faq_retrieval",
            "doc_only": "doc_retrieval",
            "both": "faq_retrieval",
        },
    )

    # ── FAQ retrieval edges ─────────────────────────────────────
    # After faq_retrieval, check if we also need doc_retrieval (BOTH route)
    def _after_faq(state: dict[str, Any]) -> str:
        route = state.get("route", "").upper()
        if route == "BOTH":
            return "continue_to_doc"
        return "continue_to_response"

    graph.add_conditional_edges(
        "faq_retrieval",
        _after_faq,
        {
            "continue_to_doc": "doc_retrieval",
            "continue_to_response": "response_generation",
        },
    )

    # ── Document retrieval → response ───────────────────────────
    graph.add_edge("doc_retrieval", "response_generation")

    # ── Response → suggestion → END ────────────────────────────
    graph.add_edge("response_generation", "suggestion")
    graph.add_edge("suggestion", END)

    # ── Compile ─────────────────────────────────────────────────
    compiled = graph.compile()
    logger.info("LangGraph workflow compiled successfully")
    return compiled
