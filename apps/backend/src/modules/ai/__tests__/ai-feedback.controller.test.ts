import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo: MongoMemoryServer | null = null;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 120_000);

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongo) {
    await mongo.stop();
  }
});

const { default: AiQuestion } = await import('../ai-question.model.js');
const { default: AiFeedback } = await import('../ai-feedback.model.js');
const { submitAiFeedback } = await import('../../knowledge/knowledge.controller.js');

function mockReq(overrides: Record<string, unknown> = {}) {
  return {
    body: {},
    params: {},
    headers: {},
    user: { _id: new Types.ObjectId() },
    ...overrides,
  };
}

function mockRes() {
  const body: Record<string, unknown> = {};
  let statusCode = 200;
  return {
    get statusCode() { return statusCode; },
    status(this: any, n: number) { statusCode = n; return this; },
    json(this: any, payload: unknown) { body.value = payload; return this; },
    body,
  };
}

describe('submitAiFeedback', () => {
  beforeEach(async () => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('no db');
    await db.collection('yaksha_faq_ai_questions').deleteMany({});
    await db.collection('yaksha_faq_ai_feedback').deleteMany({});
  });

  it('creates feedback for an owned ai question and updates it when the same user submits again', async () => {
    const userId = new Types.ObjectId();
    const aiQuestion = await AiQuestion.create({
      userId,
      orientationId: new Types.ObjectId(),
      question: 'How do I reset my password?',
      answer: 'Use the reset form.',
    });

    const firstReq = mockReq({
      body: { aiQuestionId: aiQuestion._id.toString(), rating: 'helpful', comment: 'Great answer' },
      user: { _id: userId },
    });
    const firstRes = mockRes();

    await submitAiFeedback(firstReq as any, firstRes as any);

    expect(firstRes.statusCode).toBe(200);
    const created = await AiFeedback.findOne({ userId, aiQuestionId: aiQuestion._id });
    expect(created?.rating).toBe('helpful');
    expect(created?.comment).toBe('Great answer');

    const secondReq = mockReq({
      body: { aiQuestionId: aiQuestion._id.toString(), rating: 'not_helpful', comment: 'Needs more detail' },
      user: { _id: userId },
    });
    const secondRes = mockRes();

    await submitAiFeedback(secondReq as any, secondRes as any);

    expect(secondRes.statusCode).toBe(200);
    const count = await AiFeedback.countDocuments({ userId, aiQuestionId: aiQuestion._id });
    expect(count).toBe(1);
    const updated = await AiFeedback.findOne({ userId, aiQuestionId: aiQuestion._id });
    expect(updated?.rating).toBe('not_helpful');
    expect(updated?.comment).toBe('Needs more detail');
  });

  it('rejects feedback when the ai question belongs to another user', async () => {
    const ownerId = new Types.ObjectId();
    const otherUserId = new Types.ObjectId();
    const aiQuestion = await AiQuestion.create({
      userId: ownerId,
      orientationId: new Types.ObjectId(),
      question: 'Who can access placement resources?',
      answer: 'Only enrolled students.',
    });

    const req = mockReq({
      body: { aiQuestionId: aiQuestion._id.toString(), rating: 'helpful' },
      user: { _id: otherUserId },
    });
    const res = mockRes();

    await submitAiFeedback(req as any, res as any);

    expect(res.statusCode).toBe(403);
    expect(await AiFeedback.countDocuments({ aiQuestionId: aiQuestion._id })).toBe(0);
  });

  it('rejects feedback when the ai question has no owner', async () => {
    const userId = new Types.ObjectId();
    const aiQuestion = await AiQuestion.create({
      userId: null,
      orientationId: null,
      question: 'Anonymous question?',
      answer: 'Anonymous answer.',
    });

    const req = mockReq({
      body: { aiQuestionId: aiQuestion._id.toString(), rating: 'not_helpful' },
      user: { _id: userId },
    });
    const res = mockRes();

    await submitAiFeedback(req as any, res as any);

    expect(res.statusCode).toBe(403);
    expect(await AiFeedback.countDocuments({ aiQuestionId: aiQuestion._id })).toBe(0);
  });
});
