import express from 'express';
import {
  getTimelineSteps,
  createTimelineStep,
  updateTimelineStep,
  deleteTimelineStep,
  reorderTimelineSteps,
  getAuditLog
} from './admin-timeline.controller.js';
import { protect } from '../../middleware/auth.js';
import { adminOnly } from '../../middleware/admin.js';

const router = express.Router();

router.use(protect);
router.use(adminOnly);

router.get('/', getTimelineSteps);
router.post('/', createTimelineStep);
router.put('/reorder', reorderTimelineSteps);
router.put('/:id', updateTimelineStep);
router.delete('/:id', deleteTimelineStep);

// Audit log
router.get('/audit-log', getAuditLog);

export default router;
