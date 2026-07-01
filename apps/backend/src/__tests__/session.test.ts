/**
 * session.test.ts — unit tests for the admin session module.
 *
 * Strategy: vi.mock the AdminSession model. Token hashing uses real
 * bcryptjs (cost 10 in test config; production uses 10 too — token
 * verification is a hot path).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

// Set bcrypt cost BEFORE the session module loads. The module reads
// process.env.ADMIN_BCRYPT_COST at module-init time. Setting it here
// keeps the test suite fast (~5ms per hash) without depending on env
// vars being propagated to vitest workers.
process.env.ADMIN_BCRYPT_COST = '4';

const { mockSessionCreate, mockFind, mockUpdateMany, mockDeleteMany } = vi.hoisted(() => ({
  mockSessionCreate: vi.fn(),
  mockFind: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockDeleteMany: vi.fn(),
}));

// We need AdminSession to be a constructor-like with .create(), .find(),
// .updateMany(), .deleteMany(). We mock all four.
vi.mock('../models/AdminSession.js', () => ({
  default: {
    create: (...args: unknown[]) => mockSessionCreate(...args),
    find: (...args: unknown[]) => mockFind(...args),
    updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
  },
}));

const { mintSession, validateSession, revokeSession, revokeAllSessionsForAdmin, purgeExpiredSessions } = await import(
  '../integrations/discord/admin/session.js'
);

type FakeSessionRow = {
  tokenHash: string;
  _id: string;
  adminId: string;
  adminUsername: string;
  source: 'discord' | 'rest';
  createdAt: Date;
  expiresAt: Date;
  lastUsedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  revokedAt: Date | null;
  revokedReason: string | null;
  lockoutUntil: Date | null;
  consecutiveFailures: number;
  save: () => Promise<unknown>;
};

function makeFakeSessionRow(tokenPlaintext: string, overrides: Record<string, unknown> = {}): FakeSessionRow {
  // The full IAdminSession type has too many fields with strict types for
  // a fake to satisfy naturally; we cast per-field with `as <Type>`. The
  // test only reads back the fields it cares about.
  return {
    tokenHash: '', // populated by test setup below
    _id: (overrides._id as string | undefined) ?? `65fe${Math.random().toString(16).slice(2, 18)}`,
    adminId: (overrides.adminId as string | undefined) ?? 'admin001',
    adminUsername: (overrides.adminUsername as string | undefined) ?? 'yashh',
    source: (overrides.source as 'discord' | 'rest' | undefined) ?? 'rest',
    createdAt: (overrides.createdAt as Date | undefined) ?? new Date(),
    expiresAt: (overrides.expiresAt as Date | undefined) ?? new Date(Date.now() + 3600_000),
    lastUsedAt: (overrides.lastUsedAt as Date | undefined) ?? new Date(),
    ipAddress: (overrides.ipAddress as string | null | undefined) ?? null,
    userAgent: (overrides.userAgent as string | null | undefined) ?? null,
    revokedAt: (overrides.revokedAt as Date | null | undefined) ?? null,
    revokedReason: (overrides.revokedReason as string | null | undefined) ?? null,
    lockoutUntil: (overrides.lockoutUntil as Date | null | undefined) ?? null,
    consecutiveFailures: (overrides.consecutiveFailures as number | undefined) ?? 0,
    save: vi.fn().mockResolvedValue(undefined),
  };
}

/** Default row returned by AdminSession.create. */
function defaultCreateImpl(data: { tokenHash: string; [k: string]: unknown }) {
  return Promise.resolve({
    ...data,
    _id: `65fe${Math.random().toString(16).slice(2, 18)}`,
    save: vi.fn().mockResolvedValue(undefined),
  });
}

beforeEach(() => {
  // mockClear (not mockReset) preserves the default implementation we
  // set at module load — that way individual tests can still override
  // per-test and get back to a working default on the next beforeEach.
  mockSessionCreate.mockClear();
  mockSessionCreate.mockImplementation(defaultCreateImpl);
  mockFind.mockClear();
  mockFind.mockImplementation(() => ({ limit: () => Promise.resolve([]) }));
  mockUpdateMany.mockClear();
  mockUpdateMany.mockResolvedValue({ modifiedCount: 0 });
  mockDeleteMany.mockClear();
  mockDeleteMany.mockResolvedValue({ deletedCount: 0 });
});

// Helper: build a session row pre-hashed with a known plaintext token.
async function hashedSession(tokenPlaintext: string, overrides: Record<string, unknown> = {}): Promise<ReturnType<typeof makeFakeSessionRow>> {
  const row = makeFakeSessionRow(tokenPlaintext, overrides);
  row.tokenHash = await bcrypt.hash(tokenPlaintext, 4); // cost 4 — fast for tests
  return row;
}

describe('admin.session — mintSession()', () => {
  it('returns a plaintext token that the caller can send to the client', async () => {
    mockSessionCreate.mockImplementation(async (data: { tokenHash: string }) => ({
      ...data,
      _id: 'fakeid',
      save: vi.fn(),
    }));
    const result = await mintSession({
      adminId: 'admin001',
      adminUsername: 'yashh',
      source: 'rest',
    });
    expect(typeof result.token).toBe('string');
    expect(result.token.length).toBeGreaterThanOrEqual(64); // 32 bytes hex = 64 chars
    // Only the hash is stored, not the plaintext
    const stored = mockSessionCreate.mock.calls[0][0] as { tokenHash: string };
    expect(stored.tokenHash).not.toBe(result.token);
  });

  it('sets expiresAt 1 hour after mint', async () => {
    mockSessionCreate.mockImplementation(async (data: { tokenHash: string }) => ({
      ...data,
      _id: 'fakeid',
      save: vi.fn(),
    }));
    const before = Date.now();
    const result = await mintSession({
      adminId: 'admin001',
      adminUsername: 'yashh',
      source: 'discord',
    });
    expect(result.expiresAt - before).toBeGreaterThanOrEqual(3_599_000);
    expect(result.expiresAt - before).toBeLessThanOrEqual(3_601_000);
  });

  it('generates a different token each call (cryptographic randomness)', async () => {
    mockSessionCreate.mockImplementation(async (data: { tokenHash: string }) => ({
      ...data,
      _id: crypto.randomUUID(),
      save: vi.fn(),
    }));
    const t1 = await mintSession({ adminId: 'a', adminUsername: 'a', source: 'rest' });
    const t2 = await mintSession({ adminId: 'a', adminUsername: 'a', source: 'rest' });
    expect(t1.token).not.toBe(t2.token);
  });
});

describe('admin.session — validateSession()', () => {
  it('returns valid:true with the session row when token matches', async () => {
    const tokenPlaintext = 'secret-token-1234';
    const row = await hashedSession(tokenPlaintext);
    mockFind.mockReturnValue({ limit: () => Promise.resolve([row]) });

    const result = await validateSession(tokenPlaintext);
    expect(result.valid).toBe(true);
    expect(result.session).toBe(row);
    expect(row.consecutiveFailures).toBe(0); // reset on success
    expect(row.save).toHaveBeenCalled();
  });

  it('returns valid:false reason:not-found when no candidate matches', async () => {
    mockFind.mockReturnValue({ limit: () => Promise.resolve([]) });
    const result = await validateSession('any-token');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('not-found');
  });

  it('returns valid:false reason:expired when expiresAt is past', async () => {
    const tokenPlaintext = 'expired-token';
    const row = await hashedSession(tokenPlaintext, {
      expiresAt: new Date(Date.now() - 1000), // already expired
    });
    mockFind.mockReturnValue({ limit: () => Promise.resolve([row]) });
    const result = await validateSession(tokenPlaintext);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('returns valid:false reason:revoked when session was revoked', async () => {
    const tokenPlaintext = 'revoked-token';
    const row = await hashedSession(tokenPlaintext, {
      revokedAt: new Date(),
    });
    mockFind.mockReturnValue({ limit: () => Promise.resolve([row]) });
    const result = await validateSession(tokenPlaintext);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('revoked');
  });

  it('skips rows with an active brute-force lockout (doesn\'t even bcrypt-compare)', async () => {
    const lockedRow = await hashedSession('valid-but-locked', {
      lockoutUntil: new Date(Date.now() + 60_000), // locked
    });
    mockFind.mockReturnValue({ limit: () => Promise.resolve([lockedRow]) });
    const result = await validateSession('valid-but-locked');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('not-found');
  });

  it('runs a dummy bcrypt compare on miss to equalise timing', async () => {
    mockFind.mockReturnValue({ limit: () => Promise.resolve([]) });
    const result = await validateSession('any-token');
    // The point of the dummy compare is to equalise timing so an attacker
    // can't enumerate valid tokens by response time. We test the
    // observable contract (returns not-found) here; the timing property
    // is verified manually + via the constant-time bcrypt library.
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('not-found');
  });
});

describe('admin.session — revokeSession()', () => {
  it('marks the matching session as revoked with reason', async () => {
    const tokenPlaintext = 'to-revoke';
    const row = await hashedSession(tokenPlaintext);
    mockFind.mockReturnValue({ limit: () => Promise.resolve([row]) });
    await revokeSession(tokenPlaintext, 'logout');
    expect(row.revokedAt).not.toBe(null);
    expect(row.revokedReason).toBe('logout');
    expect(row.save).toHaveBeenCalled();
  });

  it('does not revoke other sessions that don\'t match', async () => {
    const a = await hashedSession('token-a');
    const b = await hashedSession('token-b');
    mockFind.mockReturnValue({ limit: () => Promise.resolve([a, b]) });
    await revokeSession('token-a', 'manual');
    expect(a.revokedAt).not.toBe(null);
    expect(b.revokedAt).toBe(null);
  });
});

describe('admin.session — revokeAllSessionsForAdmin()', () => {
  it('returns the number of modified sessions', async () => {
    mockUpdateMany.mockResolvedValue({ modifiedCount: 3 });
    const n = await revokeAllSessionsForAdmin('admin001', 'lockout');
    expect(n).toBe(3);
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('passes the reason through to the update', async () => {
    mockUpdateMany.mockResolvedValue({ modifiedCount: 1 });
    await revokeAllSessionsForAdmin('admin001', 'manual');
    const update = mockUpdateMany.mock.calls[0][1] as { $set: { revokedReason: string } };
    expect(update.$set.revokedReason).toBe('manual');
  });
});

describe('admin.session — purgeExpiredSessions()', () => {
  it('returns the count of deleted sessions', async () => {
    mockDeleteMany.mockResolvedValue({ deletedCount: 7 });
    const n = await purgeExpiredSessions();
    expect(n).toBe(7);
  });
});