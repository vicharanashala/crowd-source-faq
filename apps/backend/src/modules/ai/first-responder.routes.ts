import { Router, type Request } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { protect } from '../../middleware/auth.js';
import { authorize } from '../../middleware/authShared.js';
import { validateObjectId } from '../../middleware/validateObjectId.js';
import { askFirstResponder, getEscalationQueue, updateEscalationStatus } from './first-responder.controller.js';

const router = Router();

// AI calls are expensive — throttle per-IP regardless of auth state.
// Mirrors the ask-ai limiter shape (see ask-ai.routes.ts).
const firstResponderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req: Request) => ipKeyGenerator(req.ip ?? 'unknown'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many questions. Please wait a moment and try again.' },
});

// POST /api/ai/first-responder — ask the AI peer tutor.
// `protect` is required so we can attribute the escalation to a user
// (and scope it to their program via req.programContext).
router.post('/', protect, firstResponderLimiter, askFirstResponder);

// Admin escalation queue — review/resolve questions the AI couldn't answer.
router.get('/queue', protect, authorize('admin', 'moderator', 'ai_moderator'), getEscalationQueue);
router.patch('/queue/:id', protect, authorize('admin', 'moderator', 'ai_moderator'), validateObjectId('id'), updateEscalationStatus);

export default router;
