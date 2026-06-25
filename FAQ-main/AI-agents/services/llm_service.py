from __future__ import annotations

import json
import logging

from groq import Groq

from config import get_settings

logger = logging.getLogger(__name__)

_ROUTE_SYSTEM_PROMPT = """You are a query routing classifier. Given a user query, classify it into exactly one of three categories:

- FAQ: The query is a common/general question likely covered by a FAQ database (e.g., policies, pricing, general info).
- DOCUMENT: The query requires detailed information likely found in uploaded documents (e.g., technical specs, reports, manuals).
- BOTH: The query could benefit from both FAQ and document context.

Respond with ONLY a JSON object: {"route": "FAQ"} or {"route": "DOCUMENT"} or {"route": "BOTH"}
Do not include any other text."""

_RESPONSE_SYSTEM_PROMPT = """You are a helpful AI assistant. Answer the user's question using ONLY the provided context.
If the context does not contain enough information, say so honestly.

Respond with a JSON object with these fields:
- "answer": Your detailed answer as a string.
- "confidence": A float between 0.0 and 1.0 indicating how confident you are that the context supports your answer.

Do not include any other text outside the JSON object."""

_FAQ_SUGGESTION_SYSTEM_PROMPT = """You are an FAQ content creator. Given a question that could not be answered well, generate a suggested FAQ entry.

Respond with a JSON object:
- "suggested_question": A well-phrased version of the question suitable for an FAQ.
- "suggested_answer": A helpful, concise answer you would recommend adding to the FAQ.

Do not include any other text."""


class LLMService:
    """Handles LLM calls via the Groq API."""

    def __init__(self) -> None:
        settings = get_settings()
        self._client = Groq(api_key=settings.groq_api_key)
        self._model = settings.groq_model
        logger.info("LLMService initialized with model=%s", self._model)

    def classify_route(self, query: str) -> str:
        """Classify a query into FAQ, DOCUMENT, or BOTH.

        Args:
            query: The user's query.

        Returns:
            One of 'FAQ', 'DOCUMENT', 'BOTH'.
        """
        try:
            response = self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": _ROUTE_SYSTEM_PROMPT},
                    {"role": "user", "content": query},
                ],
                temperature=0.0,
                max_tokens=50,
            )
            raw = response.choices[0].message.content.strip()
            parsed = json.loads(raw)
            route = parsed.get("route", "BOTH").upper()
            if route not in ("FAQ", "DOCUMENT", "BOTH"):
                route = "BOTH"
            logger.info("Query routed to: %s", route)
            return route
        except Exception:
            logger.exception("Route classification failed, defaulting to BOTH")
            return "BOTH"

    def generate_response(self, query: str, context: str) -> dict:
        """Generate an answer given a query and retrieved context.

        Args:
            query: The user's question.
            context: Combined context from retrieval agents.

        Returns:
            Dict with 'answer' and 'confidence' keys.
        """
        user_msg = f"Context:\n{context}\n\nQuestion: {query}"
        try:
            response = self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": _RESPONSE_SYSTEM_PROMPT},
                    {"role": "user", "content": user_msg},
                ],
                temperature=0.2,
                max_tokens=1024,
            )
            raw = response.choices[0].message.content.strip()
            parsed = json.loads(raw)
            answer = parsed.get("answer", "I could not generate an answer.")
            confidence = float(parsed.get("confidence", 0.0))
            confidence = max(0.0, min(1.0, confidence))
            logger.info("Response generated (confidence=%.2f)", confidence)
            return {"answer": answer, "confidence": confidence}
        except Exception:
            logger.exception("Response generation failed")
            return {
                "answer": "An error occurred while generating the response.",
                "confidence": 0.0,
            }

    def generate_faq_suggestion(self, question: str) -> dict:
        """Generate a suggested FAQ entry for an unanswered question.

        Args:
            question: The unanswered question.

        Returns:
            Dict with 'suggested_question' and 'suggested_answer'.
        """
        try:
            response = self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": _FAQ_SUGGESTION_SYSTEM_PROMPT},
                    {"role": "user", "content": question},
                ],
                temperature=0.3,
                max_tokens=512,
            )
            raw = response.choices[0].message.content.strip()
            parsed = json.loads(raw)
            return {
                "suggested_question": parsed.get("suggested_question", question),
                "suggested_answer": parsed.get("suggested_answer", ""),
            }
        except Exception:
            logger.exception("FAQ suggestion generation failed")
            return {"suggested_question": question, "suggested_answer": ""}
