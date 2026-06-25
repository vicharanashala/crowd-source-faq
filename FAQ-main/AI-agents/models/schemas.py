from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ── Request Models

class ChatRequest(BaseModel):
    """Incoming chat query."""
    query: str = Field(..., min_length=1, max_length=2000, description="User question")


# ── Response Models

class SourceAttribution(BaseModel):
    """A single source used to generate the answer."""
    source_type: str = Field(..., description="'faq' or 'document'")
    content: str = Field(..., description="Source text snippet")
    metadata: dict[str, Any] = Field(default_factory=dict)


class ChatResponse(BaseModel):
    """Response returned by the /chat endpoint."""
    query: str
    answer: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    route: str = Field(..., description="FAQ, DOCUMENT, or BOTH")
    sources: list[SourceAttribution] = Field(default_factory=list)
    is_unanswered: bool = False  #bekar cheej h 


class UploadFAQResponse(BaseModel):
    """Response after FAQ CSV ingestion."""
    message: str
    faq_count: int


class UploadPDFResponse(BaseModel):
    """Response after PDF ingestion."""
    message: str
    document_id: str
    chunk_count: int


class UnansweredQuestionOut(BaseModel):
    """An unanswered question stored in MongoDB."""
    id: str = Field(..., alias="_id")
    question: str
    suggested_question: str | None = None
    suggested_answer: str | None = None
    created_at: datetime

    model_config = {"populate_by_name": True}


class UnansweredQuestionsResponse(BaseModel):
    """Response for GET /unanswered-questions."""
    questions: list[UnansweredQuestionOut]
    total: int
