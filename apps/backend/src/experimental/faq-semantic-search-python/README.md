# Experimental FAQ Semantic Search Backend Prototype

This directory contains an isolated Python backend prototype for FAQ semantic search and ranking.

## Purpose

The prototype explores backend intelligence features for the FAQ system, including:

- Semantic FAQ matching
- Embedding-based retrieval
- FAQ ranking logic
- Scraping/indexing support
- LLM grounding helpers
- Matching tests

## Scope

This is intentionally placed under `apps/backend/src/experimental/` so it does not affect the existing TypeScript backend runtime, routes, database schema, or production APIs.

## Included Files

- `main.py` – prototype backend entry point
- `database.py` – vector/database connection logic
- `embeddings.py` – embedding generation helpers
- `ranking.py` – FAQ relevance ranking logic
- `scraper.py` – FAQ ingestion/scraping helper
- `llm_grounding.py` – grounding utilities for LLM responses
- `requirements.txt` – Python dependencies
- `test_matching.py` – semantic matching test coverage

## Notes

- No existing production backend files are modified.
- No frontend files are modified.
- No environment files, cache files, or generated files are included.
- This prototype can be reviewed independently and later adapted into the main TypeScript backend if approved.
