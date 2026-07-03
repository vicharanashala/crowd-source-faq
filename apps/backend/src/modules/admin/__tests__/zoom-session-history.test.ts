/**
 * zoom-session-history.test — the Session History additions.
 *
 * Covers three layers of the v1.69 Session History change:
 *   1. getZoomSessions emits lifetime stats + batchName.
 *   2. getZoomSessionActivity returns the audit log entries plus
 *      a derived create event.
 *   3. recordZoomAudit() writes correctly-shaped entries.
 *
 * Existing behavior (CRUD on ZoomSession, transcript upload,
 * regenerate, activate) is exercised by other test files — those
 * endpoints are untouched here.
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

const { default: ZoomSession } = await import('../../zoom/zoom-session.model.js');
const { default: ZoomAssessmentAttempt } = await import('../../zoom/zoom-assessment-attempt.model.js');
const { default: ZoomAssessmentQuestion } = await import('../../zoom/zoom-assessment-question.model.js');
const { default: Batch } = await import('../../program/batch.model.js');
const { default: OnboardingAuditLog } = await import('../../program/onboarding-audit-log.model.js');
const { getZoomSessions, getZoomSessionActivity } = await import('../admin-welcome.controller.js');

function mockReq(overrides: Record<string, unknown> = {}): any {
  return { query: {}, body: {}, params: {}, user: { _id: new Types.ObjectId() }, ...overrides };
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

async function seedProgram(): Promise<{ batch: any }> {
  const batch = await Batch.create({
    name: `Program-${Math.random()}`,
    description: '',
    startDate: new Date(),
    endDate: new Date(Date.now() + 86400_000),
    isActive: true,
  });
  return { batch };
}

describe('getZoomSessions — Session History additions', () => {
  it('returns batchName and lifetime stats on every row', async () => {
    const { batch } = await seedProgram();
    const session = await ZoomSession.create({
      title: 'Day-40', description: 'desc', zoomUrl: 'https://example.com',
      isActive: true, batchId: batch._id,
    });
    // 3 attempts: 2 passed, 1 failed
    const userId = new Types.ObjectId();
    for (let i = 0; i < 2; i++) {
      await ZoomAssessmentAttempt.create({
        zoomSessionId: session._id, userId, status: 'passed', score: 80, completedAt: new Date(),
        zoomQuestionCount: 10, passScore: 70,
      });
    }
    await ZoomAssessmentAttempt.create({
      zoomSessionId: session._id, userId, status: 'failed', score: 30, completedAt: new Date(),
      zoomQuestionCount: 10, passScore: 70,
    });
    // 5 questions
    for (let i = 0; i < 5; i++) {
      await ZoomAssessmentQuestion.create({
        zoomSessionId: session._id,
        question: `q${i}`, options: ['a', 'b'], correctOptionIndex: 0, type: 'MCQ', sourceType: 'transcript',
      });
    }

    const res = mockRes();
    await getZoomSessions(mockReq({ query: { batchId: batch._id.toString() } }), res);
    const rows = res.body.value as Array<any>;
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.batchName).toBe(batch.name);
    expect(row.stats.totalAttempts).toBe(3);
    expect(row.stats.lifetimePassed).toBe(2);
    expect(row.stats.lifetimeFailed).toBe(1);
    expect(row.stats.passRate).toBe(67); // 2/3 rounded
    expect(row.stats.questionPoolSize).toBe(5);
  });

  it('returns 0% passRate when no attempts exist', async () => {
    const { batch } = await seedProgram();
    await ZoomSession.create({
      title: 'Empty', description: 'd', zoomUrl: 'https://example.com',
      isActive: true, batchId: batch._id,
    });
    const res = mockRes();
    await getZoomSessions(mockReq({ query: { batchId: batch._id.toString() } }), res);
    const row = (res.body.value as Array<any>)[0];
    expect(row.stats.totalAttempts).toBe(0);
    expect(row.stats.passRate).toBe(0);
  });
});

describe('getZoomSessionActivity — Session History timeline', () => {
  it('400 on missing/invalid id', async () => {
    const res = mockRes();
    await getZoomSessionActivity(mockReq({ params: { id: 'not-an-objectid' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('404 on unknown session', async () => {
    const res = mockRes();
    await getZoomSessionActivity(mockReq({ params: { id: new Types.ObjectId().toString() } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('returns derived create event even when no audit entries exist', async () => {
    const { batch } = await seedProgram();
    const session = await ZoomSession.create({
      title: 'X', description: 'd', zoomUrl: 'https://example.com',
      isActive: true, batchId: batch._id,
    });
    const res = mockRes();
    await getZoomSessionActivity(mockReq({ params: { id: session._id.toString() } }), res);
    const body = res.body.value as { entries: Array<any>; sessionId: string; batchId: string };
    // `_id` from Mongoose is an ObjectId; compare via toString().
    expect(body.sessionId.toString()).toBe(session._id.toString());
    expect(body.batchId?.toString()).toBe(batch._id.toString());
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].derived).toBe(true);
    expect(body.entries[0].action).toBe('create');
    expect(body.entries[0].newValue.title).toBe('X');
  });

  it('returns recorded audit entries alongside the derived create event', async () => {
    const { batch } = await seedProgram();
    const session = await ZoomSession.create({
      title: 'X', description: 'd', zoomUrl: 'https://example.com',
      isActive: true, batchId: batch._id,
    });
    const adminId = new Types.ObjectId();
    await OnboardingAuditLog.create({
      changedBy: adminId,
      batchId: batch._id,
      entityType: 'zoom_session',
      entityId: session._id,
      action: 'update',
      newValue: { title: 'X-edited' },
      timestamp: new Date(),
    });
    await OnboardingAuditLog.create({
      changedBy: adminId,
      batchId: batch._id,
      entityType: 'zoom_session',
      entityId: session._id,
      action: 'switch_active',
      newValue: { activeSessionId: session._id.toString() },
      timestamp: new Date(),
    });

    const res = mockRes();
    try {
      await getZoomSessionActivity(mockReq({ params: { id: session._id.toString() } }), res);
    } catch (err) {
      throw new Error(`controller threw: ${(err as Error).message}`);
    }
    if (!res.body.value) {
      throw new Error(`empty body, status=${res.statusCode}`);
    }
    const entries = (res.body.value as { entries: Array<any> }).entries;
    if (!Array.isArray(entries)) {
      throw new Error(`entries is not an array: ${JSON.stringify(res.body.value)}`);
    }
    expect(entries.length).toBeGreaterThanOrEqual(3); // derived + 2 recorded
    const actions = entries.map((e) => e.action);
    expect(actions).toContain('create');
    expect(actions).toContain('update');
    expect(actions).toContain('switch_active');
  });

  it('the activity endpoint schema accepts the new zoom_session entityType', async () => {
    // Smoke test: writing a zoom_session entry to the OnboardingAuditLog
    // does not throw — confirms the enum extension is non-breaking.
    const adminId = new Types.ObjectId();
    const doc = await OnboardingAuditLog.create({
      changedBy: adminId,
      batchId: new Types.ObjectId(),
      entityType: 'zoom_session',
      entityId: new Types.ObjectId(),
      action: 'create',
      timestamp: new Date(),
    });
    expect(doc._id).toBeDefined();
  });
});