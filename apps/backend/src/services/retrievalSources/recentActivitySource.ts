/**
 * recentActivitySource — Phase 2 R10.
 *
 * Breadth-floor source: returns the last 30 days of approved FAQs
 * regardless of whether they match the query text. Without this
 * source, an obscure query with no text matches would return an
 * empty context and the LLM would have nothing to anchor to.
 *
 * Confidence is fixed low (0.4) so this source never outranks a
 * text-matched hit from any other source.
 */

import FAQ from '../../modules/faq/faq.model.js';
import { cronLog } from '../../utils/http/logger.js';
import type { RetrievalSource } from '../contextRetriever.js';

export const recentActivitySource: RetrievalSource = {
  name: 'recent_activity',
  weight: 0.4,

  async search(_query, batchId, opts) {
    const topK = opts.topK ?? 3;
    try {
      const filter: Record<string, unknown> = {
        status: 'approved',
        deletedAt: null,
      };
      if (batchId) filter.batchId = batchId;

      const RECENT_WINDOW_DAYS = 30;
      const since = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      filter.createdAt = { $gte: since };

      const docs = await FAQ.find(filter)
        .sort({ createdAt: -1 })
        .limit(topK)
        .lean();

      return docs.map((d) => ({
        source: 'recent_activity' as const,
        sourceId: String((d as { _id: unknown })._id),
        question: (d as { question?: string }).question ?? '',
        answer: (d as { answer?: string }).answer ?? '',
        score: 0, // no text score — this source isn't relevance-ranked
        confidence: 0.4,
        matchedOn: 'recent-faq-window',
        batchId: (d as { batchId?: { toString(): string } }).batchId?.toString(),
        meta: {
          lastVerifiedDate: (d as { lastVerifiedDate?: Date }).lastVerifiedDate ?? null,
          freshnessTier: (d as { freshnessTier?: string }).freshnessTier,
        },
      }));
    } catch (err) {
      cronLog.warn(`[recentActivitySource] search failed: ${(err as Error).message}`);
      return [];
    }
  },
};