import { Router } from 'express';
import { protect } from '../../middleware/auth.js';
import { generateQuiz, startQuizSession, submitAnswer, completeSession } from './quiz.controller.js';

const router = Router();

router.get('/questions', protect, generateQuiz);
router.post('/sessions', protect, startQuizSession);
router.post('/sessions/:id/answer', protect, submitAnswer);
router.post('/sessions/:id/complete', protect, completeSession);

export default router;
