import { Router } from 'express';
import { adminOnly } from '../../middleware/admin.js';
import { getLeaderboard, createSnapshot } from './leaderboard.controller.js';

const router = Router();

router.get('/', getLeaderboard);
router.post('/snapshot', adminOnly, createSnapshot);

export default router;
