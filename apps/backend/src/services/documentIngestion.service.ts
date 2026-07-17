/**
 * documentIngestion.service — single entry-point for indexing an
 * admin-uploaded DocumentAsset.
 *
 * Two phases, each independently skip-tolerant:
 *
 *   1. Metadata extraction (LLM-backed). ALWAYS attempted when the
 *      LLM provider is available. The metadata is what powers
 *      keyword-boosted retrieval in documentTextSource when no
 *      embedding model is configured — see Phase 9 of the
 *      retrieval source's tagBoost logic.
 *
 *   2. Embedding (only when EMBEDDING_MODEL is set). Silently
 *      skipped otherwise; the row's `embeddingSkippedReason` field
 *      records why so operators can see the state in admin UIs.
 *
 * Idempotent: re-running on a doc that already has both just
 * overwrites with fresh data. Used for:
 *   - Automatic indexing after admin upload (fire-and-forget in
 *     adminDocuments.controller.addDocument).
 *   - One-shot reindex via POST /admin/documents/reindex?target=all.
 *   - Single-doc reindex via POST /admin/documents/reindex?target=<id>.
 */
import DocumentAsset from '../models/DocumentAsset.js';
import { generateEmbedding, EMBEDDING_DIM } from '../utils/ai/embeddings.js';
import {
  extractMetadataFromText,
  type DocumentMetadata,
} from './documentMetadata.service.js';
import { adminLog } from '../utils/http/logger.js';
// v1.84 — push per-doc results to the in-memory diagnostics ring so
// the /admin/document-index page can show "what just happened". The
// module is imported dynamically inside the helpers below to avoid
// a circular import (adminDocuments.controller re-exports
// logReindexEvent).
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports
type LogReindexEventFn = (entry: {
  ts: number;
  documentId: string;
  documentTitle: string;
  ok: boolean;
  embedded: boolean;
  durationMs: number;
  reason?: string;
}) => void;
let _logReindexEvent: LogReindexEventFn | null = null;
async function getLogReindexEvent(): Promise<LogReindexEventFn> {
  if (_logReindexEvent) return _logReindexEvent;
  // Dynamic import — the controller module pulls in express + the
  // whole admin doc surface, which we don't need to load just to
  // log a single reindex result from a service call.
  const mod = await import('../modules/admin/adminDocuments.controller.js');
  _logReindexEvent = (mod as { logReindexEvent?: LogReindexEventFn }).logReindexEvent ?? (() => {});
  return _logReindexEvent;
}

export interface IngestionResult {
  documentId: string;
  metadata: DocumentMetadata;
  embedded: boolean;
  embeddingSkippedReason: string | null;
  durationMs: number;
}

export interface IngestionSummary {
  scanned: number;
  processed: number;
  failed: number;
  embeddedCount: number;
  metadataOnlyCount: number;
  totalDurationMs: number;
}

/**
 * Index a single document by id. Reads the row, runs both phases,
 * persists the result. Errors are logged and returned in the
 * `embeddingSkippedReason` / thrown — callers decide whether to
 * surface to admins.
 */
export async function ingestDocument(
  documentId: string,
  text: string,
  title: string,
): Promise<IngestionResult> {
  const t0 = Date.now();
  const update: Record<string, unknown> = {};

  // ── Phase 1: metadata extraction (always runs when LLM works) ────────
  let metadata: DocumentMetadata = { category: 'General', audience: 'All', tags: [], summary: '' };
  try {
    metadata = await extractMetadataFromText(text, title);
    update['metadata'] = metadata;
    update['metadataExtractedAt'] = new Date();
  } catch (err) {
    adminLog.warn(`[ingest] metadata extract failed for ${documentId}: ${(err as Error).message}`);
  }

  // ── Phase 2: embedding (gated on EMBEDDING_MODEL) ─────────────────────
  let embedded = false;
  let embeddingSkippedReason: string | null = null;
  const embeddingModel = (process.env.EMBEDDING_MODEL ?? '').trim();
  if (!embeddingModel) {
    embeddingSkippedReason =
      'EMBEDDING_MODEL not set — using metadata + $text search only';
  } else {
    try {
      // Truncate the embedded body to ~8K chars. mxbai-embed-large
      // accepts up to 512 tokens; longer is just truncated by the
      // tokenizer and we save on API cost. The title is prepended
      // so it's weighted higher in the resulting vector.
      const embedding = await generateEmbedding(
        `${title}\n\n${text.slice(0, 8000)}`,
      );
      update['embedding'] = embedding;
      update['embeddingDim'] = EMBEDDING_DIM;
      update['embeddedAt'] = new Date();
      embedded = true;
    } catch (err) {
      embeddingSkippedReason = `embedding call failed: ${(err as Error).message}`;
      adminLog.warn(
        `[ingest] embedding failed for ${documentId}: ${(err as Error).message}`,
      );
    }
  }
  update['embeddingSkippedReason'] = embeddingSkippedReason;

  await DocumentAsset.updateOne({ _id: documentId }, { $set: update });
  const durationMs = Date.now() - t0;
  // v1.84 — diagnostics ring buffer. Best-effort; the helper
  // resolves to a no-op if the controller module isn't loadable
  // (e.g. in tests that mock the import).
  try {
    const log = await getLogReindexEvent();
    log({
      ts: Date.now(),
      documentId,
      documentTitle: title,
      ok: true,
      embedded,
      durationMs,
      reason: embeddingSkippedReason ?? undefined,
    });
  } catch {
    /* diagnostics logging is best-effort */
  }
  return {
    documentId,
    metadata,
    embedded,
    embeddingSkippedReason,
    durationMs,
  };
}

/**
 * Re-run ingestion on every document. Used by the
 * `POST /admin/documents/reindex?target=all` admin trigger and by
 * the once-in-a-while "the world moved on" manual sweep.
 *
 * Per-doc errors are swallowed and counted, so one bad row doesn't
 * stop the whole batch.
 */
export async function ingestAllPending(): Promise<IngestionSummary> {
  const t0 = Date.now();
  const docs = await DocumentAsset.find({})
    .select('_id text title')
    .lean();
  let processed = 0;
  let failed = 0;
  let embeddedCount = 0;
  let metadataOnlyCount = 0;
  for (const d of docs) {
    try {
      const result = await ingestDocument(String(d._id), d.text ?? '', d.title ?? '');
      processed++;
      if (result.embedded) embeddedCount++;
      else metadataOnlyCount++;
    } catch (err) {
      failed++;
      adminLog.warn(
        `[ingest] reindex failed for ${String(d._id)}: ${(err as Error).message}`,
      );
    }
  }
  return {
    scanned: docs.length,
    processed,
    failed,
    embeddedCount,
    metadataOnlyCount,
    totalDurationMs: Date.now() - t0,
  };
}
