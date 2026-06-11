/**
 * documentExtractor — unified text extraction for uploaded knowledge
 * documents.
 *
 * - Images  (image/png, image/jpeg)             → tesseract.js OCR
 * - PDF / DOCX / XLSX / HTML / TXT               → markitdown-ts
 *
 * The two paths return a single `ExtractionResult` so the calling
 * pipeline doesn't care which engine ran. Tesseract's worker is
 * initialised lazily on first image use and reused across calls —
 * loading the language data + worker takes ~2s and we don't want to
 * pay that on every upload.
 *
 * Called from the BullMQ worker (`utils/jobs/documentJob.ts`), not
 * from the request handler — this is heavy and would otherwise
 * block the Node.js event loop.
 */

import { createWorker, type Worker } from 'tesseract.js';
import { MarkItDown } from 'markitdown-ts';
import { logger } from './http/logger.js';

export type DocumentFileType = 'image' | 'pdf' | 'docx' | 'xlsx';

export interface ExtractionResult {
  text: string;
  /** Page number / cell reference (best-effort; null if unknown). */
  pageNumber: number | null;
  /** Engine used, for the audit log. */
  engine: 'tesseract' | 'markitdown';
  /** Wall-clock duration in ms. */
  durationMs: number;
}

// ─── Lazy tesseract worker singleton ─────────────────────────────────────────

let _tesseractWorker: Promise<Worker> | null = null;

async function getTesseractWorker(): Promise<Worker> {
  if (!_tesseractWorker) {
    _tesseractWorker = (async () => {
      // English by default. Multi-language packs are an env-var future
      // addition (TESSERACT_LANGS=eng+hin+...) — keeping the surface
      // small for v1.
      const worker = await createWorker('eng');
      logger.info('[documentExtractor] tesseract worker ready');
      return worker;
    })();
  }
  return _tesseractWorker;
}

/**
 * Call once at server shutdown so the worker thread exits cleanly.
 * Wired from server.ts's SIGTERM handler.
 */
export async function shutdownTesseract(): Promise<void> {
  if (_tesseractWorker) {
    const w = await _tesseractWorker;
    await w.terminate();
    _tesseractWorker = null;
    logger.info('[documentExtractor] tesseract worker terminated');
  }
}

// ─── MarkItDown singleton ────────────────────────────────────────────────────

const _markitdown = new MarkItDown();

// ─── Public entry point ──────────────────────────────────────────────────────

/**
 * Extract text from a binary upload.
 *
 * @param buffer     the raw file bytes
 * @param fileType   one of 'image' | 'pdf' | 'docx' | 'xlsx'
 * @param mimeType   the original Content-Type (used for engine dispatch)
 */
export async function extractTextFromFile(
  buffer: Buffer,
  fileType: DocumentFileType,
  mimeType: string,
): Promise<ExtractionResult> {
  const start = Date.now();
  if (fileType === 'image') {
    const worker = await getTesseractWorker();
    const { data } = await worker.recognize(buffer);
    return {
      text: (data.text ?? '').trim(),
      pageNumber: null, // images are single-page
      engine: 'tesseract',
      durationMs: Date.now() - start,
    };
  }

  // PDF / DOCX / XLSX → markitdown-ts
  // markitdown-ts needs a `file_extension` hint to dispatch to the
  // right converter when given a buffer. IMPORTANT: it must be the
  // extension WITH the dot (e.g. ".pdf"), not just "pdf" — the
  // PdfConverter's `if (![".pdf"].includes(ext))` check rejects the
  // bare form and falls through to the text converter, which chokes
  // on the `%PDF-1.3` binary header.
  const ext = `.${fileType}`;
  const result = await _markitdown.convertBuffer(buffer, {
    file_extension: ext,
  });
  return {
    text: (result?.markdown ?? result?.text_content ?? '').trim(),
    pageNumber: null,
    engine: 'markitdown',
    durationMs: Date.now() - start,
  };
}

/**
 * Map a Content-Type header to a DocumentFileType. Used by the
 * upload controller to set `DocumentRecord.fileType` before the
 * worker picks the right engine.
 */
export function mimeToFileType(mimeType: string): DocumentFileType | null {
  const m = mimeType.toLowerCase();
  if (m === 'image/png' || m === 'image/jpeg' || m === 'image/jpg' || m === 'image/webp') {
    return 'image';
  }
  if (m === 'application/pdf') return 'pdf';
  if (
    m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    m === 'application/msword'
  ) {
    return 'docx';
  }
  if (
    m === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    m === 'application/vnd.ms-excel'
  ) {
    return 'xlsx';
  }
  return null;
}
