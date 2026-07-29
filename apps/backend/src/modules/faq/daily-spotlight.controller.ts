import { Request, Response } from 'express';
import FAQ from './faq.model.js';
import { withProgramScope } from '../../utils/db/scopedQuery.js';

/**
 * GET /api/faq/daily-spotlight
 *
 * Returns the top 3 approved FAQs sorted by guestViewLast24h (rolling 24h view
 * count already maintained by the public-page aggregation job). Falls back to
 * searchCount if guestViewLast24h is unavailable.
 *
 * Public endpoint — no auth required.
 */
export const getDailySpotlight = async (req: Request, res: Response): Promise<void> => {
  try {
    const selectedBatchId = req.query.batchId === 'all'
      ? null
      : (req.query.batchId as string | undefined || req.programContext?.batchId?.toString());

    const baseFilter = { status: 'approved' };
    const scoped = withProgramScope(baseFilter, selectedBatchId);

    const faqs = await FAQ
      .find(scoped)
      .select('question answer category tags views searchCount guestViewLast24h helpfulVotes createdAt freshnessTier')
      .sort({ guestViewLast24h: -1, searchCount: -1 })
      .limit(3)
      .lean();

    // Attach a human-readable "activity" label for the frontend to display
    const spotlight = faqs.map((faq) => ({
      ...faq,
      viewsToday: (faq as { guestViewLast24h?: number }).guestViewLast24h ?? 0,
    }));

    res.json({
      spotlight,
      generatedAt: new Date().toISOString(),
      message: spotlight.length === 0 ? 'No spotlight data yet.' : undefined,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: (error as Error).message });
  }
};
