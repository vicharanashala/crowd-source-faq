import { Router } from 'express';
import { adminOnly } from '../../middleware/admin.js';
import { awardPoints, getUserReputation, issueBadge, revokeBadge } from './reputation.controller.js';
import { validateBody, awardPointsSchema, issueBadgeSchema } from '../../utils/auth/validation.js';

const router = Router();

router.use(adminOnly);

router.get('/user/:userId', getUserReputation);
router.post('/points', validateBody(awardPointsSchema), awardPoints);
router.post('/badge/issue', validateBody(issueBadgeSchema), issueBadge);
router.post('/badge/revoke', validateBody(issueBadgeSchema), revokeBadge);

export default router;
