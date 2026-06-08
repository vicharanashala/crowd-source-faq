import { Router } from 'express';
import { adminOnly } from '../middleware/admin.js';
import { awardPoints, getUserReputation, issueBadge, revokeBadge, getLeaderboard } from '../controllers/reputationController.js';
import { validateBody, awardPointsSchema, issueBadgeSchema } from '../utils/validation.js';

const router = Router();

// Public leaderboard — no auth required
router.get('/leaderboard', getLeaderboard);

router.use(adminOnly);

router.get('/user/:userId', getUserReputation);
router.post('/points', validateBody(awardPointsSchema), awardPoints);
router.post('/badge/issue', validateBody(issueBadgeSchema), issueBadge);
router.post('/badge/revoke', validateBody(issueBadgeSchema), revokeBadge);

export default router;
