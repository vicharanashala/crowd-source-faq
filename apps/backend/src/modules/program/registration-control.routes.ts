/**
 * routes/registrationControl.ts — admin endpoints for the v1.70
 * controlled-registration feature. Mounted at /api/admin/registration-config.
 *
 * Role gate: `admin` only — not moderator, not ai_moderator.
 * Per spec ("Only super-admin role can change it"), `admin` is the
 * closest existing role in the UserRole enum.
 */

import { Router } from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import {
  adminGetRegistrationConfig,
  adminUpdateRegistrationConfig,
  adminRegenerateInviteToken,
} from './registration-control.controller.js';

const router = Router();

router.use(protect);
router.get('/',           authorize('admin'), adminGetRegistrationConfig);
router.patch('/',         authorize('admin'), adminUpdateRegistrationConfig);
router.post('/regenerate-token', authorize('admin'), adminRegenerateInviteToken);

export default router;