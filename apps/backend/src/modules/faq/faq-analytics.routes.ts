import { Router } from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import {
  getFaqAnalyticsSummary,
  getFaqAnalyticsMostViewed,
  getFaqAnalyticsNeedsImprovement,
  getFaqAnalyticsRecentComments
} from './faq-analytics.controller.js';

const router = Router();

router.use(protect, authorize('admin'));

router.get('/summary', getFaqAnalyticsSummary);
router.get('/most-viewed', getFaqAnalyticsMostViewed);
router.get('/needs-improvement', getFaqAnalyticsNeedsImprovement);
router.get('/recent-comments', getFaqAnalyticsRecentComments);

export default router;
