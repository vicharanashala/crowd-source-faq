/**
 * listPublicBatches — cross-cohort visibility fix.
 *
 * A signed-in, non-admin user (e.g. a summership-only student) was
 * shown every active program in the "switch program" dropdown, not
 * just the ones they're enrolled in. This let them discover — and,
 * before the companion FAQ/analytics fix, read — other cohorts.
 *
 * Fix: anonymous callers keep seeing the full public directory;
 * global admins keep seeing everything; a signed-in non-admin (any
 * role, including global moderator) is filtered down to their own
 * active ProgramEnrollments.
 */
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

beforeEach(async () => {
  const db = mongoose.connection.db;
  if (!db) throw new Error('no db');
  await db.collection('yaksha_faq_batches').deleteMany({});
  await db.collection('yaksha_faq_faqs').deleteMany({});
  await db.collection('yaksha_program_enrollments').deleteMany({});
});

const { default: Batch } = await import('../batch.model.js');
const { default: ProgramEnrollment } = await import('../program-enrollment.model.js');
const { listPublicBatches } = await import('../batch.controller.js');

function mockReqRes(user?: { _id: Types.ObjectId; role: string }): {
  req: Parameters<typeof listPublicBatches>[0];
  res: any;
} {
  const resBody = { value: null as unknown };
  const res: any = {
    statusCode: 200,
    get body() { return resBody.value; },
    status(n: number) { this.statusCode = n; return { json: (b: unknown) => { resBody.value = b; } }; },
    json(b: unknown) { resBody.value = b; },
  };
  return { req: { user } as unknown as Parameters<typeof listPublicBatches>[0], res };
}

function names(body: unknown): string[] {
  return (body as { batches: Array<{ name: string }> }).batches.map((b) => b.name).sort();
}

describe('listPublicBatches — cross-cohort visibility fix', () => {
  it('shows every active program to anonymous callers (public directory unchanged)', async () => {
    await Batch.create([
      { name: 'summership', description: '', startDate: new Date(), endDate: new Date(Date.now() + 1), isActive: true },
      { name: 'Vriddhi', description: '', startDate: new Date(), endDate: new Date(Date.now() + 1), isActive: true },
    ]);
    const { req, res } = mockReqRes(undefined);
    await listPublicBatches(req, res);
    expect(names(res.body)).toEqual(['Vriddhi', 'summership']);
  });

  it('shows every active program to a global admin', async () => {
    await Batch.create([
      { name: 'summership', description: '', startDate: new Date(), endDate: new Date(Date.now() + 1), isActive: true },
      { name: 'Vriddhi', description: '', startDate: new Date(), endDate: new Date(Date.now() + 1), isActive: true },
    ]);
    const { req, res } = mockReqRes({ _id: new Types.ObjectId(), role: 'admin' });
    await listPublicBatches(req, res);
    expect(names(res.body)).toEqual(['Vriddhi', 'summership']);
  });

  it('shows only enrolled programs to a signed-in student (the reported bug)', async () => {
    const summership = await Batch.create({ name: 'summership', description: '', startDate: new Date(), endDate: new Date(Date.now() + 1), isActive: true });
    await Batch.create({ name: 'Vriddhi', description: '', startDate: new Date(), endDate: new Date(Date.now() + 1), isActive: true });
    await Batch.create({ name: 'Monsoonship', description: '', startDate: new Date(), endDate: new Date(Date.now() + 1), isActive: true });

    const userId = new Types.ObjectId();
    await ProgramEnrollment.create({ userId, batchId: summership._id, programRole: 'student', isActive: true });

    const { req, res } = mockReqRes({ _id: userId, role: 'student' });
    await listPublicBatches(req, res);
    expect(names(res.body)).toEqual(['summership']);
  });

  it('shows only enrolled programs to a global moderator without admin access', async () => {
    const summership = await Batch.create({ name: 'summership', description: '', startDate: new Date(), endDate: new Date(Date.now() + 1), isActive: true });
    await Batch.create({ name: 'Vriddhi', description: '', startDate: new Date(), endDate: new Date(Date.now() + 1), isActive: true });

    const userId = new Types.ObjectId();
    await ProgramEnrollment.create({ userId, batchId: summership._id, programRole: 'moderator', isActive: true });

    const { req, res } = mockReqRes({ _id: userId, role: 'moderator' });
    await listPublicBatches(req, res);
    expect(names(res.body)).toEqual(['summership']);
  });

  it('incident fix: falls back to the full public list for an unmigrated user with zero enrollment rows, instead of showing nothing', async () => {
    // Regression guard: a signed-in, already-enrolled real student with
    // no ProgramEnrollment row at all (never went through the v2 SSO
    // bridge / never backfilled) previously saw an empty batch list and
    // a broken homepage. They must see the full public list, same as an
    // anonymous visitor, until enrollment backfill is fixed.
    await Batch.create({ name: 'Vriddhi', description: '', startDate: new Date(), endDate: new Date(Date.now() + 1), isActive: true });
    await Batch.create({ name: 'summership', description: '', startDate: new Date(), endDate: new Date(Date.now() + 1), isActive: true });
    const { req, res } = mockReqRes({ _id: new Types.ObjectId(), role: 'student' });
    await listPublicBatches(req, res);
    expect(names(res.body)).toEqual(['Vriddhi', 'summership']);
  });
});
