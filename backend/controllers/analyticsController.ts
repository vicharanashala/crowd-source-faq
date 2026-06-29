import { Request, Response } from 'express';
import mongoose from 'mongoose';
// v1.69 — Phase 3g: program-scope the analytics reads.
import { withProgramScope } from '../utils/db/scopedQuery.js';
import SearchLog from '../models/SearchLog.js';
import FAQ from '../models/FAQ.js';

interface PopularQuery {
  query: string;
  count: number;
  lastSearched: Date;
}

interface FailedQuery {
  query: string;
  count: number;
  lastSearched: Date;
}

function requireAdminOrMod(req: Request, res: Response): boolean {
  const role = (req as any).user?.role as string | undefined;
  if (role !== 'admin' && role !== 'moderator') {
    res.status(403).json({ message: 'Admin or moderator access required' });
    return false;
  }
  return true;
}

/**
 * Validates the batchId query parameter.
 * Returns:
 * - mongoose.Types.ObjectId: if a valid batchId string is provided
 * - null: if batchId is not provided (allowing global/unscoped operations)
 * - undefined: if validation failed (a 400 Bad Request response has been sent)
 */
function parseAndValidateBatchId(req: Request, res: Response): mongoose.Types.ObjectId | null | undefined {
  const batchIdParam = req.query.batchId;
  
  if (batchIdParam === undefined) {
    return null;
  }

  if (typeof batchIdParam !== 'string') {
    res.status(400).json({ message: 'Invalid batchId: parameter must be a single string' });
    return undefined;
  }

  if (!mongoose.Types.ObjectId.isValid(batchIdParam)) {
    res.status(400).json({ message: 'Invalid batchId: must be a valid 24-character hex string' });
    return undefined;
  }

  return new mongoose.Types.ObjectId(batchIdParam);
}

// GET /api/analytics/failed-queries — Top 30 failed queries from last 7 days (Admin/Moderator only)
export const getFailedQueries = async (req: Request, res: Response): Promise<void> => {
  if (!requireAdminOrMod(req, res)) return;
  const batchIdObj = parseAndValidateBatchId(req, res);
  if (batchIdObj === undefined) return;

  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const failedQueries = await SearchLog.aggregate([
      { $match: withProgramScope({ resultsCount: 0, createdAt: { $gte: sevenDaysAgo } }, batchIdObj) },
      {
        $group: {
          _id: { $toLower: '$query' },
          count: { $sum: 1 },
          lastSearched: { $max: '$createdAt' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 30 },
      {
        $project: {
          _id: 0,
          query: '$_id',
          count: 1,
          lastSearched: 1,
        },
      },
    ]);

    res.json({ queries: failedQueries });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/analytics — Fetch search log analytics (Admin/Moderator only)
export const getSearchAnalytics = async (req: Request, res: Response): Promise<void> => {
  if (!requireAdminOrMod(req, res)) return;
  const batchIdObj = parseAndValidateBatchId(req, res);
  if (batchIdObj === undefined) return;

  try {
    const totalSearches = await SearchLog.countDocuments(withProgramScope({}, batchIdObj));

    const popularQueries: PopularQuery[] = await SearchLog.aggregate([
      ...(batchIdObj ? [{ $match: { batchId: batchIdObj } }] : []),
      {
        $group: {
          _id: { $toLower: '$query' },
          count: { $sum: 1 },
          lastSearched: { $max: '$createdAt' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
      {
        $project: {
          _id: 0,
          query: '$_id',
          count: 1,
          lastSearched: 1,
        },
      },
    ]);

    const failedQueries: FailedQuery[] = await SearchLog.aggregate([
      { $match: withProgramScope({ resultsCount: 0 }, batchIdObj) },
      {
        $group: {
          _id: { $toLower: '$query' },
          count: { $sum: 1 },
          lastSearched: { $max: '$createdAt' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 20 },
      {
        $project: {
          _id: 0,
          query: '$_id',
          count: 1,
          lastSearched: 1,
        },
      },
    ]);

    res.json({ totalSearches, popularQueries, failedQueries });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/analytics/summary — Fetch summary metrics for KPI cards
export const getSummary = async (req: Request, res: Response): Promise<void> => {
  if (!requireAdminOrMod(req, res)) return;
  const batchIdObj = parseAndValidateBatchId(req, res);
  if (batchIdObj === undefined) return;

  try {
    const days = parseInt(req.query.days as string) || 30;
    const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [
      totalFaqs,
      approvedFaqs,
      totalSearches,
      failedSearches,
      uniqueUsersResult
    ] = await Promise.all([
      FAQ.countDocuments(withProgramScope({}, batchIdObj)),
      FAQ.countDocuments(withProgramScope({ status: 'approved' }, batchIdObj)),
      SearchLog.countDocuments(withProgramScope({ createdAt: { $gte: fromDate } }, batchIdObj)),
      SearchLog.countDocuments(withProgramScope({ resultsCount: 0, createdAt: { $gte: fromDate } }, batchIdObj)),
      SearchLog.aggregate([
        { $match: withProgramScope({ createdAt: { $gte: fromDate }, userId: { $ne: null } }, batchIdObj) },
        { $group: { _id: '$userId' } },
        { $count: 'count' }
      ])
    ]);

    const uniqueUsers = uniqueUsersResult[0]?.count ?? 0;
    const searchSuccessRate = totalSearches > 0
      ? parseFloat(((totalSearches - failedSearches) / totalSearches * 100).toFixed(1))
      : 0;

    res.json({
      totalFaqs,
      approvedFaqs,
      totalSearches,
      failedSearches,
      uniqueUsers,
      searchSuccessRate
    });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/analytics/trends — Fetch daily search trends
export const getTrends = async (req: Request, res: Response): Promise<void> => {
  if (!requireAdminOrMod(req, res)) return;
  const batchIdObj = parseAndValidateBatchId(req, res);
  if (batchIdObj === undefined) return;

  try {
    const days = parseInt(req.query.days as string) || 30;
    const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const matchFilter = withProgramScope({ createdAt: { $gte: fromDate } }, batchIdObj);

    const searchActivity = await SearchLog.aggregate([
      { $match: matchFilter },
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
    const err = error as Error;
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/analytics/category-distribution — Fetch FAQ distribution by category
export const getCategoryDistribution = async (req: Request, res: Response): Promise<void> => {
  if (!requireAdminOrMod(req, res)) return;
  const batchIdObj = parseAndValidateBatchId(req, res);
  if (batchIdObj === undefined) return;

  try {
    const categoryStats = await FAQ.aggregate([
      { $match: withProgramScope({ status: 'approved' }, batchIdObj) },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          views: { $sum: { $add: ['$views', '$guestViewCount'] } },
        },
      },
      {
        $project: {
          category: '$_id',
          count: 1,
          views: 1,
          _id: 0,
        },
      },
      { $sort: { count: -1 } },
    ]);

    res.json(categoryStats);
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};