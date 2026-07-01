import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { protect, authorize } from '../../middleware/auth.js';
import {
  listPublicBatches,
  listAdminBatches,
  getBatch,
  getBatchBySlug,
  setDefaultBatch,
  createBatch,
  updateBatch,
  archiveBatch,
  deleteBatch,
} from './batch.controller.js';

const router = Router();

// Soft cap on the public list — same shape as the other public reads
const listLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests.' },
});

// ─── Public ────────────────────────────────────────────────────────────────

router.get('/', listLimiter, listPublicBatches);
// v1.69 — slug-routed program page. Slug is auto-derived from
// `name` (see Batch.slugifyProgramName). Mounted BEFORE the `/:id`
// route so it isn't shadowed.
router.get('/by-slug/:slug', listLimiter, getBatchBySlug);

// ─── Admin (guarded) ───────────────────────────────────────────────────────

router.get('/admin/all', protect, authorize('admin', 'moderator'), listAdminBatches);
router.get('/:id', listLimiter, getBatch);
router.post('/', protect, authorize('admin', 'moderator'), createBatch);
router.patch('/:id', protect, authorize('admin', 'moderator'), updateBatch);
router.post('/:id/archive', protect, authorize('admin', 'moderator'), archiveBatch);
// v1.69 — "Set as default" action. Clears the flag on every other
// batch and sets it on this one.
router.post('/:id/default', protect, authorize('admin', 'moderator'), setDefaultBatch);
router.delete('/:id', protect, authorize('admin', 'moderator'), deleteBatch);

export default router;
