import User, { calculateTier } from '../auth/user.model.js';
import ReputationLog from '../moderation/reputation-log.model.js';
import { awardToUser } from '../moderation/program-reputation.model.js';
import { autoAwardBadges } from '../moderation/reputation.controller.js';import { Request, Response } from 'express';
import { Types } from 'mongoose';
import FAQ from '../faq/faq.model.js';
import { QuizCard, QuizSession } from './quiz.model.js';
import { adminLog } from '../../utils/http/logger.js';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toOptionText(answer: string): string {
  const clean = answer.replace(/\s+/g, ' ').trim();
  return clean.length > 120 ? clean.slice(0, 117) + '...' : clean;
}

async function buildQuestionPool(batchId: Types.ObjectId | null, category: string | null) {
  const filter: Record<string, unknown> = { status: 'approved' };
  if (batchId) filter.batchId = batchId;
  if (category) filter.category = category;
  return FAQ.find(filter).select('question answer category').limit(200).lean();
}

// GET /api/quiz/questions — quick preview only (reveals correctIndex, not for scoring)
export async function generateQuiz(req: Request, res: Response): Promise<void> {
  try {
    const batchId = typeof req.query.batchId === 'string' && Types.ObjectId.isValid(req.query.batchId)
      ? new Types.ObjectId(req.query.batchId) : null;
    const category = typeof req.query.category === 'string' ? req.query.category : null;
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 30);

    const pool = await buildQuestionPool(batchId, category);
    if (pool.length < 4) {
      res.status(422).json({ message: 'Not enough approved FAQs to build a quiz (need at least 4).' });
      return;
    }
    const picked = shuffle(pool).slice(0, limit);
    const questions = picked.map((faq) => {
      const sameCategory = pool.filter((f) => f.category === faq.category && String(f._id) !== String(faq._id));
      const source = sameCategory.length >= 3 ? sameCategory : pool.filter((f) => String(f._id) !== String(faq._id));
      const distractors = shuffle(source).slice(0, 3).map((f) => toOptionText(f.answer));
      const correctText = toOptionText(faq.answer);
      const options = shuffle([correctText, ...distractors]);
      return { faqId: String(faq._id), question: faq.question, options, correctIndex: options.indexOf(correctText) };
    });
    res.json({ questions, total: questions.length });
  } catch (err) {
    adminLog.error(`[quiz] generateQuiz failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to generate quiz.' });
  }
}

// POST /api/quiz/sessions — starts a real scored session, hides correctIndex
export async function startQuizSession(req: Request, res: Response): Promise<void> {
  try {
    const { batchId: rawBatchId, category, limit: rawLimit } = req.body ?? {};
    const batchId = typeof rawBatchId === 'string' && Types.ObjectId.isValid(rawBatchId) ? new Types.ObjectId(rawBatchId) : null;
    const limit = Math.min(Math.max(Number(rawLimit) || 10, 1), 30);

    const pool = await buildQuestionPool(batchId, category ?? null);
    if (pool.length < 4) {
      res.status(422).json({ message: 'Not enough approved FAQs to build a quiz (need at least 4).' });
      return;
    }
    const picked = shuffle(pool).slice(0, limit);
    const built = picked.map((faq) => {
      const sameCategory = pool.filter((f) => f.category === faq.category && String(f._id) !== String(faq._id));
      const source = sameCategory.length >= 3 ? sameCategory : pool.filter((f) => String(f._id) !== String(faq._id));
      const distractors = shuffle(source).slice(0, 3).map((f) => toOptionText(f.answer));
      const correctText = toOptionText(faq.answer);
      const options = shuffle([correctText, ...distractors]);
      return { faqId: faq._id as Types.ObjectId, question: faq.question, options, correctIndex: options.indexOf(correctText) };
    });

    const session = await QuizSession.create({
      userId: req.user!._id,
      batchId,
      categoryFilter: category ?? null,
      answerKey: built.map((q) => ({ faqId: q.faqId, correctIndex: q.correctIndex })),
      totalQuestions: built.length,
    });

    // Strip correctIndex before responding — client only sees the questions.
    const questions = built.map(({ faqId, question, options }) => ({ faqId: String(faqId), question, options }));
    res.status(201).json({ sessionId: session._id, questions });
  } catch (err) {
    adminLog.error(`[quiz] startQuizSession failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to start quiz session.' });
  }
}

async function applySM2(userId: Types.ObjectId, faqId: Types.ObjectId, batchId: Types.ObjectId | null, correct: boolean) {
  let card = await QuizCard.findOne({ userId, faqId });
  if (!card) card = new QuizCard({ userId, faqId, batchId });

  if (correct) {
    card.repetitions += 1;
    if (card.repetitions === 1) card.intervalDays = 1;
    else if (card.repetitions === 2) card.intervalDays = 6;
    else card.intervalDays = Math.round(card.intervalDays * card.easeFactor);
    card.easeFactor = Math.min(3.0, card.easeFactor + 0.05);
    card.lastResult = 'correct';
  } else {
    card.repetitions = 0;
    card.intervalDays = 0;
    card.easeFactor = Math.max(1.3, card.easeFactor - 0.2);
    card.lastResult = 'incorrect';
  }
  card.lastReviewedAt = new Date();
  card.dueAt = new Date(Date.now() + card.intervalDays * 86400000);
  await card.save();
}

// POST /api/quiz/sessions/:id/answer — { faqId, selectedIndex, timeTakenMs }
export async function submitAnswer(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const { faqId, selectedIndex, timeTakenMs } = (req.body ?? {}) as {
      faqId?: string;
      selectedIndex?: number;
      timeTakenMs?: number;
    };

    if (!Types.ObjectId.isValid(id) || typeof faqId !== 'string' || !Types.ObjectId.isValid(faqId) || typeof selectedIndex !== 'number') {
      res.status(400).json({ message: 'Invalid answer payload.' });
      return;
    }

    const session = await QuizSession.findOne({ _id: id, userId: req.user!._id, completedAt: null });
    if (!session) {
      res.status(404).json({ message: 'Quiz session not found or already completed.' });
      return;
    }

    const keyEntry = session.answerKey.find((k) => String(k.faqId) === String(faqId));
    if (!keyEntry) {
      res.status(400).json({ message: 'That question is not part of this session.' });
      return;
    }

    const correct = selectedIndex === keyEntry.correctIndex;
    session.answers.push({ faqId: new Types.ObjectId(faqId), selectedIndex, correct, timeTakenMs: Number(timeTakenMs) || 0 });
    await session.save();

    await applySM2(req.user!._id, new Types.ObjectId(faqId), session.batchId, correct);

    res.json({ correct, correctIndex: keyEntry.correctIndex });
  } catch (err) {
    adminLog.error(`[quiz] submitAnswer failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to submit answer.' });
  }
}
async function awardQuizPoints(
  userId: Types.ObjectId,
  batchId: Types.ObjectId | null,
  correctCount: number
) {
  const delta = correctCount * 2; // +2 SP per correct answer in the session
  if (delta === 0) return;

  const user = await User.findById(userId);
  if (!user) return;
  user.points = Math.max(0, user.points + delta);
  user.reputation = user.points;
  user.tier = calculateTier(user.points);
  await user.save();

  if (batchId) await awardToUser(userId, batchId, { points: delta }).catch(() => {});

  await ReputationLog.create({
    userId,
    batchId,
    delta,
    reason: `Quiz session: ${correctCount} correct answer(s)`,
    action: 'quiz_correct',
    targetType: 'quiz',
  });

  autoAwardBadges(userId.toString()).catch(() => {});
}
// POST /api/quiz/sessions/:id/complete
export async function completeSession(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const session = await QuizSession.findOne({ _id: id, userId: req.user!._id, completedAt: null });
    if (!session) {
      res.status(404).json({ message: 'Quiz session not found or already completed.' });
      return;
    }
    session.score = session.answers.filter((a) => a.correct).length;
    session.completedAt = new Date();
    await session.save();


session.score = session.answers.filter((a) => a.correct).length;
    session.completedAt = new Date();
    await session.save();

    await awardQuizPoints(req.user!._id, session.batchId, session.score);

    res.json({ score: session.score, totalQuestions: session.totalQuestions });
    res.json({ score: session.score, totalQuestions: session.totalQuestions });
  } catch (err) {
    adminLog.error(`[quiz] completeSession failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to complete quiz session.' });
  }
}
