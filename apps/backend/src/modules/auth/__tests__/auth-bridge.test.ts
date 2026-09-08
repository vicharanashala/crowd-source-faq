/**
 * auth-bridge.test — samagama.in SSO bridge.
 *
 * The bridge had no test coverage at all before this file, despite
 * being an unauthenticated endpoint that creates user accounts and
 * now also grants program membership. These tests pin the parts that
 * would be dangerous to get wrong:
 *
 *   - signature verification, including the v1 / v2 canonical strings
 *   - the 60 second replay window
 *   - secret rotation by index
 *   - the two "never regress a user" invariants:
 *       * the bridge must not change an existing User.role
 *       * the bridge must not downgrade an existing ProgramEnrollment
 *   - unknown cohorts must fail loudly rather than defaulting
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import * as crypto from 'node:crypto';

import Batch from '../../program/batch.model.js';
import ProgramEnrollment from '../../program/program-enrollment.model.js';
import User from '../user.model.js';
import { exchangeBridgeToken } from '../auth-bridge.controller.js';
import { resolveActiveBatchBySlug, syncBridgeEnrollment } from '../bridge-enrollment.js';

let mongo: MongoMemoryServer;

const PRIMARY = 'primary-test-secret';
const ROTATED = 'rotated-test-secret';

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([
    Batch.deleteMany({}),
    ProgramEnrollment.deleteMany({}),
    User.deleteMany({}),
  ]);
  process.env.BRIDGE_ENABLED = 'true';
  process.env.BRIDGE_SHARED_SECRET = `${PRIMARY},${ROTATED}`;
  process.env.JWT_SECRET = 'test-jwt-secret';
});

// ─── helpers ────────────────────────────────────────────────────────

function sign(
  secret: string,
  ts: number,
  email: string,
  displayName: string,
  programSlug = '',
  programRole = '',
): string {
  const base = `${ts}.${email.toLowerCase().trim()}.${displayName.trim()}`;
  const canonical = programSlug
    ? `${base}.${programSlug.trim().toLowerCase()}.${programRole.trim()}`
    : base;
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
}

/** Minimal express req/res doubles good enough for this controller. */
function mockReqRes(body: Record<string, unknown>, secretIndex = 0) {
  const req = {
    body,
    headers: { 'x-bridge-secret-index': String(secretIndex) },
  } as never;
  const res = {
    statusCode: 200,
    payload: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.payload = data;
      return this;
    },
  };
  return { req, res };
}

async function makeBatch(name: string, status = 'active') {
  return Batch.create({
    name,
    description: `${name} description`,
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    status,
    isActive: true,
  });
}

// ─── slug resolution ────────────────────────────────────────────────

describe('resolveActiveBatchBySlug', () => {
  it('resolves a derived slug to its batch', async () => {
    const created = await makeBatch('GuruVaani');
    const found = await resolveActiveBatchBySlug('guruvaani');
    expect(found).not.toBeNull();
    expect(String(found?._id)).toBe(String(created._id));
  });

  it('is case and whitespace insensitive', async () => {
    await makeBatch('Monsoonship');
    expect(await resolveActiveBatchBySlug('  MONSOONSHIP  ')).not.toBeNull();
  });

  it('does not resolve a non-active batch', async () => {
    await makeBatch('Archived Program', 'archived');
    expect(await resolveActiveBatchBySlug('archived-program')).toBeNull();
  });

  it('returns null for an unknown slug rather than guessing', async () => {
    await makeBatch('Summership');
    expect(await resolveActiveBatchBySlug('does-not-exist')).toBeNull();
  });
});

// ─── enrollment invariants ──────────────────────────────────────────

describe('syncBridgeEnrollment', () => {
  it('creates an enrollment on first call', async () => {
    const batch = await makeBatch('Summership');
    const userId = new Types.ObjectId();
    const result = await syncBridgeEnrollment(userId, batch, 'student');

    expect(result.created).toBe(true);
    expect(result.programRole).toBe('student');
    expect(await ProgramEnrollment.countDocuments({ userId })).toBe(1);
  });

  it('is idempotent — a second call creates no duplicate', async () => {
    const batch = await makeBatch('Summership');
    const userId = new Types.ObjectId();
    await syncBridgeEnrollment(userId, batch, 'student');
    const second = await syncBridgeEnrollment(userId, batch, 'student');

    expect(second.created).toBe(false);
    expect(await ProgramEnrollment.countDocuments({ userId })).toBe(1);
  });

  it('never downgrades a role granted inside csfaq', async () => {
    const batch = await makeBatch('GuruVaani');
    const userId = new Types.ObjectId();
    await syncBridgeEnrollment(userId, batch, 'student');

    // An admin promotes them locally.
    await ProgramEnrollment.updateOne({ userId, batchId: batch._id }, { programRole: 'mentor' });

    // A routine login must not undo that.
    const result = await syncBridgeEnrollment(userId, batch, 'student');
    expect(result.rolePreserved).toBe(true);
    expect(result.programRole).toBe('mentor');

    const row = await ProgramEnrollment.findOne({ userId, batchId: batch._id });
    expect(row?.programRole).toBe('mentor');
  });

  it('does upgrade when the bridge asserts a higher role', async () => {
    const batch = await makeBatch('GuruVaani');
    const userId = new Types.ObjectId();
    await syncBridgeEnrollment(userId, batch, 'student');

    const result = await syncBridgeEnrollment(userId, batch, 'mentor');
    expect(result.programRole).toBe('mentor');
    expect(result.rolePreserved).toBe(false);
  });

  it('reactivates a soft-removed enrollment', async () => {
    const batch = await makeBatch('Summership');
    const userId = new Types.ObjectId();
    await syncBridgeEnrollment(userId, batch, 'student');
    await ProgramEnrollment.updateOne({ userId, batchId: batch._id }, { isActive: false });

    const result = await syncBridgeEnrollment(userId, batch, 'student');
    expect(result.reactivated).toBe(true);

    const row = await ProgramEnrollment.findOne({ userId, batchId: batch._id });
    expect(row?.isActive).toBe(true);
  });

  it('supports a user being in more than one program', async () => {
    const a = await makeBatch('Summership');
    const b = await makeBatch('GuruVaani');
    const userId = new Types.ObjectId();

    await syncBridgeEnrollment(userId, a, 'student');
    await syncBridgeEnrollment(userId, b, 'mentor');

    expect(await ProgramEnrollment.countDocuments({ userId, isActive: true })).toBe(2);
  });
});

// ─── endpoint behaviour ─────────────────────────────────────────────

describe('POST /api/auth/bridge/exchange', () => {
  const email = 'learner@example.com';
  const displayName = 'A Learner';

  it('returns 503 when the bridge is disabled', async () => {
    process.env.BRIDGE_ENABLED = 'false';
    const ts = Math.floor(Date.now() / 1000);
    const { req, res } = mockReqRes({
      email,
      displayName,
      ts,
      sig: sign(PRIMARY, ts, email, displayName),
    });
    await exchangeBridgeToken(req, res as never);
    expect(res.statusCode).toBe(503);
  });

  it('returns 503 when no shared secret is configured', async () => {
    process.env.BRIDGE_SHARED_SECRET = '';
    const ts = Math.floor(Date.now() / 1000);
    const { req, res } = mockReqRes({ email, displayName, ts, sig: 'whatever' });
    await exchangeBridgeToken(req, res as never);
    expect(res.statusCode).toBe(503);
  });

  it('rejects a bad signature', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const { req, res } = mockReqRes({ email, displayName, ts, sig: 'de:ad'.repeat(12) });
    await exchangeBridgeToken(req, res as never);
    expect(res.statusCode).toBe(401);
  });

  it('rejects a timestamp outside the 60 second window', async () => {
    const ts = Math.floor(Date.now() / 1000) - 120;
    const { req, res } = mockReqRes({
      email,
      displayName,
      ts,
      sig: sign(PRIMARY, ts, email, displayName),
    });
    await exchangeBridgeToken(req, res as never);
    expect(res.statusCode).toBe(401);
  });

  it('accepts a signature made with a rotated secret at index 1', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const { req, res } = mockReqRes(
      { email, displayName, ts, sig: sign(ROTATED, ts, email, displayName) },
      1,
    );
    await exchangeBridgeToken(req, res as never);
    expect(res.statusCode).toBe(200);
  });

  it('v1: creates the user with role "user" and no program', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const { req, res } = mockReqRes({
      email,
      displayName,
      ts,
      sig: sign(PRIMARY, ts, email, displayName),
    });
    await exchangeBridgeToken(req, res as never);

    expect(res.statusCode).toBe(200);
    const payload = res.payload as { user: { role: string }; program: unknown };
    expect(payload.user.role).toBe('user');
    expect(payload.program).toBeNull();
  });

  it('v2: enrols the user and returns the program for deep-linking', async () => {
    const batch = await makeBatch('GuruVaani');
    const ts = Math.floor(Date.now() / 1000);
    const { req, res } = mockReqRes({
      email,
      displayName,
      programSlug: 'guruvaani',
      programRole: 'student',
      ts,
      sig: sign(PRIMARY, ts, email, displayName, 'guruvaani', 'student'),
    });
    await exchangeBridgeToken(req, res as never);

    expect(res.statusCode).toBe(200);
    const payload = res.payload as {
      program: { batchId: string; slug: string; programRole: string };
    };
    expect(payload.program.batchId).toBe(String(batch._id));
    expect(payload.program.slug).toBe('guruvaani');
    expect(payload.program.programRole).toBe('student');
  });

  it('v2: a signature that omits the program fields is rejected', async () => {
    await makeBatch('GuruVaani');
    const ts = Math.floor(Date.now() / 1000);
    const { req, res } = mockReqRes({
      email,
      displayName,
      programSlug: 'guruvaani',
      programRole: 'student',
      ts,
      // signed as v1 — must not be accepted for a v2 body, otherwise
      // the cohort could be swapped without invalidating the signature
      sig: sign(PRIMARY, ts, email, displayName),
    });
    await exchangeBridgeToken(req, res as never);
    expect(res.statusCode).toBe(401);
  });

  it('v2: tampering with programRole invalidates the signature', async () => {
    await makeBatch('GuruVaani');
    const ts = Math.floor(Date.now() / 1000);
    const { req, res } = mockReqRes({
      email,
      displayName,
      programSlug: 'guruvaani',
      programRole: 'mentor', // claimed
      ts,
      sig: sign(PRIMARY, ts, email, displayName, 'guruvaani', 'student'), // signed
    });
    await exchangeBridgeToken(req, res as never);
    expect(res.statusCode).toBe(401);
  });

  it('v2: rejects a role the bridge is not allowed to assign', async () => {
    await makeBatch('GuruVaani');
    const ts = Math.floor(Date.now() / 1000);
    const { req, res } = mockReqRes({
      email,
      displayName,
      programSlug: 'guruvaani',
      programRole: 'program_admin',
      ts,
      sig: sign(PRIMARY, ts, email, displayName, 'guruvaani', 'program_admin'),
    });
    await exchangeBridgeToken(req, res as never);
    expect(res.statusCode).toBe(400);
  });

  it('v2: an unknown cohort fails loudly and creates no user', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const { req, res } = mockReqRes({
      email,
      displayName,
      programSlug: 'no-such-program',
      programRole: 'student',
      ts,
      sig: sign(PRIMARY, ts, email, displayName, 'no-such-program', 'student'),
    });
    await exchangeBridgeToken(req, res as never);

    expect(res.statusCode).toBe(404);
    expect(await User.countDocuments({ email })).toBe(0);
  });

  it('returns a redirectUrl pointing at the cohort, with no token in it', async () => {
    const batch = await makeBatch('GuruVaani');
    const ts = Math.floor(Date.now() / 1000);
    const { req, res } = mockReqRes({
      email,
      displayName,
      programSlug: 'guruvaani',
      programRole: 'student',
      ts,
      sig: sign(PRIMARY, ts, email, displayName, 'guruvaani', 'student'),
    });
    await exchangeBridgeToken(req, res as never);

    const { redirectUrl, token } = res.payload as { redirectUrl: string; token: string };
    expect(redirectUrl).toContain('/csfaq/?batch=');
    expect(redirectUrl).toContain(String(batch._id));
    // The token must never travel in a query string: those end up in
    // access logs, browser history and Referer headers.
    expect(redirectUrl).not.toContain(token);
    expect(redirectUrl.toLowerCase()).not.toContain('token');
  });

  it('v1 redirectUrl points at the portal root', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const { req, res } = mockReqRes({
      email,
      displayName,
      ts,
      sig: sign(PRIMARY, ts, email, displayName),
    });
    await exchangeBridgeToken(req, res as never);

    const { redirectUrl } = res.payload as { redirectUrl: string };
    expect(redirectUrl).toMatch(/\/csfaq\/$/);
  });

  it('signs the JWT with an "id" claim so authShared can load the user', async () => {
    // Regression test. The bridge previously signed `{ userId, role }`,
    // but authShared.ts reads `decoded.id` and auth.controller.ts signs
    // `{ id, jti }`. Every bridge token therefore resolved to
    // User.findById(undefined) and every authenticated request came
    // back "Not authorized. User not found." — the bridge issued
    // tokens that could not be used for anything.
    const ts = Math.floor(Date.now() / 1000);
    const { req, res } = mockReqRes({
      email,
      displayName,
      ts,
      sig: sign(PRIMARY, ts, email, displayName),
    });
    await exchangeBridgeToken(req, res as never);

    const { token } = res.payload as { token: string };
    const claims = JSON.parse(
      Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;

    const created = await User.findOne({ email });
    expect(claims.id).toBe(String(created?._id));
    expect(claims.userId).toBeUndefined();
    // jti is required for logout / revocation to work on bridged sessions
    expect(typeof claims.jti).toBe('string');
  });

  it('never changes an existing global User.role', async () => {
    await User.create({
      name: 'Existing Admin',
      email,
      password: 'irrelevant-hashed-value',
      role: 'admin',
    });

    const ts = Math.floor(Date.now() / 1000);
    const { req, res } = mockReqRes({
      email,
      displayName,
      ts,
      sig: sign(PRIMARY, ts, email, displayName),
    });
    await exchangeBridgeToken(req, res as never);

    expect(res.statusCode).toBe(200);
    const after = await User.findOne({ email });
    expect(after?.role).toBe('admin');
  });
});
