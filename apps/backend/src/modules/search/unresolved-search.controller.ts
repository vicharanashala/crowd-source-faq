import { Request, Response } from 'express';
import UnresolvedSearch from './unresolved-search.model.js';
import FAQ from '../faq/faq.model.js';

/**
 * Submit a "No, I need more help" feedback for a search result.
 * POST /api/search/unresolved
 */
export const submitUnresolved = async (req: Request, res: Response): Promise<void> => {
  try {
    const { query, faqId, feedback } = req.body as {
      query: string;
      faqId?: string;
      feedback: string;
    };

    if (!query?.trim() || !feedback?.trim()) {
      res.status(400).json({ message: 'query and feedback are required' });
      return;
    }

    if (feedback.trim().length > 1000) {
      res.status(400).json({ message: 'feedback must be 1000 characters or fewer' });
      return;
    }

    const unresolved = new UnresolvedSearch({
      query: query.trim(),
      faqId: faqId ? (faqId as any) : null,
      userId: (req.user as any)?._id ? ((req.user as any)._id as any) : null,
      feedback: feedback.trim(),
      status: 'pending',
    });

    await unresolved.save();
    res.status(201).json({ message: 'Thanks — we\'ll work on improving this!', id: unresolved._id });
  } catch (err) {
    const message = (err as Error).message;
    res.status(500).json({ message: `Failed to submit feedback: ${message}` });
  }
};

/**
 * Admin: list pending unresolved searches.
 * GET /api/admin/unresolved-search?page=1&limit=20
 */
export const getUnresolvedSearches = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '20', 10)));
    const skip = (page - 1) * limit;
    const status = (req.query.status as string) || 'pending';

    const total = await UnresolvedSearch.countDocuments({ status });
    const items = await UnresolvedSearch.find({ status })
      .populate('faqId', 'question category')
      .populate('userId', 'name email')
      .populate('resolvedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    const message = (err as Error).message;
    res.status(500).json({ message: `Failed to fetch: ${message}` });
  }
};

/**
 * Admin: delete an unresolved search entry.
 * DELETE /api/admin/unresolved-search/:id
 */
export const deleteUnresolved = async (req: Request, res: Response): Promise<void> => {
  try {
    const deleted = await UnresolvedSearch.findByIdAndDelete(req.params.id);
    if (!deleted) {
      res.status(404).json({ message: 'Not found' });
      return;
    }
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: `Delete failed: ${(err as Error).message}` });
  }
};

/**
 * Admin: bulk delete unresolved search entries by IDs or query pattern.
 * POST /api/admin/unresolved-search/bulk-delete
 * Body: { ids?: string[]; queryPattern?: string }
 */
export const bulkDeleteUnresolved = async (req: Request, res: Response): Promise<void> => {
  try {
    const { ids, queryPattern } = req.body as { ids?: string[]; queryPattern?: string };

    if (!ids?.length && !queryPattern) {
      res.status(400).json({ message: 'Provide ids or queryPattern' });
      return;
    }

    let query: Record<string, unknown> = {};
    if (ids?.length) {
      query = { _id: { $in: ids } };
    } else if (queryPattern) {
      // ReDoS hardening: cap length, escape special chars
      const pattern = String(queryPattern).slice(0, 100);
      const safe = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query = { query: { $regex: safe, $options: 'i' } };
    }

    const result = await UnresolvedSearch.deleteMany(query);
    res.json({ message: `Deleted ${result.deletedCount} entries` });
  } catch (err) {
    res.status(500).json({ message: `Bulk delete failed: ${(err as Error).message}` });
  }
};
export const resolveUnresolved = async (req: Request, res: Response): Promise<void> => {
  try {
    const { resolution, faqId } = req.body as {
      resolution: 'faq_updated' | 'community_post_created' | 'dismissed';
      faqId?: string;
    };

    if (!resolution) {
      res.status(400).json({ message: 'resolution is required' });
      return;
    }

    const unresolved = await UnresolvedSearch.findById(req.params.id);
    if (!unresolved) {
      res.status(404).json({ message: 'Not found' });
      return;
    }

    unresolved.status = 'addressed';
    unresolved.resolution = resolution;
    unresolved.resolvedBy = (req.user as any)._id as any;
    await unresolved.save();

    // If faq_updated — optionally link the FAQ for reference
    if (resolution === 'faq_updated' && faqId) {
      // FAQ update acknowledged — nothing else needed, admin updated the FAQ manually
    }

    res.json({ message: 'Marked as addressed' });
  } catch (err) {
    const message = (err as Error).message;
    res.status(500).json({ message: `Failed to resolve: ${message}` });
  }
};

/**
 * Analytics: get counts for dashboard.
 * GET /api/admin/unresolved-stats
 */
export const getUnresolvedStats = async (_req: Request, res: Response): Promise<void> => {
  try {
    const pending = await UnresolvedSearch.countDocuments({ status: 'pending' });
    const total = await UnresolvedSearch.countDocuments();
    const addressed = await UnresolvedSearch.countDocuments({ status: 'addressed' });

    // Top problematic queries (most complained about)
    const topQueries = await UnresolvedSearch.aggregate([
      { $match: { status: 'pending' } },
      { $group: { _id: '$query', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    res.json({ pending, total, addressed, topQueries });
  } catch (err) {
    const message = (err as Error).message;
    res.status(500).json({ message: `Failed: ${message}` });
  }
};
