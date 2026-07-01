/**
 * v1.69 — Phase 6: per-program Discord admin routes.
 *
 * Wires programDiscordController to Express. Mounted at
 * /api/admin/programs alongside the existing per-program
 * ProgramSettings and Zoom admin routes.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { protect, authorize } from '../../middleware/auth.js';
import {
  getProgramDiscordConfigRoute,
  upsertProgramDiscordConfig,
  disableProgramDiscordConfig,
  enableProgramDiscordConfig,
} from './program-discord.controller.js';

const router = Router({ mergeParams: true });

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many Discord config changes. Try again later.' },
});

router.get(
  '/:id/discord',
  protect,
  authorize('admin'),
  limiter,
  getProgramDiscordConfigRoute,
);

router.put(
  '/:id/discord',
  protect,
  authorize('admin'),
  limiter,
  upsertProgramDiscordConfig,
);

router.post(
  '/:id/discord/enable',
  protect,
  authorize('admin'),
  limiter,
  enableProgramDiscordConfig,
);

router.post(
  '/:id/discord/disable',
  protect,
  authorize('admin'),
  limiter,
  disableProgramDiscordConfig,
);

export default router;
