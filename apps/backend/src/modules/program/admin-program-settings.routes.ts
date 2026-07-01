import { Router } from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import { upsertProgramSettings } from './admin-program-settings.controller.js';

const router = Router();

// v1.69 — admin "Set the look" action lives at
// /api/admin/programs/:id/settings. Upsert (creates if missing).
router.put('/:id/settings', protect, authorize('admin', 'moderator'), upsertProgramSettings);

export default router;
