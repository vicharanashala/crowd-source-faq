import express from 'express';
import { listInternshipProgress, updateInternshipPhase } from './internship.controller.js';
import { protect } from '../../middleware/auth.js';
import { adminOnly } from '../../middleware/admin.js';

const router = express.Router();

router.use(protect);
router.use(adminOnly);

router.get('/', listInternshipProgress);
router.put('/:userId', updateInternshipPhase);

export default router;
