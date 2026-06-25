from __future__ import annotations

import logging

from config import get_settings

logger = logging.getLogger(__name__)


def chunk_text(
    text: str,
    chunk_size: int | None = None,
    chunk_overlap: int | None = None,
) -> list[str]:
    """Split text into overlapping chunks using recursive character splitting.

    The function splits on paragraph boundaries first, then sentence
    boundaries, then word boundaries, falling back to character-level
    splits only when necessary.

    Args:
        text: The input text to chunk.
        chunk_size: Maximum characters per chunk (default from settings).
        chunk_overlap: Overlap between consecutive chunks (default from settings).

    Returns:
        List of text chunks.
    """
    settings = get_settings()
    chunk_size = chunk_size or settings.chunk_size
    chunk_overlap = chunk_overlap or settings.chunk_overlap

    if not text.strip():
        return []

    separators = ["\n\n", "\n", ". ", " ", ""]
    chunks = _recursive_split(text, separators, chunk_size)

    # Apply overlap
    if chunk_overlap > 0 and len(chunks) > 1:
        overlapped: list[str] = []
        for i, chunk in enumerate(chunks):
            if i == 0:
                overlapped.append(chunk)
            else:
                # Prepend the tail of the previous chunk
                prev_tail = chunks[i - 1][-chunk_overlap:]
                overlapped.append(prev_tail + chunk)
        chunks = overlapped

    logger.info(
        "Chunked text into %d chunks (size=%d, overlap=%d)",
        len(chunks),
        chunk_size,
        chunk_overlap,
    )
    return chunks


def _recursive_split(
    text: str,
    separators: list[str],
    chunk_size: int,
) -> list[str]:
    """Recursively split text by a hierarchy of separators."""
    if len(text) <= chunk_size:
        return [text]

    if not separators:
        # Last resort: hard character split
        return [
            text[i : i + chunk_size]
            for i in range(0, len(text), chunk_size)
        ]

    sep = separators[0]
    remaining_seps = separators[1:]

    if sep == "":
        return [
            text[i : i + chunk_size]
            for i in range(0, len(text), chunk_size)
        ]

    parts = text.split(sep)
    chunks: list[str] = []
    current = ""

    for part in parts:
        candidate = f"{current}{sep}{part}" if current else part
        if len(candidate) <= chunk_size:
            current = candidate
        else:
            if current:
                chunks.append(current)
            # If this single part exceeds chunk_size, split it further
            if len(part) > chunk_size:
                sub_chunks = _recursive_split(part, remaining_seps, chunk_size)
                chunks.extend(sub_chunks)
                current = ""
            else:
                current = part

    if current:
        chunks.append(current)

    return chunks
