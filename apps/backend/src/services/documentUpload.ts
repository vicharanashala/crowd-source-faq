/**
 * documentUpload — Phase 6.
 *
 * File-processing helper for admin-uploaded documents. Extracts text
 * from PDF (via pdf-parse v2 class API) or reads raw text for
 * .txt/.md/.csv. Truncates to 500_000 chars so a single doc can't
 * dominate the text index.
 *
 * Storage convention: caller puts the file at a path it controls
 * (multer disk storage writes to apps/backend/uploads/documents/);
 * this helper just reads + extracts. It does not move or delete.
 */
import { promises as fs } from 'fs';
import path from 'path';
// pdf-parse v2: class-based API. v1 (`import pdfParse from 'pdf-parse'`)
// returns `{text, numpages}` from a default export; v2 exports
// `PDFParse` class. We use v2 because that's what's installed.
import { PDFParse } from 'pdf-parse';

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_TEXT_CHARS = 500_000;

export interface ProcessedDocument {
  title: string;
  text: string;
  pageCount: number;
}

export async function processDocumentFile(
  filePath: string,
  mimeType: string,
): Promise<ProcessedDocument> {
  const stat = await fs.stat(filePath);
  if (stat.size > MAX_BYTES) {
    throw new Error(`file exceeds ${MAX_BYTES} bytes`);
  }
  const filename = path.basename(filePath);
  // Strip extension for the title
  const title = filename.replace(/\.[^.]+$/, '');

  let text = '';
  let pageCount = 0;

  if (mimeType === 'application/pdf') {
    const buffer = await fs.readFile(filePath);
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      // v2 returns { text, total, pages, ... }; total/pages both work
      text = result.text ?? '';
      pageCount = result.total ?? result.pages ?? 0;
    } finally {
      // v2 PDFParse may expose destroy() — call if present
      const destroy = (parser as unknown as { destroy?: () => Promise<void> })
        .destroy;
      if (typeof destroy === 'function') {
        try { await destroy.call(parser); } catch { /* ignore */ }
      }
    }
  } else {
    // text/plain, text/markdown, text/csv — read as UTF-8
    text = await fs.readFile(filePath, 'utf8');
  }

  // Truncate so a single doc can't dominate the text index
  text = text.slice(0, MAX_TEXT_CHARS);
  return { title, text, pageCount };
}
