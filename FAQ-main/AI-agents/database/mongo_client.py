from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from config import get_settings

logger = logging.getLogger(__name__)


class MongoClient:
    """Async MongoDB client for the AI microservice."""

    _client: AsyncIOMotorClient | None = None
    _db: AsyncIOMotorDatabase | None = None

    async def connect(self) -> None:
        """Open connection to MongoDB Atlas."""
        settings = get_settings()

        connect_kwargs: dict = {}
        try:
            import certifi
            connect_kwargs["tlsCAFile"] = certifi.where()
        except ImportError:
            logger.warning("certifi not installed — TLS CA file not set")

        self._client = AsyncIOMotorClient(
            settings.mongodb_uri,
            **connect_kwargs,
        )
        self._db = self._client[settings.mongodb_db_name]

        # Verify connectivity
        try:
            await self._client.admin.command("ping")
            logger.info(
                "Connected to MongoDB at %s (db=%s)",
                settings.mongodb_uri,
                settings.mongodb_db_name,
            )
        except Exception as exc:
            logger.warning("MongoDB ping failed (service may still work): %s", exc)

    async def close(self) -> None:
        """Close the MongoDB connection."""
        if self._client:
            self._client.close()
            logger.info("MongoDB connection closed")

    @property
    def db(self) -> AsyncIOMotorDatabase:
        """Return the database instance."""
        if self._db is None:
            raise RuntimeError("MongoClient is not connected. Call connect() first.")
        return self._db

    # Unanswered Questions 

    async def save_unanswered_question(
        self,
        question: str,
        suggested_faq: dict[str, str] | None = None,
    ) -> str:
        """Save an unanswered question to MongoDB.

        Args:
            question: The original user question.
            suggested_faq: Optional dict with 'suggested_question' and 'suggested_answer'.

        Returns:
            The inserted document ID as a string.
        """
        doc: dict[str, Any] = {
            "question": question,
            "suggested_question": (suggested_faq or {}).get("suggested_question"),
            "suggested_answer": (suggested_faq or {}).get("suggested_answer"),
            "created_at": datetime.now(timezone.utc),
        }
        result = await self.db.unanswered_questions.insert_one(doc)
        doc_id = str(result.inserted_id)
        logger.info("Saved unanswered question (id=%s)", doc_id)
        return doc_id

    async def get_unanswered_questions(
        self,
        limit: int = 50,
        skip: int = 0,
    ) -> list[dict[str, Any]]:
        """Retrieve unanswered questions from MongoDB.

        Args:
            limit: Maximum number of results.
            skip: Number of results to skip.

        Returns:
            List of unanswered question documents.
        """
        cursor = (
            self.db.unanswered_questions
            .find()
            .sort("created_at", -1)
            .skip(skip)
            .limit(limit)
        )
        questions: list[dict[str, Any]] = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            questions.append(doc)

        logger.debug("Retrieved %d unanswered questions", len(questions))
        return questions

    async def count_unanswered_questions(self) -> int:
        """Count total unanswered questions."""
        return await self.db.unanswered_questions.count_documents({})

    # ── Repetition Clusters (Feature 2) ────────────────────────

    async def upsert_cluster_hit(
        self,
        post_id: str,
        post_title: str,
        representative_question: str,
    ) -> dict:
        """Find an existing cluster whose representative question is similar enough,
        or create a new one. Appends post_id / post_title and increments count.

        Matching is done by exact representative_question string (the first post
        title in the cluster) — the caller (repetition_agent) has already done
        the vector-similarity check and passes the cluster's representative title.

        Returns the updated cluster document.
        """
        from pymongo import ReturnDocument
        now = datetime.now(timezone.utc)

        result = await self.db.repetition_clusters.find_one_and_update(
            {"representative_question": representative_question, "status": "pending"},
            {
                "$addToSet": {
                    "post_ids": post_id,
                    "post_titles": post_title,
                },
                "$inc": {"occurrence_count": 1},
                "$set": {"updated_at": now},
                "$setOnInsert": {
                    "representative_question": representative_question,
                    "status": "pending",
                    "suggested_question": None,
                    "suggested_answer": None,
                    "created_at": now,
                },
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        if result is None:
            # Fallback: fetch the just-upserted doc
            result = await self.db.repetition_clusters.find_one(
                {"representative_question": representative_question, "status": "pending"}
            )

        if result:
            result["_id"] = str(result["_id"])
        return result or {}

    async def create_new_cluster(self, post_id: str, post_title: str) -> dict:
        """Create a brand-new cluster seeded by a single post."""
        now = datetime.now(timezone.utc)
        doc = {
            "representative_question": post_title,
            "post_ids": [post_id],
            "post_titles": [post_title],
            "occurrence_count": 1,
            "status": "pending",
            "suggested_question": None,
            "suggested_answer": None,
            "created_at": now,
            "updated_at": now,
        }
        result = await self.db.repetition_clusters.insert_one(doc)
        doc["_id"] = str(result.inserted_id)
        return doc

    async def set_cluster_suggestion(
        self,
        cluster_id: str,
        suggested_question: str,
        suggested_answer: str,
    ) -> None:
        """Save the AI-drafted FAQ suggestion onto a cluster."""
        from bson import ObjectId  # local import to avoid top-level dep
        await self.db.repetition_clusters.update_one(
            {"_id": ObjectId(cluster_id)},
            {"$set": {
                "suggested_question": suggested_question,
                "suggested_answer": suggested_answer,
                "updated_at": datetime.now(timezone.utc),
            }},
        )

    async def get_pending_repetition_clusters(self, min_count: int = 3) -> list[dict]:
        """Return clusters that have hit the repetition threshold and are pending review."""
        cursor = (
            self.db.repetition_clusters
            .find({"status": "pending", "occurrence_count": {"$gte": min_count}})
            .sort("occurrence_count", -1)
        )
        clusters: list[dict] = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            clusters.append(doc)
        return clusters

    async def mark_cluster_promoted(self, cluster_id: str) -> None:
        """Mark a repetition cluster as promoted (converted to FAQ)."""
        from bson import ObjectId
        await self.db.repetition_clusters.update_one(
            {"_id": ObjectId(cluster_id)},
            {"$set": {"status": "promoted", "updated_at": datetime.now(timezone.utc)}},
        )

    async def mark_cluster_dismissed(self, cluster_id: str) -> None:
        """Mark a repetition cluster as dismissed."""
        from bson import ObjectId
        await self.db.repetition_clusters.update_one(
            {"_id": ObjectId(cluster_id)},
            {"$set": {"status": "dismissed", "updated_at": datetime.now(timezone.utc)}},
        )
