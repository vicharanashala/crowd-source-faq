/**
 * webTextSource — Phase 5, extended in Phase 8.
 *
 * `RetrievalSource` for web pages (`WebPage` collection). Returns
 * hits ranked by Mongo `$text` score, with per-page confidence
 * decaying from 0.85 → 0.5 once the page is older than 7 days.
 *
 * Confidence rationale
 * --------------------
 *  - 0.85 (fresh) sits between community (0.85) and kb (1.1) — web
 *    pages are curated but the content is out of our control, so
 *    we don't give them the same trust as a Q&A we wrote.
 *  - After 7d, confidence drops to 0.5 — admin can re-fetch via
 *    `POST /admin/web-pages` with the same URL to refresh.
 *
 * Filtering
 * ---------
 *  - Always excludes rows where `lastFetchError` is set (broken pages
 *    shouldn't be returned to users).
 *  - Phase 8: only returns rows where `approved === true`. Admin-pasted
 *    URLs are pre-approved by the controller at insertion; auto-
 *    discovered URLs come in unapproved and need an admin to
 *    PATCH /admin/web-pages/:id/approve before they surface here.
 *  - `batchId` is accepted for API compatibility with the rest of the
 *    retrieval sources, but WebPage documents don't carry a batchId so
 *    the filter is a no-op here.
 */

import WebPage from '../../models/WebPage.js';
import { cronLog } from '../../utils/http/logger.js';
import type { RetrievalSource } from '../contextRetriever.js';

const STALE_DAYS = 7;
// Phase 9: the `text` field on WebPage rows can be up to 500,000 chars,
// but the retriever only ever displays the first 4,000 as the `answer`.
// Fetching the full body wastes bandwidth + Node deserialization CPU, so
// we (a) project only the fields the hit shape needs and (b) cap the
// `text` payload at this many chars before assigning to `answer`. The
// original (uncapped) length is preserved in `meta.textLength` so the
// consumer can detect truncation.
const ANSWER_TEXT_MAX_CHARS = 4000;

export const webTextSource: RetrievalSource = {
  name: 'web',
  weight: 0.9, // curated but untrusted — between community (0.85) and kb (1.1)

  async search(query, batchId, opts) {
    const topK = opts.topK ?? 3;
    try {
      const filter: Record<string, unknown> = { lastFetchError: null, approved: true };
      if (batchId) filter.batchId = batchId;
      // Phase 9: explicit projection so we don't pull the full 500K-char
      // `text` body for every match. The `$meta: 'textScore'` projection
      // is independent of the field projection, so it doesn't conflict.
      // (filename/mimeType are no-ops on this collection but are listed
      // for symmetry with the DocumentAsset source — Mongoose silently
      // ignores unknown field names in `.select()` strings.)
      const docs = await WebPage.find(
        { ...filter, $text: { $search: query } },
        { score: { $meta: 'textScore' } },
      )
        .select('title text domain filename mimeType lastFetchError fetchedAt batchId _id')
        .sort({ score: { $meta: 'textScore' } })
        .limit(topK)
        .lean();

      const now = Date.now();
      const staleCutoffMs = STALE_DAYS * 24 * 60 * 60 * 1000;
      return docs.map((d) => {
        const fetchedAt: Date | null = (d as { fetchedAt?: Date }).fetchedAt ?? null;
        const ageMs = fetchedAt ? now - fetchedAt.getTime() : staleCutoffMs;
        const confidence = ageMs < staleCutoffMs ? 0.85 : 0.5; // decay after 7d
        const fullText = (d as { text?: string }).text ?? '';
        const truncated =
          fullText.length > ANSWER_TEXT_MAX_CHARS
            ? fullText.slice(0, ANSWER_TEXT_MAX_CHARS)
            : fullText;
        return {
          source: 'web' as const,
          sourceId: String((d as { _id: unknown })._id),
          question: (d as { title?: string }).title ?? (d as { url?: string }).url ?? '',
          answer: truncated,
          score: Number((d as { score?: number }).score ?? 0),
          confidence,
          matchedOn: 'WebPage.title+text',
          batchId: (d as { batchId?: { toString(): string } }).batchId?.toString() ?? null,
          meta: {
            url: (d as { url?: string }).url,
            domain: (d as { domain?: string }).domain,
            fetchedAt,
            ageDays: ageMs / (24 * 60 * 60 * 1000),
            textLength: fullText.length,
          },
        };
      });
    } catch (err) {
      cronLog.warn(`[webTextSource] search failed: ${(err as Error).message}`);
      return [];
    }
  },
};
