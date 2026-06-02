import { Request, Response } from 'express';
import FAQ, { IFAQ } from '../models/FAQ.js';
import User, { IUser } from '../models/User.js';
import SearchLog from '../models/SearchLog.js';
import AdminLog from '../models/AdminLog.js';
import CommunityPost from '../models/CommunityPost.js';
import { invalidateCache } from '../utils/cache.js';
import { sanitizeHtml } from '../utils/sanitize.js';

export const logAction = async (
  adminId: string,
  action: string,
  targetId?: string | null,
  targetType?: string | null,
  details: string = ''
): Promise<void> => {
  try {
    await AdminLog.create({ adminId, action, targetId, targetType, details });
  } catch (_) {}
};

// GET /api/admin/stats
export const getStats = async (_req: Request, res: Response): Promise<void> => {
  try {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

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
      FAQ.countDocuments(),
      FAQ.countDocuments({ status: 'pending' }),
      FAQ.countDocuments({ status: 'approved' }),
      FAQ.countDocuments({ status: 'rejected' }),
      User.countDocuments(),
      SearchLog.countDocuments({ createdAt: { $gte: todayStart } }),
      SearchLog.countDocuments(),
      FAQ.countDocuments({ createdAt: { $gte: weekAgo } }),
      FAQ.countDocuments({ createdAt: { $gte: twoWeeksAgo, $lt: weekAgo } }),
      User.countDocuments({ createdAt: { $gte: weekAgo } }),
      FAQ.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1 },
      ]),
    ]);

    const unanswered = await FAQ.countDocuments({
      $or: [{ status: 'pending' }, { answer: { $in: ['', null] } }],
    });

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

    const data = await FAQ.aggregate([
      { $match: { createdAt: { $gte: from } } },
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
export const getTopCategories = async (_req: Request, res: Response): Promise<void> => {
  try {
    const data = await FAQ.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 }, views: { $sum: '$views' } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

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

    const query: Record<string, unknown> = {};
    if (status) query.status = status;
    if (category) query.category = category;
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
    const { question, answer, category, status } = req.body as {
      question?: string;
      answer?: string;
      category?: string;
      status?: string;
    };
    const faq = await FAQ.findByIdAndUpdate(
      req.params.id,
      {
        ...(question && { question: sanitizeHtml(question) }),
        ...(answer && { answer: sanitizeHtml(answer) }),
        ...(category && { category: sanitizeHtml(category) }),
        ...(status && { status }),
      },
      { new: true, runValidators: true }
    ).select('-embedding');

    if (!faq) {
      res.status(404).json({ message: 'FAQ not found.' });
      return;
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

    // Aggregate actual search activity per day: count searches and unique users
    const searchActivity = await SearchLog.aggregate([
      { $match: { createdAt: { $gte: from } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          searches: { $sum: 1 },
          // Aggregate by distinct userId from SearchLog (topResultId captures which result was clicked,
          // but we don't have a direct userId field — use result count as proxy for engagement)
          // NOTE: SearchLog doesn't store userId — users field tracks search count as engagement proxy.
          // For accurate user counts, a separate UserActivityLog would be needed.
          userCount: { $sum: 1 },
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
        // Use actual search count as engagement proxy (SearchLog has no userId field)
        users: found ? found.userCount : 0,
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

    const query: Record<string, unknown> = {};
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { body: { $regex: search, $options: 'i' } },
      ];
    }
    if (status) query.status = status;

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
