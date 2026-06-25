from __future__ import annotations

import csv
import io
import logging
from pathlib import Path
from typing import BinaryIO

logger = logging.getLogger(__name__)


def load_faqs_from_csv(
    source: str | Path | bytes | BinaryIO,
    question_col: str = "question",
    answer_col: str = "answer",
) -> list[dict[str, str]]:
    """Load FAQ entries from a CSV file or file-like object.

    The CSV must contain at least two columns whose headers match
    *question_col* and *answer_col* (case-insensitive).

    Args:
        source: File path, raw bytes, or binary file-like object.
        question_col: Name of the question column.
        answer_col: Name of the answer column.

    Returns:
        List of dicts with 'question' and 'answer' keys.

    Raises:
        ValueError: If required columns are missing.
    """
    if isinstance(source, (str, Path)):
        text = Path(source).read_text(encoding="utf-8")
    elif isinstance(source, bytes):
        text = source.decode("utf-8")
    else:
        raw = source.read()
        text = raw.decode("utf-8") if isinstance(raw, bytes) else raw

    reader = csv.DictReader(io.StringIO(text))

    if reader.fieldnames is None:
        raise ValueError("CSV file is empty or has no header row.")

    # Normalise headers to lowercase for matching
    header_map = {h.strip().lower(): h for h in reader.fieldnames}
    q_key = header_map.get(question_col.lower())
    a_key = header_map.get(answer_col.lower())

    if q_key is None or a_key is None:
        raise ValueError(
            f"CSV must contain '{question_col}' and '{answer_col}' columns. "
            f"Found: {list(reader.fieldnames)}"
        )

    faqs: list[dict[str, str]] = []
    for row in reader:
        question = (row.get(q_key) or "").strip()
        answer = (row.get(a_key) or "").strip()
        if question and answer:
            faqs.append({"question": question, "answer": answer})

    logger.info("Loaded %d FAQ entries from CSV", len(faqs))
    return faqs
