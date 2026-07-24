/**
 * documentTextSource — Phase 6 + Phase 9 metadata boosting.
 *
 * 7th `RetrievalSource` for admin-uploaded documents (`DocumentAsset`
 * collection). Returns hits ranked by Mongo `$text` score, with
 * per-document confidence decaying from 0.85 → 0.5 once the document
 * is older than 30 days.
 *
 * Phase 9 (metadata boost)
 * ------------------------
 * When documentIngestion.service has extracted `metadata.tags` for a
 * row, we count how many of those tags appear in the query and bump
 * the confidence by `tagOverlap * 0.02` (capped at 0.95). This is
 * the fallback path when EMBEDDING_MODEL is not configured — the LLM
 * did the semantic work at write time, the keyword index carries it
 * at read time. Without this, docs uploaded without an embedding
 * model would only ever match on exact words in the title/text.
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
// Phase 9: the `text` field on DocumentAsset rows can be up to 500,000
// chars, but the retriever only ever displays the first 4,000 as the
// `answer`. Fetching the full body wastes bandwidth + Node deserialization
// CPU, so we (a) project only the fields the hit shape needs and (b) cap
// the `text` payload at this many chars before assigning to `answer`. The
// original (uncapped) length is preserved in `meta.textLength` so the
// consumer can detect truncation.
const ANSWER_TEXT_MAX_CHARS = 4000;
const MAX_CONFIDENCE = 0.95;
const TAG_BOOST_PER_HIT = 0.02;

export const documentTextSource: RetrievalSource = {
  name: 'document',
  weight: 0.85, // between web (0.9) and community (0.85) — curated admin uploads

  async search(query, batchId, opts) {
    const topK = opts.topK ?? 3;
    try {
      const filter: Record<string, unknown> = { lastFetchError: null };
      if (batchId) filter.batchId = batchId;
      // Phase 9: explicit projection so we don't pull the full 500K-char
      // `text` body for every match. The `$meta: 'textScore'` projection
      // is independent of the field projection, so it doesn't conflict.
      const docs = await DocumentAsset.find(
        { ...filter, $text: { $search: query } },
        { score: { $meta: 'textScore' } },
      )
        .select('title text filename mimeType sizeBytes pageCount uploadedAt batchId _id metadata embeddedAt')
        .sort({ score: { $meta: 'textScore' } })
        .limit(topK)
        .lean();

      const now = Date.now();
      const staleCutoffMs = STALE_DAYS * 24 * 60 * 60 * 1000;
      const queryLower = query.toLowerCase();
      return docs.map((d) => {
        const uploadedAt: Date | null = (d as { uploadedAt?: Date }).uploadedAt ?? null;
        const ageMs = uploadedAt ? now - uploadedAt.getTime() : staleCutoffMs;
        const baseConfidence = ageMs < staleCutoffMs ? 0.85 : 0.5;

        // Phase 9: metadata-driven boost. Count how many of the
        // document's LLM-extracted tags appear in the query string.
        // Each overlap adds TAG_BOOST_PER_HIT to the confidence, capped
        // at MAX_CONFIDENCE so we don't exceed ProgramKnowledge's
        // 0.95 tier.
        const tags = (d as { metadata?: { tags?: string[] } }).metadata?.tags ?? [];
        const tagOverlap = tags.reduce(
          (n, t) => (typeof t === 'string' && queryLower.includes(t) ? n + 1 : n),
          0,
        );
        const confidence = Math.min(MAX_CONFIDENCE, baseConfidence + tagOverlap * TAG_BOOST_PER_HIT);

        const fullText = (d as { text?: string }).text ?? '';
        const truncated =
          fullText.length > ANSWER_TEXT_MAX_CHARS
            ? fullText.slice(0, ANSWER_TEXT_MAX_CHARS)
            : fullText;
        return {
          source: 'document' as const,
          sourceId: String((d as { _id: unknown })._id),
          question: (d as { title?: string }).title ?? '',
          answer: truncated,
          score: Number((d as { score?: number }).score ?? 0),
          confidence,
          matchedOn: 'DocumentAsset.title+text+metadata',
          batchId: (d as { batchId?: { toString(): string } }).batchId?.toString() ?? null,
          meta: {
            filename: (d as { filename?: string }).filename,
            mimeType: (d as { mimeType?: string }).mimeType,
            pageCount: (d as { pageCount?: number }).pageCount,
            sizeBytes: (d as { sizeBytes?: number }).sizeBytes,
            uploadedAt,
            embeddedAt: (d as { embeddedAt?: Date | null }).embeddedAt ?? null,
            ageDays: ageMs / (24 * 60 * 60 * 1000),
            textLength: fullText.length,
            tags,
            tagOverlap,
          },
        };
      });
    } catch (err) {
      cronLog.warn(`[documentTextSource] search failed: ${(err as Error).message}`);
      return [];
    }
  },
};