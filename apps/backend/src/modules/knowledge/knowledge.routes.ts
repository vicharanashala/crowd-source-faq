import { Router } from 'express';
import { protect } from '../../middleware/auth.js';
import { authorize } from '../../middleware/auth.js';
import { validateObjectId } from '../../middleware/validateObjectId.js';
import {
  listKnowledge,
  approveKnowledge,
  rejectKnowledge,
  promoteToFAQ,
  processHighUpvotePosts,
  triggerMeetingProcess,
  answerFromKnowledgeController,
} from './knowledge.controller.js';

const router = Router();

// All routes require admin
router.use(protect, authorize('admin'));

// GET /api/knowledge — list all knowledge entries
router.get('/', listKnowledge);

// POST /api/knowledge/process-upvotes — scan high-upvote posts
router.post('/process-upvotes', processHighUpvotePosts);

// M4-3 (cross-cutting Pattern A) fix: validate `:id` so a malformed
// id returns 400 instead of triggering a CastError → 500 inside the
// controllers' `findById` calls.
router.post('/process-meeting/:id', validateObjectId('id'), triggerMeetingProcess);
router.post('/answer-from-knowledge/:postId', validateObjectId('postId'), answerFromKnowledgeController);
router.put('/:id/approve', validateObjectId('id'), approveKnowledge);
router.put('/:id/reject', validateObjectId('id'), rejectKnowledge);
router.put('/:id/promote', validateObjectId('id'), promoteToFAQ);

export default router;