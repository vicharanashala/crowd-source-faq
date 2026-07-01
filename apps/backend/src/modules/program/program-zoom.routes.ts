/**
 * v1.69 — Phase 5: per-program Zoom admin routes.
 *
 * Wires programZoomController to Express. Mounted under
 * /api/admin/programs so the admin UI can scope Zoom credentials
 * per program (each program registers its own Zoom Marketplace
 * app, then stores the client_id/secret here).
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { protect, authorize } from '../../middleware/auth.js';
import {
  getProgramZoomConfigRoute,
  upsertProgramZoomConfig,
  disconnectProgramZoom,
} from './program-zoom.controller.js';

const router = Router({ mergeParams: true });

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many Zoom config changes. Try again later.' },
});

router.get(
  '/:id/zoom',
  protect,
  authorize('admin'),
  limiter,
  getProgramZoomConfigRoute,
);

router.put(
  '/:id/zoom',
  protect,
  authorize('admin'),
  limiter,
  upsertProgramZoomConfig,
);

router.post(
  '/:id/zoom/disconnect',
  protect,
  authorize('admin'),
  limiter,
  disconnectProgramZoom,
);

export default router;
