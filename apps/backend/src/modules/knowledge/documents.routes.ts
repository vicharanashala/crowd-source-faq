/**
 * documents.ts — routes for the OCR / document pipeline.
 *
 * v1.68 — uploads are now ADMIN/MODERATOR only. Previously
 * any authed user could upload; the platform was treated
 * like a community wiki. The review queue at
 * /admin/document-insights handles the resulting insights,
 * but the upload itself is a moderation/curation action
 * and should only be available to admins and moderators.
 *
 * User-facing reads: own uploads + own insights
 * Admin-facing: insight review queue + manual promote triggers
 *
 * Mounted in server.ts as `/api/documents` (user) and
 * `/api/admin/documents` (admin).
 */

import { Router } from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import { validateObjectId } from '../../middleware/validateObjectId.js';
import {
  uploadDocument,
  uploadMiddleware,
  listMyDocuments,
  getDocument,
  listDocumentInsights,
  listPendingInsights,
  reviewInsight,
  promotePopularNow,
} from './document.controller.js';

const router = Router();

// ─── Admin / Moderator only ──────────────────────────────────────────────
// v1.68 — uploads are now restricted. The `authorize` middleware
// returns 403 for any role not in the list. Keeps the existing
// user-facing read endpoints (listMyDocuments, getDocument,
// listDocumentInsights) under plain `protect` so a regular
// user can still see the upload history for their own account.
router.use(protect);

// POST /api/documents/upload — multipart/form-data
// Note: uploadMiddleware is [multer.single, rateLimiter], wired
// here in order so the rate limiter sees the parsed file.
// v1.68 — admin/moderator only (was: any authed user).
router.post('/upload', authorize('admin', 'moderator'), ...uploadMiddleware, uploadDocument);

router.get('/my',           protect, listMyDocuments);
// M4-3 (cross-cutting Pattern A) fix: validate `:id` so a
// malformed id returns 400 instead of triggering a CastError
// → 500 inside `getDocument` / `listDocumentInsights`.
router.get('/:id/insights', protect, validateObjectId('id'), listDocumentInsights);
router.get('/:id',          protect, validateObjectId('id'), getDocument);

// ─── Admin-facing ─────────────────────────────────────────────────────────────

const adminRouter = Router();

adminRouter.use(protect, authorize('admin', 'moderator'));

adminRouter.get('/insights',                         listPendingInsights);
adminRouter.patch('/insights/:id',                   validateObjectId('id'), reviewInsight);
adminRouter.post('/insights/promote-popular',       promotePopularNow);

export { router as documentRouter, adminRouter as documentAdminRouter };
