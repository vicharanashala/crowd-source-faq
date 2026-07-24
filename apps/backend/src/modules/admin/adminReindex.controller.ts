/**
 * adminReindex.controller — admin trigger to re-run indexing on
 * DocumentAsset rows. Idempotent — running it twice produces the
 * same result.
 *
 * POST /admin/documents/reindex
 *   Query:
 *     - target=all          : re-run on every doc (default)
 *     - target=<documentId> : re-run on a single doc
 *
 * Use cases
 * ---------
 *  - After changing EMBEDDING_MODEL: every doc has a stale vector
 *    → reindex swaps in fresh embeddings.
 *  - After running createVectorIndex --drop: same reason.
 *  - After a metadata-prompt update: re-run to refresh tags/summary
 *    with the new prompt.
 *  - One-shot catch-up: if the auto-indexer was off for a while
 *    (no LLM provider configured at upload time), this fills in
 *    the gaps.
 *
 * The endpoint returns the per-run summary immediately. For large
 * libraries, the reindex may take a few minutes; consider running
 * it from a cron or scheduled job rather than blocking an admin UI.
 */
import { Request, Response } from 'express';
import { Types } from 'mongoose';
import DocumentAsset from '../../models/DocumentAsset.js';
import {
  ingestAllPending,
  ingestDocument,
} from '../../services/documentIngestion.service.js';
import { adminLog } from '../../utils/http/logger.js';
// Re-export the in-memory diagnostics ring + GET handler from the
// documents controller. Keeps the storage in one place (next to
// the other admin document endpoints) while exposing the reindex
// surface through this single import.
export {
  logReindexEvent,
  getReindexDiagnostics,
} from './adminDocuments.controller.js';

function isValidObjectId(s: string): boolean {
  return Types.ObjectId.isValid(s);
}

export const reindexDocuments = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const target = String(req.query.target ?? 'all');
  adminLog.info(`[admin] reindex triggered: target=${target}`);

  try {
    if (target === 'all') {
      const summary = await ingestAllPending();
      res.json({ ok: true, target, ...summary });
      return;
    }

    // Single-doc reindex. The path goes through ingestDocument so
    // both metadata and (when configured) embedding are refreshed.
    if (!isValidObjectId(target)) {
      res.status(400).json({ message: 'target must be "all" or a valid document id' });
      return;
    }
    const doc = await DocumentAsset.findById(target).select('text title').lean();
    if (!doc) {
      res.status(404).json({ message: 'document not found' });
      return;
    }
    const result = await ingestDocument(target, doc.text ?? '', doc.title ?? '');
    res.json({ ok: true, target, ...result });
  } catch (err) {
    adminLog.error(`[admin] reindex failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'reindex failed', error: (err as Error).message });
  }
};
