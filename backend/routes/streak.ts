import { Router } from 'express';
import { getStreak } from '../controllers/streakController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

router.get('/', protect, getStreak);

export default router;
