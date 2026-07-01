/**
 * routes/appSettings.ts — admin-editable global app settings.
 *
 * v1.65 — Golden Ticket configurable cooldown + penalty multiplier.
 * Public-safe subset is exposed for the frontend to compute the
 * cooldown countdown copy without admin-only auth.
 *
 * Mounted in server.ts as TWO routers:
 *   /api/admin/settings    (admin only)
 *   /api/public/settings   (any authed user)
 *
 * Routes:
 *   GET  /api/admin/settings    (admin only)
 *   PUT  /api/admin/settings    (admin only, body: { key, value })
 *   GET  /api/public/settings   (any authed user)
 */

import { Router } from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import {
  adminGetSettings,
  adminUpdateSetting,
  publicGetSettings,
} from './app-settings.controller.js';

// Admin router — /api/admin/settings
export const adminRouter = Router();
adminRouter.use(protect);
adminRouter.get('/',    authorize('admin', 'moderator'), adminGetSettings);
adminRouter.put('/',    authorize('admin', 'moderator'), adminUpdateSetting);

// Public router — /api/public/settings (any authed user)
export const publicRouter = Router();
publicRouter.use(protect);
publicRouter.get('/',   publicGetSettings);
