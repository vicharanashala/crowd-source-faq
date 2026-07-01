import { Request, Response } from 'express';
import CommunityPost from '../community/community-post.model.js';
import FAQ from './faq.model.js';
import { communityLog } from '../../utils/http/logger.js';

interface RelatedItem {
  _id: string;
  title: string;
  tags: string[];
  matchScore: number;
  upvotes: number;
  status?: string;
  url: string;
}

/**
 * GET /api/community/:id/related
 * Returns two lists for a community post:
 *   - relatedQuestions: other community posts sharing tag overlap
 *   - similarFaqs: FAQs sharing tag overlap (or vector similarity if available)
 * Powers the "Related Questions" + "Similar FAQs" sections in ThreadDetail.
 */
export async function getRelatedForPost(req: Request, res: Response): Promise<void> {
  try {
    const post = await CommunityPost.findById(req.params.id).select('title tags embedding isHidden');
    if (!post) { res.status(404).json({ error: 'Post not found' }); return; }

    const tags = (post.tags ?? []).filter(Boolean);
    const limit = Math.min(5, Math.max(1, parseInt(String(req.query.limit ?? '5'))));

    // ── Related community questions (by tag overlap) ────────────────────────
    let relatedQuestions: RelatedItem[] = [];
    if (tags.length > 0) {
      const related = await CommunityPost.aggregate([
        {
          $match: {
            _id: { $ne: post._id },
            isHidden: { $ne: true },
            tags: { $in: tags },
          },
        },
        {
          $addFields: {
            overlap: { $size: { $setIntersection: ['$tags', tags] } },
          },
        },
        { $sort: { overlap: -1, createdAt: -1 } },
        { $limit: limit },
        {
          $project: {
            _id: 1,
            title: 1,
            tags: 1,
            status: 1,
            upvotesCount: { $size: { $ifNull: ['$upvotes', []] } },
            overlap: 1,
          },
        },
      ]);
      relatedQuestions = related.map((r) => ({
        _id: String(r._id),
        title: r.title,
        tags: r.tags ?? [],
        matchScore: r.overlap ?? 0,
        upvotes: r.upvotesCount ?? 0,
        status: r.status,
        url: `/community?post=${String(r._id)}`,
      }));
    }

    // ── Similar FAQs (by tag overlap; falls back to text match if no tags) ──
    let similarFaqs: RelatedItem[] = [];
    if (tags.length > 0) {
      const sims = await FAQ.aggregate([
        {
          $match: { status: 'approved', tags: { $in: tags } },
        },
        {
          $addFields: {
            overlap: { $size: { $setIntersection: ['$tags', tags] } },
          },
        },
        { $sort: { overlap: -1, helpfulVotes: -1 } },
        { $limit: limit },
        {
          $project: {
            _id: 1,
            question: 1,
            tags: 1,
            category: 1,
            helpfulVotes: 1,
            overlap: 1,
          },
        },
      ]);
      similarFaqs = sims.map((f) => ({
        _id: String(f._id),
        title: f.question,
        tags: f.tags ?? [],
        matchScore: f.overlap ?? 0,
        upvotes: f.helpfulVotes ?? 0,
        url: `/faq/${String(f._id)}`,
      }));
    } else {
      // No tags — fall back to a vector similarity search on the post's
      // embedding (if it exists). Reuses the same Atlas vector index the
      // main search endpoint uses.
      try {
        const postEmbedding = post.embedding;
        if (Array.isArray(postEmbedding) && postEmbedding.length === 768) {
          const db = (await import('mongoose')).default.connection.db;
          if (db) {
            const sim = await db.collection('yaksha_faq_faqs').aggregate([
              {
                $vectorSearch: {
                  index: 'vector_index',
                  path: 'embedding',
                  queryVector: postEmbedding,
                  numCandidates: limit * 10,
                  limit,
                },
              },
              { $match: { status: 'approved' } },
              { $project: { _id: 1, question: 1, tags: 1, score: { $meta: 'vectorSearchScore' } } },
            ]).toArray();
            similarFaqs = sim.map((f) => ({
              _id: String(f._id),
              title: f.question as string,
              tags: (f.tags as string[]) ?? [],
              matchScore: Math.round((f.score as number) * 100),
              upvotes: 0,
              url: `/faq/${String(f._id)}`,
            }));
          }
        } else {
          // Last-resort: keyword search on the post title
          const titleQuery = post.title.split(/\s+/).filter(w => w.length >= 4).slice(0, 3).join(' ');
          if (titleQuery) {
            const db = (await import('mongoose')).default.connection.db;
            if (db) {
              const sim = await db.collection('yaksha_faq_faqs').find(
                { $text: { $search: titleQuery }, status: 'approved' },
                { projection: { score: { $meta: 'textScore' }, question: 1, tags: 1 } }
              ).sort({ score: { $meta: 'textScore' } }).limit(limit).toArray();
              similarFaqs = sim.map((f) => ({
                _id: String(f._id),
                title: f.question as string,
                tags: (f.tags as string[]) ?? [],
                matchScore: Math.round(((f as { score?: number }).score ?? 0) * 10),
                upvotes: 0,
                url: `/faq/${String(f._id)}`,
              }));
            }
          }
        }
      } catch (e) {
        // Vector index might not exist on the dev DB — degrade gracefully
        communityLog.warn(`RelatedFAQ vector/text search failed: ${(e as Error).message}`);
      }
    }

    res.json({ relatedQuestions, similarFaqs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load related items' });
  }
}
