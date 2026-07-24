/**
 * faqTextSource — Phase 2 R10.
 *
 * `RetrievalSource` that queries the `FAQ` collection via Mongo's
 * `$text` index (already in place since v1.0 — see `faq.model.ts:310-313`).
 *
 * Confidence: `freshnessTier === 'evergreen'` (the "fresh" tier in
 * the plan spec) gets 0.95, anything else (seasonal, volatile) gets 0.7.
 *
 * Note: the FAQ model uses `status: 'approved'` for published FAQs;
 * the plan spec's `'published'` enum value is treated equivalently
 * here. The auto-answer pipeline already filters on `'approved'`.
 */

import FAQ from '../../modules/faq/faq.model.js';
import { cronLog } from '../../utils/http/logger.js';
import type { RetrievalSource } from '../contextRetriever.js';

export const faqTextSource: RetrievalSource = {
  name: 'faq',
  weight: 1.0,

  async search(query, batchId, opts) {
    const topK = opts.topK ?? 3;
    try {
      const filter: Record<string, unknown> = { status: 'approved' };
      if (batchId) filter.batchId = batchId;

      const docs = await FAQ.find(
        { ...filter, $text: { $search: query } },
        { score: { $meta: 'textScore' } },
      )
        .sort({ score: { $meta: 'textScore' } })
        .limit(topK)
        .lean();

      return docs.map((d) => {
        const freshnessTier = (d as { freshnessTier?: string }).freshnessTier;
        const confidence = freshnessTier === 'evergreen' ? 0.95 : 0.7;
        return {
          source: 'faq' as const,
          sourceId: String((d as { _id: unknown })._id),
          question: (d as { question?: string }).question ?? '',
          answer: (d as { answer?: string }).answer ?? '',
          score: Number((d as { score?: number }).score ?? 0),
          confidence,
          matchedOn: 'faq.question+answer+tags',
          batchId: (d as { batchId?: { toString(): string } }).batchId?.toString(),
          meta: {
            freshnessTier,
            lastVerifiedDate: (d as { lastVerifiedDate?: Date }).lastVerifiedDate ?? null,
            category: (d as { category?: string }).category,
          },
        };
      });
    } catch (err) {
      cronLog.warn(`[faqTextSource] search failed: ${(err as Error).message}`);
      return [];
    }
  },
};