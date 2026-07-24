/**
 * communityTextSource — Phase 2 R10.
 *
 * `RetrievalSource` that hits answered community posts that the AI
 * approved (the most-curated user-generated content). Uses Mongo's
 * `$text` index on (title, body) — already in place on
 * CommunityPost (`community-post.model.ts:359`).
 *
 * Confidence: post.upvotes.length > 5 → 0.8, otherwise 0.6.
 */

import CommunityPost from '../../modules/community/community-post.model.js';
import { cronLog } from '../../utils/http/logger.js';
import type { RetrievalSource } from '../contextRetriever.js';

export const communityTextSource: RetrievalSource = {
  name: 'community',
  weight: 0.85,

  async search(query, batchId, opts) {
    const topK = opts.topK ?? 3;
    try {
      const filter: Record<string, unknown> = {
        status: 'answered',
        aiAnswerStatus: 'approved',
        deletedAt: null,
      };
      if (batchId) filter.batchId = batchId;

      const docs = await CommunityPost.find(
        { ...filter, $text: { $search: query } },
        { score: { $meta: 'textScore' } },
      )
        .sort({ score: { $meta: 'textScore' } })
        .limit(topK)
        .lean();

      return docs.map((d) => {
        const upvotes = Array.isArray((d as { upvotes?: unknown[] }).upvotes)
          ? ((d as { upvotes: unknown[] }).upvotes.length)
          : 0;
        const confidence = upvotes > 5 ? 0.8 : 0.6;
        const answer =
          (d as { answer?: string | null }).answer ??
          (d as { aiAnswer?: string | null }).aiAnswer ??
          '';
        return {
          source: 'community' as const,
          sourceId: String((d as { _id: unknown })._id),
          question: (d as { title?: string }).title ?? '',
          answer,
          score: Number((d as { score?: number }).score ?? 0),
          confidence,
          matchedOn: 'CommunityPost.title+body',
          batchId: (d as { batchId?: { toString(): string } }).batchId?.toString(),
          meta: {
            upvotes,
            lastVerifiedDate: (d as { updatedAt?: Date }).updatedAt ?? null,
          },
        };
      });
    } catch (err) {
      cronLog.warn(`[communityTextSource] search failed: ${(err as Error).message}`);
      return [];
    }
  },
};