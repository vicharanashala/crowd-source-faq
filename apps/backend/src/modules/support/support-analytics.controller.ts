/**
 * supportAnalyticsController.ts — Admin summary of support tickets.
 *
 * Routes (from routes/support.ts):
 *   GET /api/support/analytics
 *
 * Admin-only. NOT gated by the Session Support feature flag.
 */

import { Request, Response } from 'express';
import SupportRequest, {
  type SupportIssueType,
  type SupportStatus,
} from './support-request.model.js';
import { ISSUE_CONFIGS } from './support-request.model.js';
import { supportLog } from '../../utils/http/logger.js';
import { VALID_STATUSES } from './support-core.controller.js';

interface StatusCount { _id: SupportStatus; count: number }
interface IssueCount { _id: SupportIssueType; count: number }
interface DayCount { _id: string; count: number }
interface TotalCounts {
  total: number;
  resolved: number;
  rejected: number;
  pending: number;
  inReview: number;
  withAttachments: number;
}

/** GET /api/support/analytics — admin summary. */
export async function getSupportAnalytics(_req: Request, res: Response): Promise<void> {
  try {
    const [byStatusRows, byIssueTypeRows, byDayRows, recent, totals] = await Promise.all([
      SupportRequest.aggregate<StatusCount>([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      SupportRequest.aggregate<IssueCount>([
        { $group: { _id: '$issueType', count: { $sum: 1 } } },
      ]),
      SupportRequest.aggregate<DayCount>([
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: -1 } },
        { $limit: 30 },
      ]),
      SupportRequest.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .select('userId userName issueType status createdAt')
        .lean(),
      SupportRequest.aggregate<TotalCounts>([
        {
          $group: {
            _id: null,
            total:            { $sum: 1 },
            resolved:         { $sum: { $cond: [{ $eq: ['$status', 'Resolved'] }, 1, 0] } },
            rejected:         { $sum: { $cond: [{ $eq: ['$status', 'Rejected'] }, 1, 0] } },
            pending:          { $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } },
            inReview:         { $sum: { $cond: [{ $eq: ['$status', 'In Review'] }, 1, 0] } },
            withAttachments:  { $sum: { $cond: [{ $gt: [{ $size: '$followUps' }, 0] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const stats = totals[0] ?? {
      total: 0, resolved: 0, rejected: 0, pending: 0, inReview: 0, withAttachments: 0,
    };

    const byStatus = VALID_STATUSES.reduce<Record<string, number>>((acc, s) => {
      const found = byStatusRows.find((r) => r._id === s);
      acc[s] = found?.count ?? 0;
      return acc;
    }, {});

    const byIssueType = Object.keys(ISSUE_CONFIGS).reduce<Record<string, number>>((acc, k) => {
      const found = byIssueTypeRows.find((r) => r._id === k);
      acc[k] = found?.count ?? 0;
      return acc;
    }, {});

    res.json({
      totals: stats,
      byStatus,
      byIssueType,
      byDay: byDayRows.reverse(), // ascending date order for charts
      recent,
    });
  } catch (err) {
    supportLog.error(`[support] getSupportAnalytics failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load support analytics.' });
  }
}
