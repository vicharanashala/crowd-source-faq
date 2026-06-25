"""repetition_agent.py — Feature 2: Recurring Discussion Questions → Auto-FAQ Suggestion.

This module runs on post-creation (not inside the LangGraph chat workflow).
It embeds the new post title, checks for semantic duplicates in the discussion
collection, maintains repetition clusters in MongoDB, and fires the LLM FAQ
suggestion exactly once when a cluster crosses the threshold.
"""
from __future__ import annotations

import logging
from typing import Any

from config import get_settings

logger = logging.getLogger(__name__)


async def check_and_record_repetition(
    post_id: str,
    title: str,
    embedding_service: Any,
    chroma_store: Any,
    mongo_client: Any,
    llm_service: Any,
) -> dict:
    """Embed the post title, detect repetition, update clusters in MongoDB.

    This function must never raise — all errors are caught and logged so that
    a failure here never blocks the post-creation response.

    Args:
        post_id:          Unique post identifier (custom slug or ObjectId string).
        title:            Combined title + intro text for embedding.
        embedding_service: Initialised EmbeddingService instance.
        chroma_store:     Initialised ChromaStore instance.
        mongo_client:     Initialised MongoClient instance.
        llm_service:      Initialised LLMService instance.

    Returns:
        A small summary dict for logging/debugging.
    """
    settings = get_settings()

    try:
        # 1. Embed the post text
        embedding = embedding_service.embed_query(title)

        # 2. Query discussion collection for similar existing posts
        similar = chroma_store.query_similar_discussion_questions(
            query_embedding=embedding,
            top_k=10,
        )

        # ChromaDB cosine space returns *distance* (0 = identical, 2 = opposite).
        # Similarity = 1 - distance  (valid because cosine distance ∈ [0, 2]).
        threshold = settings.repetition_similarity_threshold
        matches = [
            r for r in similar
            if (1.0 - r["distance"]) >= threshold
        ]

        logger.info(
            "Repetition check for post_id=%s: %d similar posts found (threshold=%.2f)",
            post_id,
            len(matches),
            threshold,
        )

        cluster_doc: dict = {}
        crossed_threshold = False

        if matches:
            # Use the representative_question of the closest existing cluster.
            # We stored `cluster_id` in metadata when we first created it;
            # fall back to the matched post's title as cluster key.
            best_match = matches[0]
            meta = best_match.get("metadata", {})

            # Prefer the cluster's representative question if stored
            representative = meta.get("representative_question") or best_match.get("content", title)

            # Upsert into the cluster
            cluster_doc = await mongo_client.upsert_cluster_hit(
                post_id=post_id,
                post_title=title,
                representative_question=representative,
            )

            # Check if we just crossed the threshold (fire suggestion exactly once)
            new_count = cluster_doc.get("occurrence_count", 0)
            if new_count == settings.repetition_min_count:
                crossed_threshold = True
                logger.info(
                    "Cluster '%s' just hit threshold (%d) — generating FAQ suggestion",
                    representative,
                    settings.repetition_min_count,
                )
                try:
                    suggestion = llm_service.generate_faq_suggestion(representative)
                    await mongo_client.set_cluster_suggestion(
                        cluster_id=cluster_doc["_id"],
                        suggested_question=suggestion.get("suggested_question", representative),
                        suggested_answer=suggestion.get("suggested_answer", ""),
                    )
                    cluster_doc["suggested_question"] = suggestion.get("suggested_question")
                    cluster_doc["suggested_answer"] = suggestion.get("suggested_answer")
                except Exception as sugg_err:
                    logger.warning("FAQ suggestion generation failed (non-blocking): %s", sugg_err)

        else:
            # No similar post found — create a new cluster seeded by this post
            cluster_doc = await mongo_client.create_new_cluster(
                post_id=post_id,
                post_title=title,
            )

        # 3. Store the post embedding (with cluster reference in metadata)
        cluster_id = cluster_doc.get("_id", "")
        chroma_store.add_discussion_question(
            post_id=post_id,
            title=title,
            embedding=embedding,
            cluster_id=str(cluster_id),
        )

        return {
            "post_id": post_id,
            "similar_count": len(matches),
            "cluster_id": str(cluster_doc.get("_id", "")),
            "occurrence_count": cluster_doc.get("occurrence_count", 1),
            "crossed_threshold": crossed_threshold,
        }

    except Exception as exc:
        logger.exception("check_and_record_repetition failed (non-blocking): %s", exc)
        return {"post_id": post_id, "error": str(exc)}
