import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getSearchAnalytics, getFailedQueries } from './analytics.controller.js';
import { protect, authorize } from '../../middleware/auth.js';
import { programScope, enforceProgramMembership } from '../../middleware/programScope.js';

const router = Router();

// CodeQL fix (js/missing-rate-limiting), surfaced when this PR added an
// authorization check (enforceProgramMembership) to these routes: an
// admin/moderator-only dashboard read, generous enough to not bother a
// real dashboard poll but capped so a compromised/brute-forced session
// can't hammer the aggregate query endlessly.
const analyticsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down.' },
});

// Security fix (2026-09-25): role-gated to admin/moderator globally, but
// a moderator's role wasn't checked against the specific `?batchId=` they
// requested — any moderator could pull another cohort's search analytics.
// programScope + enforceProgramMembership close that (global admins still
// bypass; moderators now need an active enrollment in the requested batch).
const scopeToOwnProgram = [programScope(), enforceProgramMembership()];

// GET /api/analytics — Fetch aggregate search logs statistics (Admin/Moderator only)
router.get('/', analyticsLimiter, protect, authorize('admin', 'moderator'), ...scopeToOwnProgram, getSearchAnalytics);

// GET /api/analytics/failed-queries — Top 30 failed queries from last 7 days (Admin/Moderator only)
router.get('/failed-queries', analyticsLimiter, protect, authorize('admin', 'moderator'), ...scopeToOwnProgram, getFailedQueries);

export default router;