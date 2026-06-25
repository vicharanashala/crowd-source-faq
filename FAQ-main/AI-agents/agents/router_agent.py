from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def router_node(state: dict[str, Any]) -> dict[str, Any]:
    """Route a query to FAQ, DOCUMENT, or BOTH retrieval paths.

    Reads 'query' and 'llm_service' from state.
    Writes 'route' to state.
    """
    query: str = state["query"]
    llm_service = state["llm_service"]

    logger.info("Router Agent: classifying query")

    try:
        route = llm_service.classify_route(query)
        logger.info("Router Agent: route=%s", route)
        return {"route": route}
    except Exception:
        logger.exception("Router Agent failed, defaulting to BOTH")
        return {"route": "BOTH"}
