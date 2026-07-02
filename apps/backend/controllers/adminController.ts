import { Request, Response } from 'express';
import { Types } from 'mongoose';
import FAQ, { IFAQ } from '../models/FAQ.js';
import User, { IUser } from '../models/User.js';
import SearchLog from '../models/SearchLog.js';
import AdminLog from '../models/AdminLog.js';
import CommunityPost from '../models/CommunityPost.js';
import { invalidateCache } from '../utils/http/cache.js';
import { sanitizeHtml } from '../utils/http/sanitize.js';
import { adminLog } from '../utils/http/logger.js';
import FreshReviewVote from '../models/FreshReviewVote.js';
import { generateEmbedding } from '../utils/ai/embeddings.js';
// v1.69 — Phase 3i: admin dashboard reads accept an optional
// ?batchId=... filter so an admin can scope a stats query to a
// single program. Global view is still the default.
import { withProgramScope } from '../utils/db/scopedQuery.js';
import AIResponseFeedback, { classifySentiment } from '../models/AIResponseFeedback.js';
import { invalidatePublicCaches } from './publicFaqController.js';

export const logAction = async (
  adminId: string,
  action: string,
  targetId?: string | null,
  targetType?: string | null,
  details: string = ''
): Promise<void> => {
  try {
    await AdminLog.create({ adminId, action, targetId, targetType, details });
  } catch (err) {
    adminLog.warn(`[adminLog] Failed to log action '${action}': ${(err as Error).message}`);
  }
};

// GET /api/admin/stats
export const getStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const batchId = (req.query.batchId as string | undefined) ?? null;

    const [
      totalFaqs,
      pendingFaqs,
      approvedFaqs,
      rejectedFaqs,
      totalUsers,
      searchesToday,
      totalSearches,
      faqsThisWeek,
      faqsLastWeek,
      usersThisWeek,
      topCategoryResult,
    ] = await Promise.all([
      FAQ.countDocuments(withProgramScope({}, batchId)),
      FAQ.countDocuments(withProgramScope({ status: 'pending' }, batchId)),
      FAQ.countDocuments(withProgramScope({ status: 'approved' }, batchId)),
      FAQ.countDocuments(withProgramScope({ status: 'rejected' }, batchId)),
      // User collection is identity-scoped, not program-scoped.
      User.countDocuments(),
      SearchLog.countDocuments(withProgramScope({ createdAt: { $gte: todayStart } }, batchId)),
      SearchLog.countDocuments(withProgramScope({}, batchId)),
      FAQ.countDocuments(withProgramScope({ createdAt: { $gte: weekAgo } }, batchId)),
      FAQ.countDocuments(withProgramScope({ createdAt: { $gte: twoWeeksAgo, $lt: weekAgo } }, batchId)),
      User.countDocuments({ createdAt: { $gte: weekAgo } }),
      FAQ.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1 },
      ]),
    ]);

    const unanswered = await FAQ.countDocuments(withProgramScope({
      $or: [{ status: 'pending' }, { answer: { $in: ['', null] } }],
    }, batchId));

    const faqTrend =
      faqsLastWeek > 0
        ? (((faqsThisWeek - faqsLastWeek) / faqsLastWeek) * 100).toFixed(1)
        : faqsThisWeek > 0
          ? '100'
          : '0';

    res.json({
      totalFaqs,
      pendingFaqs,
      approvedFaqs,
      rejectedFaqs,
      totalUsers,
      searchesToday,
      totalSearches,
      unanswered,
      topCategory: topCategoryResult[0]?._id || 'N/A',
      newUsersThisWeek: usersThisWeek,
      trends: { faqs: parseFloat(faqTrend) },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// GET /api/admin/faq-growth
export const getFaqGrowth = async (req: Request, res: Response): Promise<void> => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const batchId = (req.query.batchId as string | undefined) ?? null;

    const data = await FAQ.aggregate([
      { $match: withProgramScope({ createdAt: { $gte: from } }, batchId) },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Fill missing days with 0
    const result: { date: string; count: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      const found = data.find((x) => x._id === dateStr);
      result.push({ date: dateStr, count: found ? found.count : 0 });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// GET /api/admin/top-categories
export const getTopCategories = async (req: Request, res: Response): Promise<void> => {
  try {
    const batchId = (req.query.batchId as string | undefined) ?? null;
    const pipeline: Record<string, unknown>[] = batchId
      ? [{ $match: { batchId: new Types.ObjectId(batchId) } }]
      : [];
    pipeline.push(
      { $group: { _id: '$category', count: { $sum: 1 }, views: { $sum: '$views' } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    );

    // v1.69 — PipelineStage cast — the pipeline is built
    // dynamically (a \$match pre-stage when batchId is set)
    // and TypeScript can't narrow the array element type
    // through the spread. The runtime shape is correct.
    const data = await FAQ.aggregate(pipeline as unknown as Parameters<typeof FAQ.aggregate>[0]);

    res.json(data.map((d) => ({ name: d._id, count: d.count, views: d.views })));
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// GET /api/admin/search-insights
export const getSearchInsights = async (_req: Request, res: Response): Promise<void> => {
  try {
    const topQueries = await SearchLog.aggregate([
      { $group: { _id: { $toLower: '$query' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]);

    const failedSearches = await SearchLog.countDocuments({ resultsCount: 0 });
    const totalSearches = await SearchLog.countDocuments();

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentActivity = await SearchLog.aggregate([
      { $match: { createdAt: { $gte: weekAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          noResults: { $sum: { $cond: [{ $eq: ['$resultsCount', 0] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      topQueries: topQueries.map((q) => ({ term: q._id, count: q.count })),
      failedSearches,
      totalSearches,
      failRate: totalSearches > 0 ? ((failedSearches / totalSearches) * 100).toFixed(1) : '0',
      recentActivity,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// GET /api/admin/users
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const getUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    const search = (req.query.search as string) || '';

    const query = search
      ? {
          $or: [
            { name: { $regex: escapeRegex(search), $options: 'i' } },
            { email: { $regex: escapeRegex(search), $options: 'i' } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      User.find(query).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(query),
    ]);

    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// GET /api/admin/faqs
export const getAdminFAQs = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    const status = (req.query.status as string) || '';
    const category = (req.query.category as string) || '';
    const search = (req.query.search as string) || '';
    const sort = (req.query.sort as string) || '-createdAt';
    const batchId = (req.query.batchId as string) || '';

    const query: Record<string, unknown> = {};
    if (status) query.status = status;
    if (category) query.category = category;
    if (batchId && Types.ObjectId.isValid(batchId)) query.batchId = batchId;
    if (search)
      query.$or = [
        { question: { $regex: escapeRegex(search), $options: 'i' } },
        { answer: { $regex: escapeRegex(search), $options: 'i' } },
      ];

    const [faqs, total] = await Promise.all([
      FAQ.find(query)
        .select('-embedding')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('createdBy', 'name email'),
      FAQ.countDocuments(query),
    ]);

    const categories = await FAQ.distinct('category');

    res.json({ faqs, total, page, pages: Math.ceil(total / limit), categories });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// POST /api/admin/faq/approve
export const approveFAQ = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.body as { id?: string };
    if (!id) { res.status(400).json({ message: 'id is required' }); return; }
    const faq = await FAQ.findByIdAndUpdate(id, { status: 'approved' }, { new: true }).select('-embedding');
    if (!faq) { res.status(404).json({ message: 'FAQ not found.' }); return; }
    await logAction(req.user!._id.toString(), 'approve_faq', faq._id.toString(), 'faq', faq.question);
    res.json({ message: 'FAQ approved.', faq });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// POST /api/admin/faq/reject
export const rejectFAQ = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.body as { id?: string };
    if (!id) { res.status(400).json({ message: 'id is required' }); return; }
    const faq = await FAQ.findByIdAndUpdate(id, { status: 'rejected' }, { new: true }).select('-embedding');
    if (!faq) { res.status(404).json({ message: 'FAQ not found.' }); return; }
    await logAction(req.user!._id.toString(), 'reject_faq', faq._id.toString(), 'faq', faq.question);
    res.json({ message: 'FAQ rejected.', faq });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// PUT /api/admin/faq/:id
export const updateFAQ = async (req: Request, res: Response): Promise<void> => {
  try {
    const { question, answer, category, status, tags } = req.body as {
      question?: string;
      answer?: string;
      category?: string;
      status?: string;
      tags?: string[];
    };

    const faq = await FAQ.findById(req.params.id);
    if (!faq) {
      res.status(404).json({ message: 'FAQ not found.' });
      return;
    }

    if (question) faq.question = sanitizeHtml(question);
    if (answer) faq.answer = sanitizeHtml(answer);
    if (category) faq.category = sanitizeHtml(category);
    if (status) faq.status = status as any;
    if (tags) faq.tags = tags;

    // Recalculate embedding if key fields updated
    if (question || answer || category) {
      faq.embedding = await generateEmbedding(
        `Section: ${faq.category}. Question: ${faq.question}. Answer: ${faq.answer}`
      );
    }

    // Admin edit while under review = re-verification
    if (faq.reviewStatus === 'pending_review' || faq.reviewStatus === 'update_requested') {
      // v1.68 — H3 fix: in-memory mutate + save() is racy.
      // Wrap as a single atomic $set on the fields the
      // pending-review branch touches. (reports=[] is set
      // whether verify is true or not — the original "else"
      // branch handled the !verify case by just clearing reports.)
      const newCycle = faq.reviewCycle + 1;
      await FAQ.findOneAndUpdate(
        { _id: faq._id },
        { $set: { reports: [], lastVerifiedDate: new Date(), flaggedAt: null, flagType: null, flagReason: null, flaggedBy: null, reviewCycle: newCycle } },
      );
      await FreshReviewVote.deleteMany({ faqId: faq._id });
    } else {
      await FAQ.findOneAndUpdate(
        { _id: faq._id },
        { $set: { reports: [] } },
      );
    }
    await logAction(req.user!._id.toString(), 'edit_faq', faq._id.toString(), 'faq', faq.question);

    // Invalidate search cache so updated FAQ reflects immediately
    await invalidateCache();

    res.json({ message: 'FAQ updated.', faq });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// DELETE /api/admin/faq/:id
export const deleteFAQ = async (req: Request, res: Response): Promise<void> => {
  try {
    const faq = await FAQ.findByIdAndDelete(req.params.id);
    if (!faq) {
      res.status(404).json({ message: 'FAQ not found.' });
      return;
    }
    await logAction(req.user!._id.toString(), 'delete_faq', faq._id.toString(), 'faq', faq.question);

    // Invalidate search cache so deleted FAQ is removed from results
    await invalidateCache();

    res.json({ message: 'FAQ deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// POST /api/admin/faq
export const createFAQ = async (req: Request, res: Response): Promise<void> => {
  try {
    const { question, answer, category, status = 'approved' } = req.body as {
      question?: string;
      answer?: string;
      category?: string;
      status?: string;
    };
    if (!question || !answer || !category) {
      res.status(400).json({ message: 'Question, answer, and category are required.' });
      return;
    }
    const faq = await FAQ.create({
      question: sanitizeHtml(question),
      answer: sanitizeHtml(answer),
      category: sanitizeHtml(category),
      status,
      createdBy: req.user!._id,
    });
    await logAction(req.user!._id.toString(), 'create_faq', faq._id.toString(), 'faq', faq.question);

    // Invalidate search cache so new FAQ appears in results immediately
    await invalidateCache();

    res.status(201).json({ message: 'FAQ created.', faq });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// GET /api/admin/reports
export const getReports = async (req: Request, res: Response): Promise<void> => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const dateFilter: Record<string, unknown> = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);

    const faqQuery = Object.keys(dateFilter).length ? { createdAt: dateFilter } : {};
    const searchQuery = Object.keys(dateFilter).length ? { createdAt: dateFilter } : {};

    const [faqs, searchLogs, categoryBreakdown, statusBreakdown] = await Promise.all([
      FAQ.find(faqQuery).select('-embedding').sort('-createdAt').limit(500),
      SearchLog.find(searchQuery).sort('-createdAt').limit(500),
      FAQ.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      FAQ.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);

    res.json({
      faqs,
      searchLogs,
      summary: {
        totalFaqs: faqs.length,
        totalSearches: searchLogs.length,
        categoryBreakdown,
        statusBreakdown,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// GET /api/admin/activity-feed
export const getActivityFeed = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AdminLog.find()
        .populate('adminId', 'name email')
        .sort('-createdAt')
        .skip(skip)
        .limit(limit),
      AdminLog.countDocuments(),
    ]);

    res.json({
      logs,
      total,
      page,
      pages: Math.ceil(total / limit),
      hasMore: skip + logs.length < total,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// GET /api/admin/user-activity-chart
export const getUserActivityChart = async (req: Request, res: Response): Promise<void> => {
  try {
    const days = parseInt(req.query.days as string) || 14;
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Aggregate actual search activity per day: count searches + unique users.
    // v1.68 — M1: SearchLog now has a userId field. The aggregation
    // uses $addToSet to count distinct userIds per day, then $size
    // to count the set. Anonymous searches (userId=null) are
    // excluded from the unique count.
    const searchActivity = await SearchLog.aggregate([
      { $match: { createdAt: { $gte: from } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          searches: { $sum: 1 },
          uniqueUsers: { $addToSet: '$userId' },
        },
      },
      {
        $project: {
          searches: 1,
          // Count the set minus the null (anonymous) bucket.
          users: {
            $size: {
              $filter: {
                input: '$uniqueUsers',
                as: 'u',
                cond: { $ne: ['$$u', null] },
              },
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const result: { date: string; searches: number; users: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      const found = searchActivity.find((x) => x._id === dateStr);
      result.push({
        date: dateStr,
        searches: found ? found.searches : 0,
        users: found ? found.users : 0,
      });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// GET /api/admin/community/posts
export const getCommunityPosts = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;
    const search = (req.query.search as string) || '';
    const status = (req.query.status as string) || '';
    const batchId = (req.query.batchId as string | undefined) ?? null;

    const base: Record<string, unknown> = {};
    if (search) {
      base.$or = [
        { title: { $regex: search, $options: 'i' } },
        { body: { $regex: search, $options: 'i' } },
      ];
    }
    if (status) base.status = status;
    const query = withProgramScope(base, batchId);

    const [posts, total] = await Promise.all([
      CommunityPost.find(query)
        .select('-embedding')
        .populate('author', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      CommunityPost.countDocuments(query),
    ]);

    res.json({ posts, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// DELETE /api/admin/community/:id
export const deleteCommunityPost = async (req: Request, res: Response): Promise<void> => {
  try {
    const post = await CommunityPost.findByIdAndDelete(req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }
    await logAction(req.user!._id.toString(), 'delete_community_post', post._id.toString(), 'community_post', post.title);
    res.json({ message: 'Post deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// ─── AI Response Feedback ────────────────────────────────────────────────────

// POST /api/admin/ai-feedback  (public — no auth required)
export const submitAIFeedback = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      question: rawQuestion,
      aiAnswer: rawAnswer,
      rating: rawRating,
      comment: rawComment,
      faqId,
      faqQuestion: rawFaqQuestion,
      hasFaqSource,
      batchId,
    } = req.body as {
      question?: string;
      aiAnswer?: string;
      rating?: number | string;
      comment?: string;
      faqId?: string;
      faqQuestion?: string;
      hasFaqSource?: boolean;
      batchId?: string;
    };

    // Validate required fields
    const question = sanitizeHtml(rawQuestion ?? '').trim();
    const aiAnswer = sanitizeHtml(rawAnswer ?? '').trim();
    const rating = Number(rawRating);

    if (!question) { res.status(400).json({ message: 'question is required' }); return; }
    if (!aiAnswer) { res.status(400).json({ message: 'aiAnswer is required' }); return; }
    if (!rating || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      res.status(400).json({ message: 'rating must be an integer between 1 and 5' });
      return;
    }

    const comment = sanitizeHtml(rawComment ?? '').slice(0, 500).trim();
    const faqQuestion = sanitizeHtml(rawFaqQuestion ?? '').trim();
    const sentiment = classifySentiment(comment, rating);

    // Resolve faqId safely
    const faqObjectId = faqId && Types.ObjectId.isValid(faqId) ? new Types.ObjectId(faqId) : null;
    const batchObjectId = batchId && Types.ObjectId.isValid(batchId) ? new Types.ObjectId(batchId) : null;

    // Deduplication — case-insensitive exact question match
    const existing = await AIResponseFeedback.findOne({
      question: { $regex: `^${question.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
    });

    if (existing) {
      // Update: running average, askCount, push comment
      const newAskCount = existing.askCount + 1;
      const newAvgRating = ((existing.avgRating * existing.askCount) + rating) / newAskCount;
      const updatedComments = comment
        ? [...existing.comments.filter(Boolean), comment].slice(-50)
        : existing.comments;
      const newSentiment = comment ? sentiment : existing.sentiment;

      await AIResponseFeedback.findByIdAndUpdate(existing._id, {
        $set: {
          askCount: newAskCount,
          avgRating: Number(newAvgRating.toFixed(2)),
          comments: updatedComments,
          sentiment: newSentiment,
        },
      });

      res.status(200).json({ message: 'Feedback recorded (duplicate updated)', data: { id: existing._id } });
      return;
    }

    // New document
    const doc = await AIResponseFeedback.create({
      question,
      aiAnswer,
      rating,
      comment,
      faqId: faqObjectId,
      faqQuestion,
      hasFaqSource: hasFaqSource === true || !!faqObjectId,
      sentiment,
      batchId: batchObjectId,
      askCount: 1,
      avgRating: rating,
      comments: comment ? [comment] : [],
    });

    res.status(201).json({ message: 'Feedback submitted', data: { id: doc._id } });
  } catch (error) {
    adminLog.error('[submitAIFeedback] failed', { error: (error as Error).message });
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/admin/ai-feedback  (admin/moderator)
export const getAIFeedback = async (req: Request, res: Response): Promise<void> => {
  try {
    const page  = Math.max(1, parseInt(String(req.query.page  ?? '1')));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '20'))));
    const skip  = (page - 1) * limit;

    const filter: Record<string, unknown> = {};

    const hasFaqSourceQ = req.query.hasFaqSource;
    if (hasFaqSourceQ === 'true')  filter.hasFaqSource = true;
    if (hasFaqSourceQ === 'false') filter.hasFaqSource = false;

    const minRating = parseFloat(String(req.query.minRating ?? ''));
    const maxRating = parseFloat(String(req.query.maxRating ?? ''));
    if (!isNaN(minRating) || !isNaN(maxRating)) {
      const ratingFilter: Record<string, number> = {};
      if (!isNaN(minRating)) ratingFilter.$gte = minRating;
      if (!isNaN(maxRating)) ratingFilter.$lte = maxRating;
      filter.avgRating = ratingFilter;
    }

    const sentiment = req.query.sentiment as string | undefined;
    if (sentiment) filter.sentiment = sentiment;

    const sortParam = (req.query.sort as string) || 'attentionScore';
    const dbSort: Record<string, 1 | -1> = sortParam === 'createdAt'
      ? { createdAt: -1 }
      : { createdAt: -1 }; // Default: rely on post-sort below for attentionScore

    const [rawItems, total] = await Promise.all([
      AIResponseFeedback.find(filter)
        .sort(dbSort)
        .skip(skip)
        .limit(limit)
        .lean(),
      AIResponseFeedback.countDocuments(filter),
    ]);

    // Compute attentionScore and needsAttention per item
    const items = rawItems.map((item) => {
      const attentionScore = item.askCount * (5 - item.avgRating);
      return {
        ...item,
        attentionScore: Number(attentionScore.toFixed(2)),
        needsAttention: attentionScore > 10,
      };
    });

    // Post-sort by attentionScore descending (only when sort=attentionScore)
    if (sortParam === 'attentionScore') {
      items.sort((a, b) => b.attentionScore - a.attentionScore);
    }

    res.json({
      message: 'OK',
      data: {
        items,
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    adminLog.error('[getAIFeedback] failed', { error: (error as Error).message });
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/admin/ai-feedback/stats  (admin/moderator)
export const getAIFeedbackStats = async (_req: Request, res: Response): Promise<void> => {
  try {
    const ATTENTION_THRESHOLD = 10;

    const [
      totalFeedback,
      withFaqSource,
      withoutFaqSource,
      ratingAgg,
      sentimentAgg,
      allDocs,
    ] = await Promise.all([
      AIResponseFeedback.countDocuments(),
      AIResponseFeedback.countDocuments({ hasFaqSource: true }),
      AIResponseFeedback.countDocuments({ hasFaqSource: false }),
      AIResponseFeedback.aggregate([
        { $group: { _id: null, avgRating: { $avg: '$avgRating' } } },
      ]),
      AIResponseFeedback.aggregate([
        { $group: { _id: '$sentiment', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      // For needsAttentionCount we need to compute attentionScore in the pipeline
      AIResponseFeedback.aggregate([
        {
          $addFields: {
            attentionScore: { $multiply: ['$askCount', { $subtract: [5, '$avgRating'] }] },
          },
        },
        { $match: { attentionScore: { $gt: ATTENTION_THRESHOLD } } },
        { $count: 'count' },
      ]),
    ]);

    const avgRatingOverall = ratingAgg[0]?.avgRating ?? 0;
    const needsAttentionCount = allDocs[0]?.count ?? 0;
    const sentimentBreakdown: Record<string, number> = {};
    for (const s of sentimentAgg) {
      sentimentBreakdown[s._id as string] = s.count as number;
    }

    res.json({
      message: 'OK',
      data: {
        totalFeedback,
        avgRatingOverall: Number(avgRatingOverall.toFixed(2)),
        withFaqSource,
        withoutFaqSource,
        needsAttentionCount,
        sentimentBreakdown,
      },
    });
  } catch (error) {
    adminLog.error('[getAIFeedbackStats] failed', { error: (error as Error).message });
    res.status(500).json({ message: 'Server error' });
  }
};

// PATCH /api/admin/ai-feedback/:faqId/edit-faq  (admin only)
export const editFAQFromFeedback = async (req: Request, res: Response): Promise<void> => {
  try {
    const faqId = String(req.params.faqId);
    if (!Types.ObjectId.isValid(faqId)) {
      res.status(400).json({ message: 'Invalid faqId' });
      return;
    }

    const {
      question: rawQuestion,
      answer: rawAnswer,
      category: rawCategory,
    } = req.body as { question?: string; answer?: string; category?: string };

    const question = sanitizeHtml(rawQuestion ?? '').trim();
    const answer   = sanitizeHtml(rawAnswer   ?? '').trim();
    const category = sanitizeHtml(rawCategory ?? '').trim();

    if (!question || !answer || !category) {
      res.status(400).json({ message: 'question, answer, and category are required' });
      return;
    }

    const faq = await FAQ.findById(faqId);
    if (!faq) {
      res.status(404).json({ message: 'FAQ not found' });
      return;
    }

    faq.question = question;
    faq.answer   = answer;
    faq.category = category;

    // Regenerate embedding
    faq.embedding = await generateEmbedding(
      `Section: ${faq.category}. Question: ${faq.question}. Answer: ${faq.answer}`
    );

    await faq.save();

    // Invalidate caches
    invalidatePublicCaches();
    await invalidateCache();

    // Audit log
    adminLog.audit('edit_faq_from_ai_feedback', {
      adminId: req.user!._id.toString(),
      faqId,
      question,
    });
    await logAction(
      req.user!._id.toString(),
      'edit_faq_from_ai_feedback',
      faqId,
      'faq',
      question
    );

    res.json({ message: 'FAQ updated successfully', data: { faq } });
  } catch (error) {
    adminLog.error('[editFAQFromFeedback] failed', { error: (error as Error).message });
    res.status(500).json({ message: 'Server error' });
  }
};

