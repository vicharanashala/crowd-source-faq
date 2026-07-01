import { Router } from 'express';
import {
  getSearchAnalytics,
  getFailedQueries,
  getSummary,
  getTrends,
  getCategoryDistribution
} from './analytics.controller.js';
import { protect, authorize } from '../../middleware/auth.js';

const router = Router();

// GET /api/analytics — Fetch aggregate search logs statistics (Admin/Moderator only)
router.get('/', protect, authorize('admin', 'moderator'), getSearchAnalytics);

// GET /api/analytics/failed-queries — Top 30 failed queries from last 7 days (Admin/Moderator only)
router.get('/failed-queries', protect, authorize('admin', 'moderator'), getFailedQueries);

// GET /api/analytics/summary — Fetch summary metrics for KPI cards (Admin/Moderator only)
router.get('/summary', protect, authorize('admin', 'moderator'), getSummary);

// GET /api/analytics/trends — Fetch daily search trends (Admin/Moderator only)
router.get('/trends', protect, authorize('admin', 'moderator'), getTrends);

// GET /api/analytics/category-distribution — Fetch FAQ distribution by category (Admin/Moderator only)
router.get('/category-distribution', protect, authorize('admin', 'moderator'), getCategoryDistribution);

export default router;