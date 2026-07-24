/**
 * adminAutoAnswer.ts — Admin routes for AI auto-answer queue management.
 *
 * GET  /admin/auto-answer/queue                    — list all suggested/escalated posts (legacy)
 * GET  /admin/auto-answer/queue/paginated          — paginated, status-filterable (Phase 3)
 * POST /admin/community/auto-answer                — trigger auto-answer (manual run)
 * PATCH /admin/auto-answer/:postId                 — legacy approve / reject / escalate
 * POST /admin/auto-answer/:postId/approve          — Phase 3: set status=answered, answer=aiAnswer
 * POST /admin/auto-answer/:postId/approve-edit     — Phase 3: set answer, write ProgramKnowledge admin_corrected
 * POST /admin/auto-answer/:postId/reject           — Phase 3: clear aiAnswer, status=rejected
 * POST /admin/auto-answer/:postId/ask-ai-again     — Phase 3: re-run pipeline with augmented context
 * GET  /admin/auto-answer/:postId/context          — Phase 4: drill-down into persisted aiContext
 */
import { Router } from 'express';
import {
  getAutoAnswerQueue,
  reviewAutoAnswer,
  runAutoAnswer,
} from '../ai/auto-answer.controller.js';
import {
  approveAutoAnswer,
  approveEditAutoAnswer,
  rejectAutoAnswer,
  askAiAgain,
  getAutoAnswerQueuePaginated,
  getAutoAnswerContext,
} from './adminAutoAnswerReview.controller.js';
import { protect } from '../../middleware/auth.js';
import { authorize } from '../../middleware/authShared.js';

const router = Router();

router.use(protect);
router.use(authorize('admin', 'ai_moderator', 'moderator'));

// Legacy endpoints — kept for backward compat with the existing admin UI.
router.get('/auto-answer/queue', getAutoAnswerQueue);
router.post('/community/auto-answer', runAutoAnswer);
router.patch('/auto-answer/:postId', reviewAutoAnswer);

// Phase 3 R12 — new review endpoints.
router.get('/auto-answer/queue/paginated', getAutoAnswerQueuePaginated);
router.post('/auto-answer/:postId/approve', approveAutoAnswer);
router.post('/auto-answer/:postId/approve-edit', approveEditAutoAnswer);
router.post('/auto-answer/:postId/reject', rejectAutoAnswer);
router.post('/auto-answer/:postId/ask-ai-again', askAiAgain);

// Phase 4 R12 — observability drill-down.
router.get('/auto-answer/:postId/context', getAutoAnswerContext);

export default router;