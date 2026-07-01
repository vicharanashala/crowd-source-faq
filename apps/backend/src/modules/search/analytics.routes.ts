import { Router } from 'express';
import { getSearchAnalytics, getFailedQueries } from './analytics.controller.js';
import { protect, authorize } from '../../middleware/auth.js';

const router = Router();

// GET /api/analytics — Fetch aggregate search logs statistics (Admin/Moderator only)
router.get('/', protect, authorize('admin', 'moderator'), getSearchAnalytics);

// GET /api/analytics/failed-queries — Top 30 failed queries from last 7 days (Admin/Moderator only)
router.get('/failed-queries', protect, authorize('admin', 'moderator'), getFailedQueries);

export default router;