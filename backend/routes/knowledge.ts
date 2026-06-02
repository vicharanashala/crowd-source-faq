import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { authorize } from '../middleware/auth.js';
import {
  listKnowledge,
  approveKnowledge,
  rejectKnowledge,
  promoteToFAQ,
  processHighUpvotePosts,
  triggerMeetingProcess,
} from '../controllers/knowledgeController.js';

const router = Router();

// All routes require admin
router.use(protect, authorize('admin'));

// GET /api/knowledge — list all knowledge entries
router.get('/', listKnowledge);

// POST /api/knowledge/process-upvotes — scan high-upvote posts
router.post('/process-upvotes', processHighUpvotePosts);

// POST /api/knowledge/process-meeting/:id — extract knowledge from a specific meeting
router.post('/process-meeting/:id', triggerMeetingProcess);

// PUT /api/knowledge/:id/approve — approve a knowledge entry
router.put('/:id/approve', approveKnowledge);

// PUT /api/knowledge/:id/reject — reject a knowledge entry
router.put('/:id/reject', rejectKnowledge);

// PUT /api/knowledge/:id/promote — promote a knowledge entry to FAQ
router.put('/:id/promote', promoteToFAQ);

export default router;