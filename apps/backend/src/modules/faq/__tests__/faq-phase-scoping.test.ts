import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const { default: FAQ } = await import('../faq.model.js');
const { default: InternshipProgress } = await import('../../internship/internship.model.js');
const { getAllFAQs } = await import('../faq.controller.js');

function mockReq(overrides: Record<string, unknown> = {}): any {
  return {
    query: {},
    body: {},
    params: {},
    headers: {},
    user: undefined,
    programContext: null,
    ...overrides,
  };
}

function mockRes(): any {
  const body: any = { value: null };
  let statusVal = 200;
  return {
    get statusCode() { return statusVal; },
    get body() { return body; },
    status(this: any, n: number) { statusVal = n; return this; },
    json(this: any, b: unknown) { body.value = b; return this; },
  };
}

async function seedFaqsAcrossPhases() {
  await FAQ.create([
    { question: 'General Q', answer: 'A', category: 'GenCat', phase: 'GENERAL', status: 'approved' },
    { question: 'Phase 1 Q', answer: 'A', category: 'P1Cat', phase: 'PHASE_1', status: 'approved' },
    { question: 'Phase 2 Q', answer: 'A', category: 'P2Cat', phase: 'PHASE_2', status: 'approved' },
    { question: 'Phase 3 Q', answer: 'A', category: 'P3Cat', phase: 'PHASE_3', status: 'approved' },
    { question: 'Completed Q', answer: 'A', category: 'CompCat', phase: 'COMPLETED', status: 'approved' },
  ]);
}

async function categoriesVisibleTo(req: any): Promise<string[]> {
  const res = mockRes();
  await getAllFAQs(req, res);
  return Object.keys(res.body.value.grouped ?? {});
}

describe('getAllFAQs — internship phase scoping', () => {
  beforeEach(async () => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('no db');
    await db.collection('yaksha_faq_faqs').deleteMany({});
    await db.collection('internshipprogresses').deleteMany({});
    await seedFaqsAcrossPhases();
  });

  it('unauthenticated request (no req.user) sees GENERAL + every not-yet-completed phase', async () => {
    const cats = await categoriesVisibleTo(mockReq());
    expect(cats.sort()).toEqual(['GenCat', 'P1Cat', 'P2Cat', 'P3Cat']);
  });

  it('authenticated user with no InternshipProgress record defaults to GENERAL (sees all phases)', async () => {
    const cats = await categoriesVisibleTo(mockReq({ user: { _id: new Types.ObjectId() } }));
    expect(cats.sort()).toEqual(['GenCat', 'P1Cat', 'P2Cat', 'P3Cat']);
  });

  it('PHASE_1 user sees GENERAL + PHASE_1 + upcoming phases', async () => {
    const userId = new Types.ObjectId();
    await InternshipProgress.create({ userId, currentPhase: 'PHASE_1' });
    const cats = await categoriesVisibleTo(mockReq({ user: { _id: userId } }));
    expect(cats.sort()).toEqual(['GenCat', 'P1Cat', 'P2Cat', 'P3Cat']);
  });

  it('PHASE_2 user (completed Phase 1) no longer sees PHASE_1', async () => {
    const userId = new Types.ObjectId();
    await InternshipProgress.create({ userId, currentPhase: 'PHASE_2' });
    const cats = await categoriesVisibleTo(mockReq({ user: { _id: userId } }));
    expect(cats.sort()).toEqual(['GenCat', 'P2Cat', 'P3Cat']);
  });

  it('PHASE_3 user (completed Phase 2) only sees GENERAL + PHASE_3', async () => {
    const userId = new Types.ObjectId();
    await InternshipProgress.create({ userId, currentPhase: 'PHASE_3' });
    const cats = await categoriesVisibleTo(mockReq({ user: { _id: userId } }));
    expect(cats.sort()).toEqual(['GenCat', 'P3Cat']);
  });

  it('COMPLETED user only sees GENERAL + completion FAQs', async () => {
    const userId = new Types.ObjectId();
    await InternshipProgress.create({ userId, currentPhase: 'COMPLETED' });
    const cats = await categoriesVisibleTo(mockReq({ user: { _id: userId } }));
    expect(cats.sort()).toEqual(['CompCat', 'GenCat']);
  });

  it('batch/program scoping composes with phase scoping (no cross-program leakage)', async () => {
    const { default: Batch } = await import('../../program/batch.model.js');
    const batchA = await Batch.create({
      name: 'Program A', description: 'x',
      startDate: new Date(), endDate: new Date(Date.now() + 86400000), isActive: true,
    });
    const batchB = await Batch.create({
      name: 'Program B', description: 'x',
      startDate: new Date(), endDate: new Date(Date.now() + 86400000), isActive: true,
    });
    await FAQ.create([
      { question: 'A Phase 1 Q', answer: 'A', category: 'ACat1', phase: 'PHASE_1', status: 'approved', batchId: batchA._id },
      { question: 'A Phase 2 Q', answer: 'A', category: 'ACat2', phase: 'PHASE_2', status: 'approved', batchId: batchA._id },
      { question: 'B Phase 1 Q', answer: 'A', category: 'BCat1', phase: 'PHASE_1', status: 'approved', batchId: batchB._id },
    ]);

    const userId = new Types.ObjectId();
    await InternshipProgress.create({ userId, currentPhase: 'PHASE_2' });

    const catsA = await categoriesVisibleTo(
      mockReq({ user: { _id: userId }, query: { batchId: batchA._id.toString() } }),
    );
    // Same program, student has completed PHASE_1 → ACat1 (Phase 1) is hidden, ACat2 (Phase 2) shows.
    expect(catsA).not.toContain('ACat1');
    expect(catsA).toContain('ACat2');
    // Different program entirely → must not leak across the batch boundary.
    expect(catsA).not.toContain('BCat1');
  });
});
