import { Router } from 'express';
import { adminOnly } from '../middleware/admin.js';
import { awardPoints, getUserReputation, issueBadge, revokeBadge, getLeaderboard } from '../controllers/reputationController.js';

const router = Router();

// Public leaderboard — no auth required
router.get('/leaderboard', getLeaderboard);

router.use(adminOnly);

router.get('/user/:userId', getUserReputation);
router.post('/points', awardPoints);
router.post('/badge/issue', issueBadge);
router.post('/badge/revoke', revokeBadge);

export default router;
