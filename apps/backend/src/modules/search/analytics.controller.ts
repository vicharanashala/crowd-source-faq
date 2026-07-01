import { Request, Response } from 'express';
// v1.69 — Phase 3g: program-scope the analytics reads.
import { withProgramScope } from '../../utils/db/scopedQuery.js';
import SearchLog from './search-log.model.js';

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

// GET /api/analytics/failed-queries — Top 30 failed queries from last 7 days (Admin/Moderator only)
export const getFailedQueries = async (req: Request, res: Response): Promise<void> => {
  if (!requireAdminOrMod(req, res)) return;
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const batchIdParam = (req.query.batchId as string | undefined) ?? null;
    const failedQueries = await SearchLog.aggregate([
      { $match: withProgramScope({ resultsCount: 0, createdAt: { $gte: sevenDaysAgo } }, batchIdParam) },
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
  try {
    const batchIdParam = (req.query.batchId as string | undefined) ?? null;
    const totalSearches = await SearchLog.countDocuments(withProgramScope({}, batchIdParam));

    const popularQueries: PopularQuery[] = await SearchLog.aggregate([
      ...(batchIdParam ? [{ $match: { batchId: new (await import('mongoose')).Types.ObjectId(batchIdParam) } }] : []),
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
      { $match: withProgramScope({ resultsCount: 0 }, batchIdParam) },
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