/**
 * welcome-orientation-scoping.test — multi-program isolation fix
 * for the public `/welcome/orientation` endpoint.
 *
 * The bug being fixed:
 *   `getActiveOrientation` used `Orientation.findOne().sort({ createdAt: -1 })`
 *   — a GLOBAL query. After the multi-program isolation change,
 *   every orientation carries a `batchId`, but this endpoint
 *   ignored it. Result: a student in program B could see program
 *   A's orientation (or "no active orientation" if A's row was
 *   older and B's had nothing — the most-recently-created across
 *   all programs was returned regardless of program context).
 *
 * The fix:
 *   Scope by `x-program-id` / `x-batch-id` / `x-workspace-id`
 *   headers (set by the frontend `api` interceptor) or a
 *   `?batchId=…` query param. Returns null when no program context
 *   is supplied so the frontend shows the proper empty state.
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

const { default: Orientation } = await import('../orientation.model.js');
const { default: Batch } = await import('../batch.model.js');
const { getActiveOrientation } = await import('../welcome.controller.js');

function mockReq(overrides: Record<string, unknown> = {}): any {
  return { headers: {}, query: {}, body: {}, ...overrides };
}
function mockRes(): any {
  const body: any = { value: undefined };
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

describe('getActiveOrientation — multi-program isolation fix', () => {
  it('returns the orientation belonging to the active program (x-program-id header)', async () => {
    const { batch } = await seedProgram();
    const created = await Orientation.create({
      title: 'Day-40 Onboarding',
      description: 'd',
      videoUrl: '/uploads/orientations/day40.mp4',
      transcript: '',
      completionThreshold: 90,
      batchId: batch._id,
    });

    const res = mockRes();
    await getActiveOrientation(
      mockReq({ headers: { 'x-program-id': batch._id.toString() } }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.value?._id?.toString()).toBe(created._id.toString());
  });

  it('does NOT leak an orientation from a different program', async () => {
    const { batch: progA } = await seedProgram();
    const { batch: progB } = await seedProgram();
    await Orientation.create({
      title: 'A-Orientation',
      description: 'd',
      videoUrl: '/uploads/orientations/a.mp4',
      transcript: '',
      completionThreshold: 90,
      batchId: progA._id,
    });
    const b = await Orientation.create({
      title: 'B-Orientation',
      description: 'd',
      videoUrl: '/uploads/orientations/b.mp4',
      transcript: '',
      completionThreshold: 90,
      batchId: progB._id,
    });

    const res = mockRes();
    await getActiveOrientation(
      mockReq({ headers: { 'x-program-id': progB._id.toString() } }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.value?._id?.toString()).toBe(b._id.toString());
    expect(res.body.value?.title).toBe('B-Orientation');
  });

  it('returns null when no program context is supplied (no header, no query)', async () => {
    const { batch } = await seedProgram();
    await Orientation.create({
      title: 'X',
      description: 'd',
      videoUrl: '/uploads/orientations/x.mp4',
      transcript: '',
      completionThreshold: 90,
      batchId: batch._id,
    });

    const res = mockRes();
    await getActiveOrientation(mockReq({}), res);
    expect(res.statusCode).toBe(200);
    // The frontend uses `null` (or undefined) to detect "no orientation".
    expect(res.body.value).toBeNull();
  });

  it('returns null when the active program has no orientation (even if other programs do)', async () => {
    const { batch: progA } = await seedProgram();
    const { batch: progB } = await seedProgram();
    await Orientation.create({
      title: 'A-Orientation',
      description: 'd',
      videoUrl: '/uploads/orientations/a.mp4',
      transcript: '',
      completionThreshold: 90,
      batchId: progA._id,
    });
    // Program B has no orientation.
    const res = mockRes();
    await getActiveOrientation(
      mockReq({ headers: { 'x-program-id': progB._id.toString() } }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.value).toBeNull();
  });

  it('accepts ?batchId=… query param as fallback when no header is set', async () => {
    const { batch } = await seedProgram();
    const created = await Orientation.create({
      title: 'Via Query',
      description: 'd',
      videoUrl: '/uploads/orientations/v.mp4',
      transcript: '',
      completionThreshold: 90,
      batchId: batch._id,
    });

    const res = mockRes();
    await getActiveOrientation(
      mockReq({ query: { batchId: batch._id.toString() } }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.value?._id?.toString()).toBe(created._id.toString());
  });

  it('accepts x-batch-id header as alias for x-program-id', async () => {
    const { batch } = await seedProgram();
    const created = await Orientation.create({
      title: 'Legacy Header',
      description: 'd',
      videoUrl: '/uploads/orientations/l.mp4',
      transcript: '',
      completionThreshold: 90,
      batchId: batch._id,
    });

    const res = mockRes();
    await getActiveOrientation(
      mockReq({ headers: { 'x-batch-id': batch._id.toString() } }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.value?._id?.toString()).toBe(created._id.toString());
  });

  it('returns the most recent orientation when a program has multiple', async () => {
    const { batch } = await seedProgram();
    await Orientation.create({
      title: 'Old',
      description: 'd',
      videoUrl: '/uploads/orientations/old.mp4',
      transcript: '',
      completionThreshold: 90,
      batchId: batch._id,
      createdAt: new Date(Date.now() - 86400_000),
    });
    const latest = await Orientation.create({
      title: 'Latest',
      description: 'd',
      videoUrl: '/uploads/orientations/latest.mp4',
      transcript: '',
      completionThreshold: 90,
      batchId: batch._id,
    });

    const res = mockRes();
    await getActiveOrientation(
      mockReq({ headers: { 'x-program-id': batch._id.toString() } }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.value?._id?.toString()).toBe(latest._id.toString());
  });
});