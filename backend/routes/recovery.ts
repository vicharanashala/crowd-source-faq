import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { programScope } from '../middleware/programScope.js';
import { getLatestRecovery } from '../controllers/recoveryController.js';

const router = Router();

// GET /api/recovery/latest — retrieve missed session recovery details
router.get('/latest', protect, programScope({ required: false }), getLatestRecovery);

export default router;
