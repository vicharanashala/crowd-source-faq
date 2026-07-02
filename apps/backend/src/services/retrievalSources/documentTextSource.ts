/**
 * documentTextSource — Phase 6.
 *
 * 7th `RetrievalSource` for admin-uploaded documents (`DocumentAsset`
 * collection). Returns hits ranked by Mongo `$text` score, with
 * per-document confidence decaying from 0.85 → 0.5 once the document
 * is older than 30 days.
 *
 * Confidence rationale
 * --------------------
 *  - 0.85 (fresh) — documents are CURATED (admin-uploaded) but the
 *    source weight matches web pages (0.9 → 0.85) and community
 *    (0.85) so this sits in the "trusted-ish" tier.
 *  - 0.5 (stale, > 30d) — documents age slower than web pages (7d)
 *    because the content is uploaded once and doesn't churn, but
 *    admins can re-upload to refresh.
 *  - The source WEIGHT (0.85) sits between web (0.9) and community
 *    (0.85) — admin-curated but not authoritative like ProgramKnowledge.
 *
 * Filtering
 * ---------
 *  - Always excludes rows where `lastFetchError` is set (broken
 *    extractions shouldn't be returned to users).
 *  - `batchId` filter is honored when provided — documents without
 *    a batchId (global) won't match when the caller scopes to a
 *    specific program.
 */

import DocumentAsset from '../../models/DocumentAsset.js';
import { cronLog } from '../../utils/http/logger.js';
import type { RetrievalSource } from '../contextRetriever.js';

const STALE_DAYS = 30; // documents age slower than web pages

export const documentTextSource: RetrievalSource = {
  name: 'document',
  weight: 0.85, // between web (0.9) and community (0.85) — curated admin uploads

  async search(query, batchId, opts) {
    const topK = opts.topK ?? 3;
    try {
      const filter: Record<string, unknown> = { lastFetchError: null };
      if (batchId) filter.batchId = batchId;
      const docs = await DocumentAsset.find(
        { ...filter, $text: { $search: query } },
        { score: { $meta: 'textScore' } },
      )
        .sort({ score: { $meta: 'textScore' } })
        .limit(topK)
        .lean();

      const now = Date.now();
      const staleCutoffMs = STALE_DAYS * 24 * 60 * 60 * 1000;
      return docs.map((d) => {
        const uploadedAt: Date | null = (d as { uploadedAt?: Date }).uploadedAt ?? null;
        const ageMs = uploadedAt ? now - uploadedAt.getTime() : staleCutoffMs;
        const confidence = ageMs < staleCutoffMs ? 0.85 : 0.5;
        return {
          source: 'document' as const,
          sourceId: String((d as { _id: unknown })._id),
          question: (d as { title?: string }).title ?? '',
          answer: (d as { text?: string }).text ?? '',
          score: Number((d as { score?: number }).score ?? 0),
          confidence,
          matchedOn: 'DocumentAsset.title+text',
          batchId: (d as { batchId?: { toString(): string } }).batchId?.toString() ?? null,
          meta: {
            filename: (d as { filename?: string }).filename,
            mimeType: (d as { mimeType?: string }).mimeType,
            pageCount: (d as { pageCount?: number }).pageCount,
            sizeBytes: (d as { sizeBytes?: number }).sizeBytes,
            uploadedAt,
            ageDays: ageMs / (24 * 60 * 60 * 1000),
          },
        };
      });
    } catch (err) {
      cronLog.warn(`[documentTextSource] search failed: ${(err as Error).message}`);
      return [];
    }
  },
};