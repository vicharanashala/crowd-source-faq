import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

// ── QuizCard: SM-2 spaced-repetition state, one doc per (user, FAQ) ──
export interface IQuizCard extends Document {
  userId: Types.ObjectId;
  faqId: Types.ObjectId;
  batchId: Types.ObjectId | null;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  dueAt: Date;
  lastResult: 'correct' | 'incorrect' | null;
  lastReviewedAt: Date | null;
}

const quizCardSchema = new MongooseSchema<IQuizCard>({
  userId: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true },
  faqId: { type: MongooseSchema.Types.ObjectId, ref: 'FAQ', required: true, index: true },
  batchId: { type: MongooseSchema.Types.ObjectId, ref: 'Batch', default: null, index: true },
  easeFactor: { type: Number, default: 2.5 },
  intervalDays: { type: Number, default: 0 },
  repetitions: { type: Number, default: 0 },
  dueAt: { type: Date, default: () => new Date(), index: true },
  lastResult: { type: String, enum: ['correct', 'incorrect', null], default: null },
  lastReviewedAt: { type: Date, default: null },
}, { timestamps: true });

quizCardSchema.index({ userId: 1, faqId: 1 }, { unique: true });

export const QuizCard = mongoose.model<IQuizCard>('QuizCard', quizCardSchema, 'yaksha_faq_quiz_cards');

// ── QuizSession: one quiz run. `answerKey` holds the correct answers
//    server-side only — never sent to the client until after they answer. ──
export interface IQuizAnswerKeyEntry {
  faqId: Types.ObjectId;
  correctIndex: number;
}

export interface IQuizAnswer {
  faqId: Types.ObjectId;
  selectedIndex: number;
  correct: boolean;
  timeTakenMs: number;
}

export interface IQuizSession extends Document {
  userId: Types.ObjectId;
  batchId: Types.ObjectId | null;
  categoryFilter: string | null;
  answerKey: IQuizAnswerKeyEntry[];
  answers: IQuizAnswer[];
  score: number;
  totalQuestions: number;
  startedAt: Date;
  completedAt: Date | null;
}

const quizSessionSchema = new MongooseSchema<IQuizSession>({
  userId: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true },
  batchId: { type: MongooseSchema.Types.ObjectId, ref: 'Batch', default: null, index: true },
  categoryFilter: { type: String, default: null },
  answerKey: [{
    faqId: { type: MongooseSchema.Types.ObjectId, ref: 'FAQ', required: true },
    correctIndex: { type: Number, required: true },
  }],
  answers: [{
    faqId: { type: MongooseSchema.Types.ObjectId, ref: 'FAQ', required: true },
    selectedIndex: { type: Number, required: true },
    correct: { type: Boolean, required: true },
    timeTakenMs: { type: Number, required: true },
  }],
  score: { type: Number, default: 0 },
  totalQuestions: { type: Number, default: 0 },
  startedAt: { type: Date, default: () => new Date() },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

quizSessionSchema.index({ userId: 1, createdAt: -1 });

export const QuizSession = mongoose.model<IQuizSession>('QuizSession', quizSessionSchema, 'yaksha_faq_quiz_sessions');
