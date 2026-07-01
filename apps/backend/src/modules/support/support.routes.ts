import { Router } from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import {
  getTroubleshootSteps,
  createSupportRequest,
  listSupportRequests,
  getSupportRequest,
  selfDeleteSupportRequest,
} from './support-requests.controller.js';
import { addSupportFollowUp, updateSupportStatus } from './support-follow-up.controller.js';
import { listGuidance, updateGuidance } from './support-guidance.controller.js';
import { getSupportAnalytics } from './support-analytics.controller.js';
import {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  addField,
  updateField,
  archiveField,
} from './support-categories.controller.js';
import {
  convertToGolden,
  unconverGolden,
  awardSpurtiPointsAdmin,
  getMySpurtiPoints,
  getGoldenQueue,
} from './support-golden.controller.js';
import { createIdentityLimiter } from '../../utils/auth/rateLimit.js';

const router = Router();

// Submission is the only path that needs throttling — it's the
// most-likely abuse vector. Read endpoints are cheap.
const submitLimiter = createIdentityLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyPrefix: 'rl_support_submit',
  message: 'You are submitting support requests too frequently. Please wait an hour.',
});

const replyLimiter = createIdentityLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  keyPrefix: 'rl_support_reply',
  message: 'You are replying too quickly. Please slow down.',
});

// ─── Public (gated by feature flag inside the controller) ──────────────────

// Auth: every endpoint requires a logged-in user. The feature flag
// check happens inside each handler so the 404 response shape is
// consistent.
router.use(protect);

// Issue-type guidance (no flag gate — admins need to see it even
// when the feature is off, for inspection).
router.get('/guidance',           authorize('admin', 'moderator'), listGuidance);
router.put('/guidance/:issueType', authorize('admin', 'moderator'), updateGuidance);

// Admin analytics (also un-gated, admin only).
router.get('/analytics', authorize('admin', 'moderator'), getSupportAnalytics);

// Troubleshoot checklist (gated by flag).
router.get('/troubleshoot/:issueType', getTroubleshootSteps);

// Requests (gated by flag).
router.post('/requests',                    submitLimiter, createSupportRequest);
router.get('/requests',                     listSupportRequests);
router.get('/requests/:id',                 getSupportRequest);
router.post('/requests/:id/follow-ups',     replyLimiter,   addSupportFollowUp);

// Status update (gated by flag, admin only).
router.patch('/requests/:id/status', authorize('admin', 'moderator'), updateSupportStatus);

// v1.65 — Self-delete: student removes their own ticket (gated by
// flag). 10-minute cooldown + state guard are enforced inside the
// controller. Admin can still moderate via the PATCH /status route.
router.delete('/requests/:id', selfDeleteSupportRequest);

// v1.65 — Public Escalation Queue for the new Golden Ticket page.
// v1.65.1 — Golden Ticket is its own experimental feature flag. The
// flag check runs INSIDE the controller (not as route-level
// middleware) because `requireFeatureOn` is async and the previous
// route-level call dropped the promise, causing the request to hang
// and the frontend to stay on "Loading…". The admin
// convert/award-sp endpoints below stay ungated — admins can still
// inspect and convert tickets even when the user flow is off, same
// as the category-CRUD pattern.
router.get('/golden/queue',                       getGoldenQueue);

// ─── Golden Ticket (v1.65, additive) ─────────────────────────────────────
// Admin actions: convert existing ticket to Golden (debits SP if a
// cost is provided), roll back a conversion (refunds SP), award SP
// to a user. The convert / unconver routes reuse the same auth gate
// as the status update — admin or moderator only.
router.post('/requests/:id/convert-to-golden',   authorize('admin', 'moderator'), convertToGolden);
router.post('/requests/:id/unconvert-golden',   authorize('admin', 'moderator'), unconverGolden);
router.post('/users/:userId/award-sp',          authorize('admin', 'moderator'), awardSpurtiPointsAdmin);

// Self-service: any authed user can read their own SP balance (used
// by the navbar chip / profile card). Gated by the goldenTicket flag
// inside the controller — see note on /golden/queue above.
router.get('/me/sp',                              getMySpurtiPoints);

// Category CRUD (admin only — not gated by the feature flag, admins
// should be able to inspect / edit categories even when the feature
// is off for users).
router.get('/categories',                          authorize('admin', 'moderator'), listCategories);
router.get('/categories/:issueType',              authorize('admin', 'moderator'), getCategory);
router.post('/categories',                         authorize('admin', 'moderator'), createCategory);
router.patch('/categories/:issueType',             authorize('admin', 'moderator'), updateCategory);
router.delete('/categories/:issueType',          authorize('admin', 'moderator'), deleteCategory);
router.post('/categories/:issueType/fields',      authorize('admin', 'moderator'), addField);
router.patch('/categories/:issueType/fields/:fieldKey', authorize('admin', 'moderator'), updateField);
router.delete('/categories/:issueType/fields/:fieldKey', authorize('admin', 'moderator'), archiveField);

export default router;
