/**
 * documents.ts — routes for the OCR / document pipeline.
 *
 * User-facing reads: own uploads + own insights
 * Admin-facing: insight review queue + manual promote triggers
 *
 * Mounted in server.ts as `/api/documents` (user) and
 * `/api/admin/documents` (admin).
 */

import { Router } from 'express';
import { protect, authorize } from '../middleware/auth.js';
import {
  uploadDocument,
  uploadMiddleware,
  listMyDocuments,
  getDocument,
  listDocumentInsights,
  listPendingInsights,
  reviewInsight,
  promotePopularNow,
} from '../controllers/documentController.js';

const router = Router();

// ─── User-facing ──────────────────────────────────────────────────────────────

// POST /api/documents/upload — multipart/form-data
// Note: uploadMiddleware is [multer.single, rateLimiter], wired
// here in order so the rate limiter sees the parsed file.
router.post('/upload', protect, ...uploadMiddleware, uploadDocument);

router.get('/my',           protect, listMyDocuments);
router.get('/:id/insights', protect, listDocumentInsights);
router.get('/:id',          protect, getDocument);

// ─── Admin-facing ─────────────────────────────────────────────────────────────

const adminRouter = Router();

adminRouter.use(protect, authorize('admin', 'moderator'));

adminRouter.get('/insights',                         listPendingInsights);
adminRouter.patch('/insights/:id',                   reviewInsight);
adminRouter.post('/insights/promote-popular',       promotePopularNow);

export { router as documentRouter, adminRouter as documentAdminRouter };
