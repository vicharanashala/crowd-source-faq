from __future__ import annotations

import logging
import uuid
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings, setup_logging
from database.mongo_client import MongoClient

from graph.workflow import build_workflow
from ingestion.chunker import chunk_text
from ingestion.csv_loader import load_faqs_from_csv
from ingestion.pdf_loader import extract_text_from_pdf
from models.schemas import (
    ChatRequest,
    ChatResponse,
    SourceAttribution,
    UnansweredQuestionOut,
    UnansweredQuestionsResponse,
    UploadFAQResponse,
    UploadPDFResponse,
)
from services.embedding_service import EmbeddingService
from services.llm_service import LLMService
from vectorstore.chroma_store import ChromaStore
from agents.repetition_agent import check_and_record_repetition

setup_logging()
logger = logging.getLogger(__name__)

# ── Globals initialised during lifespan ─────────────────────────
embedding_service: EmbeddingService | None = None
llm_service: LLMService | None = None
chroma_store: ChromaStore | None = None
mongo_client: MongoClient | None = None
workflow = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Initialise and tear down application resources."""
    global embedding_service, llm_service, chroma_store, mongo_client, workflow

    logger.info("Starting AI Microservice...")

    # Initialise services
    embedding_service = EmbeddingService()
    llm_service = LLMService()
    chroma_store = ChromaStore()

    # MongoDB
    mongo_client = MongoClient()
    await mongo_client.connect()

    # LangGraph workflow
    workflow = build_workflow()

    logger.info("All services initialised successfully")
    yield

    # Shutdown
    if mongo_client:
        await mongo_client.close()
    logger.info("AI Microservice shut down")


app = FastAPI(
    title="AI Microservice",
    description="FAQ & Document Retrieval with LangGraph Orchestration",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS for website integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health Check ────────────────────────────────────────────────

@app.get("/health", tags=["System"])
async def health_check() -> dict:
    """Health check endpoint."""
    return {"status": "healthy", "service": "ai-microservice"}


# ── POST /chat ──────────────────────────────────────────────────

@app.post("/chat", response_model=ChatResponse, tags=["Chat"])
async def chat(request: ChatRequest) -> ChatResponse:
    """Process a user query through the LangGraph workflow."""
    logger.info("POST /chat — query=%r", request.query[:80])

    if not workflow:
        raise HTTPException(status_code=503, detail="Service not ready")

    try:
        initial_state = {
            "query": request.query,
            "route": "",
            "faq_context": "",
            "faq_sources": [],
            "doc_context": "",
            "doc_sources": [],
            "answer": "",
            "confidence": 0.0,
            "sources": [],
            "is_unanswered": False,
            # Injected dependencies
            "embedding_service": embedding_service,
            "llm_service": llm_service,
            "chroma_store": chroma_store,
            "mongo_client": mongo_client,
        }

        result = workflow.invoke(initial_state)

        sources = [
            SourceAttribution(
                source_type=s.get("source_type", "unknown"),
                content=s.get("content", "")[:500],
                metadata=s.get("metadata", {}),
            )
            for s in result.get("sources", [])
        ]

        return ChatResponse(
            query=request.query,
            answer=result.get("answer", "No answer generated."),
            confidence=result.get("confidence", 0.0),
            route=result.get("route", "BOTH"),
            sources=sources,
            is_unanswered=result.get("is_unanswered", False),
        )

    except Exception as exc:
        logger.exception("Error in /chat")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── POST /upload-faq ────────────────────────────────────────────

@app.post("/upload-faq", response_model=UploadFAQResponse, tags=["Ingestion"])
async def upload_faq(file: UploadFile = File(...)) -> UploadFAQResponse:
    """Upload a CSV file of FAQs and ingest into ChromaDB."""
    logger.info("POST /upload-faq — file=%s", file.filename)

    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv")

    try:
        contents = await file.read()
        faqs = load_faqs_from_csv(contents)

        if not faqs:
            raise HTTPException(status_code=400, detail="No valid FAQ entries found in CSV")

        # Generate embeddings for FAQ questions
        questions = [f"Q: {f['question']} A: {f['answer']}" for f in faqs]
        embeddings = embedding_service.embed_texts(questions)

        # Store in ChromaDB
        count = chroma_store.add_faqs(faqs, embeddings)

        return UploadFAQResponse(
            message=f"Successfully ingested {count} FAQs",
            faq_count=count,
        )

    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Error in /upload-faq")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── POST /upload-pdf ────────────────────────────────────────────

@app.post("/upload-pdf", response_model=UploadPDFResponse, tags=["Ingestion"])
async def upload_pdf(file: UploadFile = File(...)) -> UploadPDFResponse:
    """Upload a PDF, extract text, chunk, embed, and store in ChromaDB."""
    logger.info("POST /upload-pdf — file=%s", file.filename)

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a .pdf")

    try:
        file_bytes = await file.read()
        text = extract_text_from_pdf(file_bytes)
        chunks = chunk_text(text)

        if not chunks:
            raise HTTPException(status_code=400, detail="No text could be extracted from PDF")

        # Generate embeddings
        embeddings = embedding_service.embed_texts(chunks)

        # Store in ChromaDB
        doc_id = f"doc_{uuid.uuid4().hex[:12]}"
        chunk_count = chroma_store.add_documents(
            doc_id=doc_id,
            chunks=chunks,
            embeddings=embeddings,
            filename=file.filename or "unknown.pdf",
        )

        return UploadPDFResponse(
            message=f"Successfully ingested PDF with {chunk_count} chunks",
            document_id=doc_id,
            chunk_count=chunk_count,
        )

    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Error in /upload-pdf")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── GET /unanswered-questions ───────────────────────────────────

@app.get(
    "/unanswered-questions",
    response_model=UnansweredQuestionsResponse,
    tags=["FAQ Suggestions"],
)
async def get_unanswered_questions(
    limit: int = 50,
    skip: int = 0,
) -> UnansweredQuestionsResponse:
    """Retrieve unanswered questions with suggested FAQ entries."""
    logger.info("GET /unanswered-questions (limit=%d, skip=%d)", limit, skip)

    try:
        questions = await mongo_client.get_unanswered_questions(limit=limit, skip=skip)
        total = await mongo_client.count_unanswered_questions()

        items = [
            UnansweredQuestionOut(
                _id=q["_id"],
                question=q["question"],
                suggested_question=q.get("suggested_question"),
                suggested_answer=q.get("suggested_answer"),
                created_at=q["created_at"],
            )
            for q in questions
        ]

        return UnansweredQuestionsResponse(questions=items, total=total)

    except Exception as exc:
        logger.exception("Error in /unanswered-questions")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── POST /check-repetition ──────────────────────────────────────

@app.post("/check-repetition", tags=["FAQ Suggestions"])
async def check_repetition_endpoint(payload: dict) -> dict:
    """Called by the Node backend whenever a new discussion Post is created.

    payload: { "post_id": str, "title": str, "intro": str (optional) }
    """
    post_id = payload.get("post_id")
    title = payload.get("title", "")
    if not post_id or not title:
        raise HTTPException(status_code=400, detail="post_id and title are required")

    combined = f"{title} {payload.get('intro', '')}".strip()

    result = await check_and_record_repetition(
        post_id=post_id,
        title=combined,
        embedding_service=embedding_service,
        chroma_store=chroma_store,
        mongo_client=mongo_client,
        llm_service=llm_service,
    )
    return result


# ── GET /repetition-clusters ────────────────────────────────────

@app.get("/repetition-clusters", tags=["FAQ Suggestions"])
async def get_repetition_clusters() -> dict:
    """Return pending repetition clusters that have hit the threshold."""
    settings = get_settings()
    try:
        clusters = await mongo_client.get_pending_repetition_clusters(
            min_count=settings.repetition_min_count
        )
        return {"clusters": clusters, "total": len(clusters)}
    except Exception as exc:
        logger.exception("Error in /repetition-clusters")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── POST /repetition-clusters/{cluster_id}/promote ──────────────

@app.post("/repetition-clusters/{cluster_id}/promote", tags=["FAQ Suggestions"])
async def promote_repetition_cluster(cluster_id: str) -> dict:
    """Mark a repetition cluster as promoted (admin has turned it into an FAQ)."""
    try:
        await mongo_client.mark_cluster_promoted(cluster_id)
        return {"status": "promoted", "cluster_id": cluster_id}
    except Exception as exc:
        logger.exception("Error promoting cluster %s", cluster_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── POST /repetition-clusters/{cluster_id}/dismiss ──────────────

@app.post("/repetition-clusters/{cluster_id}/dismiss", tags=["FAQ Suggestions"])
async def dismiss_repetition_cluster(cluster_id: str) -> dict:
    """Mark a repetition cluster as dismissed."""
    try:
        await mongo_client.mark_cluster_dismissed(cluster_id)
        return {"status": "dismissed", "cluster_id": cluster_id}
    except Exception as exc:
        logger.exception("Error dismissing cluster %s", cluster_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level=settings.log_level.lower(),
    )
