import { Router } from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import {
  listFeatureFlags,
  toggleFeatureFlag,
} from './feature-flag.controller.js';

const router = Router();

// v1.69 P1 — the public landing page needs the flag state to decide
// which UI affordances to render before the user has logged in, so the
// GET endpoint must be reachable without a token. The handler returns
// only the resolved feature list (no admin-only keys), so this is safe.
// Mutating routes (PATCH/POST/DELETE) still require an admin/mod token.
router.get('/', listFeatureFlags);
router.patch('/:key', protect, authorize('admin', 'moderator'), toggleFeatureFlag);

export default router;
