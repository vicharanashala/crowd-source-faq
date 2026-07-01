/**
 * v1.69 — Phase 8: per-program feature flag override routes.
 *
 * Mounts at /api/admin/programs so the admin can flip overrides
 * on a per-program basis. The chain (per-program → global
 * default) lives in featureFlagController.isFeatureEnabled().
 *
 * GET  /api/admin/programs/:id/feature-flags
 *      — list every flag with its resolved value for this program.
 * PUT  /api/admin/programs/:id/feature-flags/:key
 *      — upsert a per-program override.
 * DELETE /api/admin/programs/:id/feature-flags/:key
 *      — remove the per-program override (fall back to global).
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { protect, authorize } from '../../middleware/auth.js';
import {
  listPerProgramFeatureFlags,
  setPerProgramFeatureFlagOverride,
  deletePerProgramFeatureFlagOverride,
} from './feature-flag.controller.js';

const router = Router({ mergeParams: true });

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many feature-flag changes. Try again later.' },
});

router.get(
  '/:id/feature-flags',
  protect,
  authorize('admin'),
  limiter,
  listPerProgramFeatureFlags,
);

router.put(
  '/:id/feature-flags/:key',
  protect,
  authorize('admin'),
  limiter,
  setPerProgramFeatureFlagOverride,
);

router.delete(
  '/:id/feature-flags/:key',
  protect,
  authorize('admin'),
  limiter,
  deletePerProgramFeatureFlagOverride,
);

export default router;
