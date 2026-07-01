/**
 * v1.69 — Phase 9: per-program app settings admin route.
 * Mounts at /api/admin/programs/:id/settings.
 *
 * PUT  /api/admin/programs/:id/settings
 *      body: { key, value }
 *      Stores a per-program override in ProgramConfig.appSettings.
 *      The next getProgramAppSettings(batchId) returns the
 *      override; missing keys fall through to the global
 *      AppSetting singleton.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { protect, authorize } from '../../middleware/auth.js';
import { adminUpdatePerProgramSetting } from './app-settings.controller.js';

const router = Router({ mergeParams: true });

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many settings changes. Try again later.' },
});

router.put(
  '/:id/settings',
  protect,
  authorize('admin', 'moderator'),
  limiter,
  adminUpdatePerProgramSetting,
);

export default router;
