from __future__ import annotations

import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)


def suggestion_node(state: dict[str, Any]) -> dict[str, Any]:
    """Detect unanswered questions and generate FAQ suggestions.

    If the query was not answered with sufficient confidence,
    generate a suggested FAQ entry and save it to MongoDB.

    Reads 'query', 'is_unanswered', 'llm_service', 'mongo_client' from state.
    """
    query: str = state["query"]
    is_unanswered: bool = state.get("is_unanswered", False)
    llm_service = state["llm_service"]
    mongo_client = state["mongo_client"]

    if not is_unanswered:
        logger.debug("Suggestion Agent: query was answered, skipping")
        return {}

    logger.info("Suggestion Agent: generating FAQ suggestion for unanswered query")

    try:
        suggestion = llm_service.generate_faq_suggestion(query)

        # Schedule the async MongoDB save within the running event loop
        try:
            loop = asyncio.get_running_loop()
            # We're inside an async context (FastAPI), schedule as a fire-and-forget task
            loop.create_task(
                mongo_client.save_unanswered_question(query, suggestion)
            )
        except RuntimeError:
            # No running loop — fallback for non-async contexts
            asyncio.run(
                mongo_client.save_unanswered_question(query, suggestion)
            )

        logger.info("Suggestion Agent: saved unanswered question to MongoDB")
        return {}

    except Exception:
        logger.exception("Suggestion Agent failed")
        return {}
