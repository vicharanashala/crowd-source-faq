/**
 * adminAutoAnswer.ts — Admin routes for AI auto-answer queue management.
 *
 * GET  /admin/auto-answer/queue         — list all suggested/escalated posts
 * POST /admin/community/auto-answer     — trigger auto-answer (manual run)
 * PATCH /admin/auto-answer/:postId      — approve / reject / escalate an answer
 */
import { Router } from 'express';
import {
  getAutoAnswerQueue,
  reviewAutoAnswer,
  runAutoAnswer,
} from '../ai/auto-answer.controller.js';
import { protect } from '../../middleware/auth.js';
import { authorize } from '../../middleware/authShared.js';

const router = Router();

router.use(protect);
router.use(authorize('admin', 'moderator'));

router.get('/auto-answer/queue', getAutoAnswerQueue);
router.post('/community/auto-answer', runAutoAnswer);
router.patch('/auto-answer/:postId', reviewAutoAnswer);

export default router;