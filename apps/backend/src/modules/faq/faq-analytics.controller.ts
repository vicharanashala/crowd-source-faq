import { Request, Response } from 'express';
import FAQ from './faq.model.js';
import FaqFeedback from './faq-feedback.model.js';
import { communityLog } from '../../utils/http/logger.js';
import { Types } from 'mongoose';

// ─── GET /api/admin/faq-analytics/summary ───────────────────────────────────
export async function getFaqAnalyticsSummary(req: Request, res: Response): Promise<void> {
  try {
    const totalFaqs = await FAQ.countDocuments({ status: 'approved' });
    const totalFeedback = await FaqFeedback.countDocuments({});
    const helpfulCount = await FaqFeedback.countDocuments({ isHelpful: true });
    const notHelpfulCount = totalFeedback - helpfulCount;
    
    const helpfulRate = totalFeedback > 0 ? (helpfulCount / totalFeedback) * 100 : 0;

    res.json({
      totalFaqs,
      totalFeedback,
      helpfulCount,
      notHelpfulCount,
      helpfulRate: parseFloat(helpfulRate.toFixed(1))
    });
  } catch (err) {
    communityLog.error(`[FaqAnalytics] getSummary failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load summary analytics.' });
  }
}

// ─── GET /api/admin/faq-analytics/most-viewed ───────────────────────────────
export async function getFaqAnalyticsMostViewed(req: Request, res: Response): Promise<void> {
  try {
    const faqs = await FAQ.find({ status: 'approved' })
      .select('question guestViewCount')
      .sort({ guestViewCount: -1 })
      .limit(5)
      .lean();

    res.json(faqs);
  } catch (err) {
    communityLog.error(`[FaqAnalytics] getMostViewed failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load most viewed FAQs.' });
  }
}

// ─── GET /api/admin/faq-analytics/needs-improvement ─────────────────────────
export async function getFaqAnalyticsNeedsImprovement(req: Request, res: Response): Promise<void> {
  try {
    const faqs = await FAQ.find({ status: 'approved', unhelpfulVotes: { $gt: 0 } })
      .select('question unhelpfulVotes')
      .sort({ unhelpfulVotes: -1 })
      .limit(5)
      .lean();

    res.json(faqs);
  } catch (err) {
    communityLog.error(`[FaqAnalytics] getNeedsImprovement failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load needs improvement FAQs.' });
  }
}

// ─── GET /api/admin/faq-analytics/recent-comments ───────────────────────────
export async function getFaqAnalyticsRecentComments(req: Request, res: Response): Promise<void> {
  try {
    const feedbacks = await FaqFeedback.find({ comments: { $nin: [null, ''] } })
      .select('comments reason createdAt isHelpful faqId')
      .populate('faqId', 'question')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.json(feedbacks);
  } catch (err) {
    communityLog.error(`[FaqAnalytics] getRecentComments failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load recent comments.' });
  }
}
