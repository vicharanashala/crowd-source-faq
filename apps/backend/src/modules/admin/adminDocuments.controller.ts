/**
 * adminDocuments.controller — Phase 6.
 *
 * Admin endpoints for the DocumentAsset collection. Accepts PDF / TXT /
 * MD / CSV uploads via multipart/form-data, extracts text, stores the
 * extracted text + file metadata. Files live on local disk at
 * apps/backend/uploads/documents/ — that's the on-disk path, not in
 * MongoDB.
 *
 * Mounted at /admin/documents via admin-documents.routes.ts. Admin /
 * ai_moderator / moderator only.
 */
import { Request, Response } from 'express';
import { Types } from 'mongoose';
import path from 'path';
import { promises as fs } from 'fs';
import DocumentAsset from '../../models/DocumentAsset.js';
import { processDocumentFile } from '../../services/documentUpload.js';
import { adminLog } from '../../utils/http/logger.js';

const ALLOWED_MIME = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
]);

const UPLOAD_DIR = path.resolve(process.cwd(), 'apps/backend/uploads/documents');

async function ensureUploadDir(): Promise<void> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

export const addDocument = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    await ensureUploadDir();
  } catch (err) {
    adminLog.warn(`[documents] mkdir failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'storage init failed' });
    return;
  }
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) {
    res.status(400).json({ message: 'file required (multipart/form-data)' });
    return;
  }
  if (!ALLOWED_MIME.has(file.mimetype)) {
    res.status(400).json({ message: `unsupported mime-type: ${file.mimetype}` });
    return;
  }
  let processed;
  try {
    processed = await processDocumentFile(file.path, file.mimetype);
  } catch (err) {
    adminLog.warn(`[documents] processing failed: ${(err as Error).message}`);
    res.status(422).json({ message: 'processing failed', error: (err as Error).message });
    return;
  }
  const reviewerId = (() => {
    const id = (req as Request & { user?: { _id?: string | Types.ObjectId } }).user?._id;
    if (!id) return null;
    try {
      return new Types.ObjectId(String(id));
    } catch {
      return null;
    }
  })();

  const row = await DocumentAsset.create({
    title: processed.title,
    filename: file.originalname,
    storagePath: file.path,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    text: processed.text,
    pageCount: processed.pageCount,
    uploadedBy: reviewerId,
  });
  adminLog.info(
    `[documents] uploaded ${file.originalname} (${file.size} bytes, ${processed.text.length} chars text, ${processed.pageCount} pages)`,
  );

  // Fire-and-forget indexing — extract metadata via LLM and (when
  // EMBEDDING_MODEL is set) generate the vector embedding. We do NOT
  // block the response on this: the doc is already retrievable via
  // $text search, the indexing just makes it smarter over the next
  // few seconds. Errors are logged, never thrown, so a transient
  // LLM outage can't break uploads.
  const documentId = String(row._id);
  const documentTitle = row.title;
  const documentText = row.text;
  void runDocumentIngestion(documentId, documentText, documentTitle, file.originalname);

  res.json({ ok: true, document: row });
};

/**
 * Internal — runs the document-ingestion pipeline off the request
 * path. Imported dynamically so the ingestion service (which pulls
 * in embeddings + the LLM client) isn't loaded until an upload
 * actually happens, keeping the cold-start cost of the admin
 * controller module minimal.
 */
async function runDocumentIngestion(
  documentId: string,
  text: string,
  title: string,
  fileName: string,
): Promise<void> {
  try {
    const { ingestDocument } = await import('../../services/documentIngestion.service.js');
    const result = await ingestDocument(documentId, text, title);
    adminLog.info(
      `[documents] indexed ${fileName} (embedded=${result.embedded}, ${result.durationMs}ms)`,
    );
  } catch (err) {
    adminLog.warn(
      `[documents] indexing failed for ${documentId}: ${(err as Error).message}`,
    );
  }
}

// ─── Diagnostics ring buffer ────────────────────────────────────────────────
//
// In-memory ring of the last 50 reindex operations across the process.
// Shown on the /admin/document-index diagnostics page so admins can
// see "what happened the last time I clicked re-index" without
// having to grep server logs. Survives nothing — process restart
// clears it. That's fine; the per-doc fields (embeddedAt,
// embeddingSkippedReason, lastFetchError) are the source of truth
// for "what state is the doc in right now".

export interface ReindexLogEntry {
  ts: number;
  documentId: string;
  documentTitle: string;
  ok: boolean;
  embedded: boolean;
  durationMs: number;
  reason?: string;
}

const REINDEX_LOG_MAX = 50;
const reindexLog: ReindexLogEntry[] = [];

/** Append a reindex result to the in-memory ring. Called by the
 *  ingestion service via the helpers below; never exposed directly. */
export function logReindexEvent(entry: ReindexLogEntry): void {
  reindexLog.push(entry);
  if (reindexLog.length > REINDEX_LOG_MAX) {
    reindexLog.splice(0, reindexLog.length - REINDEX_LOG_MAX);
  }
}

/** GET /admin/documents/diagnostics — returns the most recent N
 *  reindex events, newest-first. */
export const getReindexDiagnostics = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  const items = [...reindexLog].reverse();
  res.json({ items, total: items.length, max: REINDEX_LOG_MAX });
};

export const listDocuments = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, 100));
  try {
    const [items, total] = await Promise.all([
      DocumentAsset.find()
        .sort({ uploadedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      DocumentAsset.countDocuments(),
    ]);
    res.json({
      items,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    adminLog.warn(`[documents] list failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'list failed' });
  }
};

export const deleteDocument = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'invalid id' });
    return;
  }
  const doc = await DocumentAsset.findById(id);
  if (!doc) {
    res.status(404).json({ message: 'not found' });
    return;
  }
  try {
    await fs.unlink(doc.storagePath);
  } catch (err) {
    // File might be already gone — log but don't fail the DB delete
    adminLog.warn(`[documents] unlink failed: ${(err as Error).message}`);
  }
  await DocumentAsset.deleteOne({ _id: id });
  res.json({ ok: true });
};
