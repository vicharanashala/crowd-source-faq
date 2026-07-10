import { Router } from 'express';
import { getDailyProgress } from '../controllers/userProgressController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

// GET /api/user/daily-progress — Get user's personalized daily progress dashboard
router.get('/daily-progress', protect, getDailyProgress);

export default router;