import { type Request, type Response } from 'express';
import FAQ from '../faq/faq.model.js';
import CommunityPost from '../community/community-post.model.js';
import SupportRequest from '../support/support-request.model.js';
import SearchLog from '../search/search-log.model.js';
import { withProgramScope } from '../../utils/db/scopedQuery.js';

/**
 * GET /api/health
 *
 * Public, unauthenticated. Returns a snapshot of system stats suitable
 * for a Discord /status embed (and any other client that wants a
 * "what's happening on the site" answer without auth).
 *
 * The shape mirrors what the bot's /status command renders:
 *   { faqs, posts, support: { open, pending, resolved, golden },
 *     unanswered, topCategory, searchesToday, serverTime, version }
 *
 * v1.69 — Phase 0 (discord capabilities): the old /api/admin/stats
 * returned a different shape (totalFaqs, totalUsers, etc.) and the
 * bot's /status silently dropped the missing fields. This endpoint
 * is the public, shape-aligned replacement that /status now calls.
 *
 * v1.69 — Phase 0+ supports ?batchId=... for per-program scope (used
 * by the per-guild bot in botManager). When batchId is provided, all
 * counts are scoped to that program.
 */
export const getHealth = async (req: Request, res: Response): Promise<void> => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const batchId = (req.query.batchId as string | undefined) ?? null;

    const [
      faqs,
      posts,
      supportOpen,
      supportPending,
      supportResolved,
      goldenOpen,
      unanswered,
      searchesToday,
      topCategoryResult,
    ] = await Promise.all([
      FAQ.countDocuments(withProgramScope({}, batchId)),
      CommunityPost.countDocuments(withProgramScope({}, batchId)),
      SupportRequest.countDocuments(withProgramScope({ status: 'open' }, batchId)),
      SupportRequest.countDocuments(withProgramScope({ status: 'in_review' }, batchId)),
      SupportRequest.countDocuments(withProgramScope({ status: 'resolved' }, batchId)),
      SupportRequest.countDocuments(withProgramScope({ isGolden: true, status: { $in: ['open', 'in_review'] } }, batchId)),
      FAQ.countDocuments(withProgramScope({ $or: [{ status: 'pending' }, { answer: { $in: ['', null] } }] }, batchId)),
      SearchLog.countDocuments(withProgramScope({ createdAt: { $gte: todayStart } }, batchId)),
      FAQ.aggregate([
        { $match: withProgramScope({ status: 'approved' }, batchId) },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1 },
      ]),
    ]);

    res.json({
      faqs,
      posts,
      support: {
        open: supportOpen,
        pending: supportPending,
        resolved: supportResolved,
        golden: goldenOpen,
      },
      unanswered,
      topCategory: topCategoryResult[0]?._id ?? 'N/A',
      searchesToday,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ message: 'Health check failed', error: (err as Error).message });
  }
};
