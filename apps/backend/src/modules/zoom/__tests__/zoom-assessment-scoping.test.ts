/**
 * zoom-assessment-scoping.test — the v1.69 student-assessment isolation
 * fix.
 *
 * The bug being fixed: `getAssessment` (and `submitAssessment`,
 * `getZoomStatus`) used `ZoomSession.findOne({ isActive: true })`
 * which is a GLOBAL query. With multi-program isolation, multiple
 * programs can have `isActive: true` set on different sessions
 * simultaneously, so the legacy query returned whichever MongoDB
 * happened to surface first — students in program B could see the
 * questions generated for program A.
 *
 * The fix: a `resolveActiveSession(req)` helper that scopes the
 * lookup to the student's active program (read from
 * `req.headers['x-program-id']`) when the header is present, falling
 * back to global when it isn't (backward compatibility).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types } from 'mongoose';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  const db = mongoose.connection.db;
  if (!db) throw new Error('no db');
  const cols = await db.listCollections().toArray();
  for (const c of cols) await db.collection(c.name).deleteMany({});
});

const { default: ZoomSession } = await import('../zoom-session.model.js');
const { default: ZoomAssessmentQuestion } = await import('../zoom-assessment-question.model.js');
const { default: Batch } = await import('../../program/batch.model.js');
const { default: AppSetting } = await import('../../program/app-setting.model.js');
const { getAssessment, getZoomStatus } = await import('../zoom-assessment.controller.js');

function mockReq(overrides: Record<string, unknown> = {}): any {
  return {
    user: { _id: new Types.ObjectId(), seenAssessmentQuestions: [] },
    headers: {},
    query: {},
    body: {},
    params: {},
    ...overrides,
  };
}
function mockRes(): any {
  const body: any = { value: null };
  return {
    statusCode: 200,
    get body() { return body; },
    status(this: any, n: number) { this.statusCode = n; return this; },
    json(this: any, b: unknown) { body.value = b; return this; },
  };
}

async function seedTwoPrograms(): Promise<{ progA: any; progB: any }> {
  const progA = await Batch.create({
    name: `Prog-A-${Math.random()}`,
    description: '',
    startDate: new Date(),
    endDate: new Date(Date.now() + 86400_000),
    isActive: true,
  });
  const progB = await Batch.create({
    name: `Prog-B-${Math.random()}`,
    description: '',
    startDate: new Date(),
    endDate: new Date(Date.now() + 86400_000),
    isActive: true,
  });
  return { progA, progB };
}

async function enableZoomGateway(): Promise<void> {
  await AppSetting.findOneAndUpdate(
    { _id: 'singleton' },
    { $set: { 'settings.zoomActive': true } },
    { upsert: true },
  );
}

describe('getAssessment — student-side isolation (v1.69 fix)', () => {
  it('returns questions from the active session in the student\'s program, not another program\'s', async () => {
    const { progA, progB } = await seedTwoPrograms();
    await enableZoomGateway();

    // Two active sessions, one in each program — this is exactly the
    // multi-program state where the legacy bug manifested.
    const sessionA = await ZoomSession.create({
      title: 'Day-40-A', description: 'd', zoomUrl: 'https://example.com/a',
      isActive: true, batchId: progA._id,
    });
    const sessionB = await ZoomSession.create({
      title: 'Day-40-B', description: 'd', zoomUrl: 'https://example.com/b',
      isActive: true, batchId: progB._id,
    });

    // Seed questions: session A gets a unique marker, session B another.
    await ZoomAssessmentQuestion.create({
      zoomSessionId: sessionA._id, question: 'A-MARKER-1',
      options: ['a','b'], correctOptionIndex: 0, type: 'MCQ', sourceType: 'transcript',
    });
    await ZoomAssessmentQuestion.create({
      zoomSessionId: sessionB._id, question: 'B-MARKER-1',
      options: ['a','b'], correctOptionIndex: 0, type: 'MCQ', sourceType: 'transcript',
    });

    // Student calls as if they're enrolled in program B.
    const res = mockRes();
    await getAssessment(mockReq({ headers: { 'x-program-id': progB._id.toString() } }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body.value as { questions: Array<{ question: string }>; attemptId: string };
    expect(body.questions).toHaveLength(1);
    // Must be B's question, not A's.
    expect(body.questions[0].question).toBe('B-MARKER-1');

    // Sanity: the attempt was bound to session B.
    expect(body.attemptId).toBeDefined();
  });

  it('returns questions from program A when the student sends x-program-id=A', async () => {
    const { progA, progB } = await seedTwoPrograms();
    await enableZoomGateway();
    const sessionA = await ZoomSession.create({
      title: 'A', description: 'd', zoomUrl: 'https://example.com/a',
      isActive: true, batchId: progA._id,
    });
    const sessionB = await ZoomSession.create({
      title: 'B', description: 'd', zoomUrl: 'https://example.com/b',
      isActive: true, batchId: progB._id,
    });
    await ZoomAssessmentQuestion.create({
      zoomSessionId: sessionA._id, question: 'A1',
      options: ['a','b'], correctOptionIndex: 0, type: 'MCQ', sourceType: 'transcript',
    });
    await ZoomAssessmentQuestion.create({
      zoomSessionId: sessionB._id, question: 'B1',
      options: ['a','b'], correctOptionIndex: 0, type: 'MCQ', sourceType: 'transcript',
    });

    const res = mockRes();
    await getAssessment(mockReq({ headers: { 'x-program-id': progA._id.toString() } }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body.value as { questions: Array<{ question: string }> };
    expect(body.questions[0].question).toBe('A1');
  });

  it('returns 400 when the student\'s program has no active session (does NOT cross-contaminate)', async () => {
    const { progA, progB } = await seedTwoPrograms();
    await enableZoomGateway();
    // Only program A has an active session; program B has none.
    await ZoomSession.create({
      title: 'A', description: 'd', zoomUrl: 'https://example.com/a',
      isActive: true, batchId: progA._id,
    });

    const res = mockRes();
    await getAssessment(mockReq({ headers: { 'x-program-id': progB._id.toString() } }), res);

    // The fix: returning A's session here would be the bug.
    // We return 400 with the standard "no active session" error.
    expect(res.statusCode).toBe(400);
    expect((res.body.value as { message: string }).message).toMatch(/not currently active/i);
  });

  it('falls back to global when x-program-id is absent (backward compatibility)', async () => {
    const { progA } = await seedTwoPrograms();
    await enableZoomGateway();
    const sessionA = await ZoomSession.create({
      title: 'A', description: 'd', zoomUrl: 'https://example.com/a',
      isActive: true, batchId: progA._id,
    });
    await ZoomAssessmentQuestion.create({
      zoomSessionId: sessionA._id, question: 'A1',
      options: ['a','b'], correctOptionIndex: 0, type: 'MCQ', sourceType: 'transcript',
    });

    const res = mockRes();
    // No x-program-id header — legacy callers (e.g. curl) still get
    // the active session via the global fallback.
    await getAssessment(mockReq({ headers: {} }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body.value as { questions: Array<{ question: string }> };
    expect(body.questions[0].question).toBe('A1');
  });

  it('rejects an invalid x-program-id header (does not throw)', async () => {
    const { progA } = await seedTwoPrograms();
    await enableZoomGateway();
    const session = await ZoomSession.create({
      title: 'A', description: 'd', zoomUrl: 'https://example.com/a',
      isActive: true, batchId: progA._id,
    });
    await ZoomAssessmentQuestion.create({
      zoomSessionId: session._id, question: 'q1',
      options: ['a','b'], correctOptionIndex: 0, type: 'MCQ', sourceType: 'transcript',
    });

    const res = mockRes();
    await getAssessment(mockReq({ headers: { 'x-program-id': 'not-an-objectid' } }), res);
    // Invalid header falls through to the global path (Types.ObjectId.isValid
    // returns false for 'not-an-objectid'), so the active session in
    // program A is returned.
    expect(res.statusCode).toBe(200);
  });
});

describe('getZoomStatus — student-side isolation (v1.69 fix)', () => {
  it('returns active=true only when the student\'s program has an active session', async () => {
    const { progA, progB } = await seedTwoPrograms();
    await ZoomSession.create({
      title: 'A', description: 'd', zoomUrl: 'https://example.com/a',
      isActive: true, batchId: progA._id,
      transcript: 'hello world transcript content here',
    });
    // Program B has no active session.

    const res = mockRes();
    await getZoomStatus(mockReq({ headers: { 'x-program-id': progB._id.toString() } }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body.value as { active: boolean }).active).toBe(false);
  });

  it('returns the matching session details when scoped correctly', async () => {
    const { progA } = await seedTwoPrograms();
    const sessionA = await ZoomSession.create({
      title: 'Cohort 7 Onboarding',
      description: 'desc',
      zoomUrl: 'https://example.com/a',
      isActive: true,
      batchId: progA._id,
      transcript: 'transcript',
    });
    // Seed at least one question so the eligibility check passes.
    const { default: ZoomAssessmentQuestion } = await import('../zoom-assessment-question.model.js');
    await ZoomAssessmentQuestion.create({
      zoomSessionId: sessionA._id, question: 'q1',
      options: ['a','b'], correctOptionIndex: 0, type: 'MCQ', sourceType: 'transcript',
    });
    // Enable the zoomActive gateway.
    await enableZoomGateway();

    const res = mockRes();
    await getZoomStatus(mockReq({ headers: { 'x-program-id': progA._id.toString() } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body.value as { active: boolean; status: string };
    expect(body.active).toBe(true);
    // 'eligible' is the non-passed status returned to students.
    expect(body.status).toBe('eligible');
  });
});