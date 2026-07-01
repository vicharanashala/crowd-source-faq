import { Router } from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import {
  listFeatureFlags,
  toggleFeatureFlag,
} from './feature-flag.controller.js';

const router = Router();

// Any authenticated user can READ the flag state (frontend uses it to
// decide whether to render the feature). Only admins can flip it.
router.get('/', protect, listFeatureFlags);
router.patch('/:key', protect, authorize('admin', 'moderator'), toggleFeatureFlag);

export default router;
