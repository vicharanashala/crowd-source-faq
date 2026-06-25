from __future__ import annotations

import logging

import pymupdf  # PyMuPDF

logger = logging.getLogger(__name__)


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract all text content from a PDF file.

    Args:
        file_bytes: Raw bytes of the PDF file.

    Returns:
        Concatenated text from all pages.

    Raises:
        ValueError: If the PDF contains no extractable text.
    """
    try:
        doc = pymupdf.open(stream=file_bytes, filetype="pdf")
        pages: list[str] = []

        for page_num, page in enumerate(doc, start=1):
            text = page.get_text("text")
            if text.strip():
                pages.append(text.strip())
            logger.debug("Page %d: extracted %d chars", page_num, len(text))

        doc.close()

        full_text = "\n\n".join(pages)
        if not full_text.strip():
            raise ValueError("PDF contains no extractable text.")

        logger.info(
            "Extracted %d characters from %d pages",
            len(full_text),
            len(pages),
        )
        return full_text

    except ValueError:
        raise
    except Exception:
        logger.exception("Failed to extract text from PDF")
        raise
