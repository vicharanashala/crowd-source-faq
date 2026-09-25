/**
 * programScope-double-invocation.test — 2026-09-25 incident.
 *
 * Root cause of a real production bug: `programScope()` is mounted
 * BOTH globally (bootstrap/middleware.ts, before any route-specific
 * auth middleware runs) AND again per-route after `optionalAuth`/
 * `protect`. The global pass runs with no `req.user` yet, so it could
 * resolve `req.programContext` but never had a user to attach
 * `req.programEnrollment` for. The old "already attached, skip" early
 * return then made the per-route pass — the only one that ever has a
 * real user — skip re-running entirely, so req.programEnrollment
 * never got attached even for a genuinely, correctly enrolled user.
 *
 * This test reproduces exactly that: call programScope() once with no
 * req.user (simulating the global pre-auth pass), then call it again
 * on the SAME req object after attaching req.user (simulating the
 * per-route post-auth pass) — req.programEnrollment must end up set.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Request, Response, NextFunction } from 'express';

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
  await db.collection('yaksha_program_enrollments').deleteMany({});
});

const { default: Batch } = await import('../../modules/program/batch.model.js');
const { default: ProgramEnrollment } = await import('../../modules/program/program-enrollment.model.js');
const { programScope } = await import('../programScope.js');

describe('programScope — global-then-per-route double invocation', () => {
  it('attaches programEnrollment on the SECOND call once req.user is available, even though programContext was already resolved by the first (userless) call', async () => {
    const batch = await Batch.create({
      name: 'summership',
      description: '',
      startDate: new Date('2026-05-15'),
      endDate: new Date('2026-12-31'),
      isActive: true,
      status: 'active',
    });
    const userId = new Types.ObjectId();
    await ProgramEnrollment.create({
      userId,
      batchId: batch._id,
      programRole: 'student',
      isActive: true,
    });

    const req = {
      query: { batchId: String(batch._id) },
      params: {},
      body: {},
      headers: {},
    } as unknown as Request;
    const res = { status: () => res, json: () => res } as unknown as Response;
    const next1: NextFunction = (() => {}) as NextFunction;

    // Pass 1: simulates the global mount — runs BEFORE auth, no req.user.
    await programScope()(req, res, next1);
    expect(req.programContext?.batchId).toBe(String(batch._id));
    expect(req.programEnrollment).toBeUndefined();

    // Auth middleware would run here in the real chain and set req.user.
    (req as unknown as { user?: unknown }).user = { _id: userId, role: 'user' };

    // Pass 2: simulates the per-route mount — runs AFTER auth, on the
    // SAME req object, so req.programContext is already set.
    const next2: NextFunction = (() => {}) as NextFunction;
    await programScope()(req, res, next2);

    expect(req.programEnrollment).toBeDefined();
    expect(req.programEnrollment?.userId).toBe(String(userId));
    expect(req.programEnrollment?.batchId).toBe(String(batch._id));
  });
});
