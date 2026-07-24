/**
 * commentsSource — Phase 2 R10.
 *
 * `RetrievalSource` that surfaces top-voted *comments* (not the
 * posts themselves) so the LLM sees what humans actually wrote.
 *
 * Implementation note: comments are embedded subdocuments on
 * CommunityPost (see `community-post.model.ts:31-56`), not a
 * separate collection. So we pull recent answered posts in the
 * program, flatten their comments, and return the top-voted ones.
 *
 * Disabled by default for non-comment fetches — the plan spec says
 * `includeComments` must be set explicitly. fetchContext handles the
 * opt-out by skipping registration-time filtering.
 */

import CommunityPost from '../../modules/community/community-post.model.js';
import { cronLog } from '../../utils/http/logger.js';
import type { RetrievalSource } from '../contextRetriever.js';

interface CommentSubdoc {
  _id?: unknown;
  author?: unknown;
  body?: string;
  upvotes?: unknown[];
  verified?: boolean;
  isExpertAnswer?: boolean;
  createdAt?: Date;
}

export const commentsSource: RetrievalSource = {
  name: 'comments',
  weight: 0.6,

  async search(query, batchId, opts) {
    const topK = opts.topK ?? 3;
    try {
      const filter: Record<string, unknown> = {
        deletedAt: null,
        // Only pull posts that actually have comments — saves a
        // pass over zero-comment posts which is most of the data.
        'comments.0': { $exists: true },
      };
      if (batchId) filter.batchId = batchId;

      // Pull a window of recent active posts — we don't run a full
      // text search here (comments don't have a text index), we just
      // want the "what are humans saying" breadcrumb for the LLM.
      const RECENT_WINDOW_DAYS = 30;
      const since = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      filter.updatedAt = { $gte: since };

      const posts = await CommunityPost.find(filter)
        .sort({ updatedAt: -1 })
        .limit(20)
        .lean();

      // Tokenize the query — surface comments that share any
      // significant word with the query. Cheap string match, no
      // `$text` (comments don't have one).
      const queryTerms = query
        .toLowerCase()
        .split(/\W+/)
        .filter((t) => t.length >= 4);

      const ranked: Array<{
        body: string;
        upvotes: number;
        postId: string;
        commentId: string;
        score: number;
        postTitle: string;
      }> = [];

      for (const p of posts) {
        const comments = ((p as { comments?: CommentSubdoc[] }).comments ?? []);
        for (const c of comments) {
          const body = (c.body ?? '').toLowerCase();
          if (!body) continue;
          let match = 0;
          for (const term of queryTerms) {
            if (body.includes(term)) match += 1;
          }
          if (match === 0 && queryTerms.length > 0) continue; // no overlap → skip
          const upvotes = Array.isArray(c.upvotes) ? c.upvotes.length : 0;
          ranked.push({
            body: c.body ?? '',
            upvotes,
            postId: String((p as { _id: unknown })._id),
            commentId: String(c._id ?? ''),
            score: match + upvotes * 0.01, // token hits dominate, upvotes break ties
            postTitle: (p as { title?: string }).title ?? '',
          });
        }
      }

      ranked.sort((a, b) => b.score - a.score);
      const top = ranked.slice(0, topK);

      return top.map((c) => ({
        source: 'comments' as const,
        sourceId: `${c.postId}:${c.commentId}`,
        question: c.postTitle,
        answer: c.body,
        score: c.score,
        confidence: 0.5,
        matchedOn: 'comment.body',
        batchId,
        meta: {
          postId: c.postId,
          commentId: c.commentId,
          upvotes: c.upvotes,
          lastVerifiedDate: new Date(),
        },
      }));
    } catch (err) {
      cronLog.warn(`[commentsSource] search failed: ${(err as Error).message}`);
      return [];
    }
  },
};