import { Router } from 'express';
import { getAllTimeLeaderboard, getWeeklyLeaderboard } from './leaderboard.controller.js';

const router = Router();

router.get('/all-time', getAllTimeLeaderboard);
router.get('/weekly', getWeeklyLeaderboard);

export default router;