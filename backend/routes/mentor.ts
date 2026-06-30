import { Router } from 'express';
import { getRecommendations } from '../controllers/mentorController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

router.get('/recommendations', protect, getRecommendations);

export default router;
