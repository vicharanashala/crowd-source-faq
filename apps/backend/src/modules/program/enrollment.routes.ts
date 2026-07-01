/**
 * v1.69 — Enrollment routes.
 *
 * Wires the enrollment controller to Express. The path shape
 * follows the multi-program plan:
 *   /api/me/programs                              — current user's enrollments
 *   /api/programs/:batchId/self-enroll            — user joins themselves
 *   /api/programs/:batchId/members                — admin lists / adds members
 *   /api/programs/:batchId/members/:userId        — admin updates / removes
 *
 * Every program-scoped route uses the `programScope` middleware
 * to validate `req.programContext`. Admin-only routes are
 * additionally guarded by `authorize('admin', 'moderator')`.
 *
 * Auth note: global moderators (User.role === 'moderator') can
 * manage enrollment too — this is a per-program-flavored
 * permission, not a hard admin-only one. Phase 7 will tighten
 * this to require a per-program enrollment of role moderator.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { protect, authorize } from '../../middleware/auth.js';
import { programScope } from '../../middleware/programScope.js';
import {
  getMyPrograms,
  selfEnroll,
  getProgramMembers,
  enrollUser,
  updateProgramRole,
  removeEnrollment,
} from './enrollment.controller.js';

const router = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests.' },
});

// ── User-self routes ─────────────────────────────────────────────────────

// List the current user's enrollments. No batchId required.
router.get('/me/programs', protect, getMyPrograms);

// Self-enroll in a program. Program context validated by middleware.
router.post(
  '/programs/:batchId/self-enroll',
  protect,
  limiter,
  programScope({ required: true }),
  selfEnroll,
);

// ── Admin (or moderator) routes ───────────────────────────────────────────

// List members of a program. Soft-deleted ones excluded.
router.get(
  '/programs/:batchId/members',
  protect,
  authorize('admin', 'moderator'),
  limiter,
  programScope({ required: true }),
  getProgramMembers,
);

// Admin enrolls a user. Idempotent: re-enrolls an inactive row.
router.post(
  '/programs/:batchId/members',
  protect,
  authorize('admin', 'moderator'),
  limiter,
  programScope({ required: true }),
  enrollUser,
);

// Admin changes a member's role.
router.patch(
  '/programs/:batchId/members/:userId',
  protect,
  authorize('admin', 'moderator'),
  limiter,
  programScope({ required: true }),
  updateProgramRole,
);

// Admin removes a member. Soft by default; ?hard=true to actually delete.
router.delete(
  '/programs/:batchId/members/:userId',
  protect,
  authorize('admin', 'moderator'),
  limiter,
  programScope({ required: true }),
  removeEnrollment,
);

export default router;
