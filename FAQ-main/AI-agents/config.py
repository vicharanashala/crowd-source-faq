from __future__ import annotations

import logging
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # --- API Keys ---
    groq_api_key: str = ""

    # --- MongoDB Atlas ---
    mongodb_uri: str = "mongodb+srv://localhost:27017"
    mongodb_db_name: str = "ai_microservice"

    # --- ChromaDB Cloud ---
    chroma_api_key: str = ""
    chroma_tenant: str = ""
    chroma_database: str = ""
    chroma_faq_collection: str = "faq_collection"
    chroma_doc_collection: str = "document_collection"
    chroma_discussion_collection: str = "discussion_questions_collection"

    # --- Chunking ---
    chunk_size: int = 1000
    chunk_overlap: int = 200

    # --- Retrieval ---
    top_k_results: int = 5
    confidence_threshold: float = 0.6

    # --- Repetition Detection (Feature 2) ---
    repetition_similarity_threshold: float = 0.85  # cosine similarity to count as "same question"
    repetition_min_count: int = 3  # how many similar posts before suggesting a new FAQ

    # --- Models ---
    groq_model: str = "llama-3.3-70b-versatile"

    #  Logging 
    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings."""
    return Settings()


def setup_logging() -> None:
    """Configure application-wide logging."""
    settings = get_settings()
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
