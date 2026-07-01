/**
 * passphrase.test.ts — unit tests for the admin passphrase module.
 *
 * Strategy: vi.mock the AdminConfig model + admin.config.service so
 * the module never touches real Mongo. We override ADMIN_BCRYPT_COST=4
 * to keep the test suite fast (~5ms per hash) — production uses 12.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';

// Set bcrypt cost BEFORE the passphrase module loads. The module reads
// process.env.ADMIN_BCRYPT_COST at module-init time.
process.env.ADMIN_BCRYPT_COST = '4';

const { mockFindOne, mockFindOneAndUpdate, mockAuditCreate } = vi.hoisted(() => ({
  mockFindOne: vi.fn(),
  mockFindOneAndUpdate: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock('../models/AdminConfig.js', () => ({
  default: {
    findOne: (...args: unknown[]) => ({ select: () => ({ lean: () => mockFindOne(...args) }) }),
    findOneAndUpdate: (...args: unknown[]) => mockFindOneAndUpdate(...args),
  },
}));

// We mock the runtimeConfig.getConfig stub so the test only depends on
// AdminConfig.findOne being configured correctly. This stub returns the
// shape that runtimeConfig's real getConfig returns.
vi.mock('../config/runtimeConfig.js', () => ({
  getConfig: async (key: string) => {
    const row = await mockFindOne({ key, programId: null });
    if (!row) return { value: undefined, source: 'default', isEncrypted: false, key, category: 'general', scope: 'global' };
    const value = row.encrypted ? row.value : (() => { try { return JSON.parse(row.value); } catch { return row.value; } })();
    return { value, source: 'mongo', isEncrypted: row.encrypted, key, category: 'general', scope: 'global' };
  },
  invalidateConfigCache: () => {},
  clearAllConfigCache: () => {},
}));

// We re-mock admin.config.service so setConfig records what would have
// been sent to AdminConfig. The shape of the findOneAndUpdate call
// mirrors the real service — filter, update, options — so tests can
// assert on what would have been written.
vi.mock('../modules/admin/admin.config.service.js', () => ({
  setConfig: (input: { key: string; value: unknown; programId?: string | null; [k: string]: unknown }) => {
    const programIdStr = input.programId ?? null;
    const filter = { key: input.key, programId: programIdStr };
    const update = {
      $set: {
        value: input.value,
        encrypted: false,
        isCritical: false,
        category: 'general',
        scope: programIdStr ? 'program' : 'global',
        programId: programIdStr,
        updatedBy: input.adminId,
        note: '',
      },
    };
    mockFindOneAndUpdate(filter, update, { upsert: true, new: true });
    return Promise.resolve({ ok: true, mongoId: 'fake-id' });
  },
  // deleteConfig never gets called in these tests, but mock for symmetry.
  deleteConfig: () => Promise.resolve({ ok: true }),
}));

const { verifyPassphrase, getLockoutStatus, seedPassphraseFromEnv } = await import(
  '../integrations/discord/admin/passphrase.js'
);

const VALID_HASH_KEY = '_admin.passphrase.hash';
const LOCKOUT_KEY = '_admin.passphrase.lockout';
const REAL_PASSPHRASE = 'correct horse battery staple';

beforeEach(() => {
  mockFindOne.mockClear();
  mockFindOne.mockResolvedValue(null);
  mockFindOneAndUpdate.mockClear();
  mockFindOneAndUpdate.mockResolvedValue({ _id: 'fake-id' });
  mockAuditCreate.mockClear();
  mockAuditCreate.mockResolvedValue(undefined);
});

// Helper: pre-compute a real bcrypt hash of REAL_PASSPHRASE at cost 4.
const REAL_HASH_PROMISE = bcrypt.hash(REAL_PASSPHRASE, 4);
async function realHash(): Promise<string> {
  return REAL_HASH_PROMISE;
}

// Helper: mock the AdminConfig.findOne to return a stored hash + a
// (possibly set) lockout state.
function mockStoredPassphraseAndLockout(
  storedHash: string | null,
  lockoutState: { consecutiveFailures: number; firstFailureAt: number; lockoutUntil: number | null } | null = null
): void {
  mockFindOne.mockImplementation((query: { key?: string }) => {
    if (query?.key === VALID_HASH_KEY) {
      if (storedHash === null) return Promise.resolve(null);
      return Promise.resolve({ value: JSON.stringify({ hash: storedHash, algorithm: 'bcrypt', cost: 4 }) });
    }
    if (query?.key === LOCKOUT_KEY) {
      if (lockoutState === null) return Promise.resolve(null);
      return Promise.resolve({ value: JSON.stringify(lockoutState) });
    }
    return Promise.resolve(null);
  });
}

describe('admin.passphrase — verifyPassphrase()', () => {
  it('returns true for the correct passphrase', async () => {
    const hash = await realHash();
    mockStoredPassphraseAndLockout(hash);
    const ok = await verifyPassphrase(REAL_PASSPHRASE);
    expect(ok).toBe(true);
  });

  it('returns false for a wrong passphrase', async () => {
    const hash = await realHash();
    mockStoredPassphraseAndLockout(hash);
    const ok = await verifyPassphrase('wrong password');
    expect(ok).toBe(false);
  });

  it('returns false immediately when an active lockout is in effect', async () => {
    const hash = await realHash();
    mockStoredPassphraseAndLockout(hash, {
      consecutiveFailures: 5,
      firstFailureAt: Date.now() - 30_000,
      lockoutUntil: Date.now() + 60_000, // 1 min remaining
    });
    const ok = await verifyPassphrase(REAL_PASSPHRASE); // even with CORRECT password
    expect(ok).toBe(false);
  });

  it('returns false when the passphrase is not initialised (no Mongo row)', async () => {
    mockFindOne.mockResolvedValue(null);
    await expect(verifyPassphrase('anything')).rejects.toThrow(/not initialised/);
  });

  it('returns false when the stored hash is malformed (defensive)', async () => {
    mockFindOne.mockImplementation((query: { key?: string }) => {
      if (query?.key === VALID_HASH_KEY) {
        return Promise.resolve({ value: 'not-json-at-all' });
      }
      return Promise.resolve(null);
    });
    const ok = await verifyPassphrase('whatever');
    expect(ok).toBe(false);
  });

  it('increments failure counter and locks out after 5 consecutive failures', async () => {
    const hash = await realHash();
    // Stateful in-memory lockout tracker so the test exercises the
    // real "read current → increment → write back" cycle.
    let lockoutState: { consecutiveFailures: number; firstFailureAt: number; lockoutUntil: number | null } | null = null;
    const writes: Array<{ value: unknown }> = [];

    mockFindOne.mockImplementation((query: { key?: string }) => {
      if (query?.key === VALID_HASH_KEY) {
        return Promise.resolve({ value: JSON.stringify({ hash, algorithm: 'bcrypt', cost: 4 }) });
      }
      if (query?.key === LOCKOUT_KEY) {
        if (lockoutState === null) return Promise.resolve(null);
        return Promise.resolve({ value: JSON.stringify(lockoutState) });
      }
      return Promise.resolve(null);
    });
    mockFindOneAndUpdate.mockImplementation((_filter: unknown, update: { $set: { value: unknown } }) => {
      // Update our local lockout state to mirror what the DB would now hold
      lockoutState = (update.$set.value as typeof lockoutState);
      writes.push(update.$set);
      return Promise.resolve({ _id: 'fake' });
    });

    // 4 failures — still NOT locked out
    for (let i = 0; i < 4; i++) {
      const ok = await verifyPassphrase(`wrong-${i}`);
      expect(ok).toBe(false);
    }
    expect(writes.length).toBe(4);
    const lastBeforeLockoutValue = writes[3].value as { lockoutUntil: number | null };
    expect(lastBeforeLockoutValue.lockoutUntil).toBe(null);
    expect((writes[3].value as { consecutiveFailures: number }).consecutiveFailures).toBe(4);

    // 5th failure — lockout kicks in
    const ok = await verifyPassphrase('wrong-5');
    expect(ok).toBe(false);
    expect(writes.length).toBe(5);
    const lastWriteValue = writes[4].value as { consecutiveFailures: number; lockoutUntil: number | null };
    expect(lastWriteValue.consecutiveFailures).toBe(5);
    expect(lastWriteValue.lockoutUntil).toBeGreaterThan(Date.now());
  });

  it('resets failure counter on a successful verification', async () => {
    const hash = await realHash();
    mockStoredPassphraseAndLockout(hash);
    // Do one failed attempt first so there's a failure to reset.
    await verifyPassphrase('wrong-1');
    // Now track writes from the success + the subsequent failure.
    const writes: Array<{ value: unknown }> = [];
    mockFindOneAndUpdate.mockImplementation((_filter: unknown, update: { $set: { value: unknown } }) => {
      writes.push(update.$set);
      return Promise.resolve({ _id: 'fake' });
    });
    const ok = await verifyPassphrase(REAL_PASSPHRASE);
    expect(ok).toBe(true);
    expect(writes.length).toBe(1);
    // The successful verify wrote a reset (consecutiveFailures: 0)
    const resetWrite = writes[0].value as { consecutiveFailures: number };
    expect(resetWrite.consecutiveFailures).toBe(0);
  });

  it('resets the failure window after 15 minutes of inactivity', async () => {
    const hash = await realHash();
    // First failure 20 minutes ago — outside the window
    mockStoredPassphraseAndLockout(hash, {
      consecutiveFailures: 2,
      firstFailureAt: Date.now() - 20 * 60 * 1000, // 20 min ago
      lockoutUntil: null,
    });
    const writes: Array<{ value: unknown }> = [];
    mockFindOneAndUpdate.mockImplementation((_filter: unknown, update: { $set: { value: unknown } }) => {
      writes.push(update.$set);
      return Promise.resolve({ _id: 'fake' });
    });
    await verifyPassphrase('wrong');
    expect(writes.length).toBe(1);
    // Should reset to 1, not increment to 3 (window was 20 min, > 15 min)
    const writeValue = writes[0].value as { consecutiveFailures: number };
    expect(writeValue.consecutiveFailures).toBe(1);
  });
});

describe('admin.passphrase — getLockoutStatus()', () => {
  it('returns null when no lockout state exists', async () => {
    const status = await getLockoutStatus();
    expect(status).toBe(null);
  });

  it('returns locked=true when lockoutUntil is in the future', async () => {
    mockStoredPassphraseAndLockout('irrelevant-hash', {
      consecutiveFailures: 5,
      firstFailureAt: Date.now() - 60_000,
      lockoutUntil: Date.now() + 30 * 60 * 1000
    });
    const status = await getLockoutStatus();
    expect(status).not.toBe(null);
    expect(status!.locked).toBe(true);
    expect(status!.remainingMs).toBeGreaterThan(0);
    expect(status!.consecutiveFailures).toBe(5);
  });

  it('returns locked=false when lockoutUntil has passed', async () => {
    mockStoredPassphraseAndLockout('irrelevant-hash', {
      consecutiveFailures: 5,
      firstFailureAt: Date.now() - 2 * 60 * 60 * 1000,
      lockoutUntil: Date.now() - 60 * 60 * 1000 // expired an hour ago
    });
    const status = await getLockoutStatus();
    expect(status!.locked).toBe(false);
    expect(status!.remainingMs).toBe(0);
  });
});

describe('admin.passphrase — seedPassphraseFromEnv()', () => {
  it('throws when ADMIN_DISCORD_PASSPHRASE env var is unset', async () => {
    const original = process.env.ADMIN_DISCORD_PASSPHRASE;
    const originalDiscord = process.env.DISCORD_ADMIN_PASSPHRASE;
    delete process.env.ADMIN_DISCORD_PASSPHRASE;
    delete process.env.DISCORD_ADMIN_PASSPHRASE;
    await expect(seedPassphraseFromEnv()).rejects.toThrow(/ADMIN_DISCORD_PASSPHRASE/);
    if (original) process.env.ADMIN_DISCORD_PASSPHRASE = original;
    if (originalDiscord) process.env.DISCORD_ADMIN_PASSPHRASE = originalDiscord;
  });

  it('hashes and stores the env passphrase', async () => {
    process.env.ADMIN_DISCORD_PASSPHRASE = 'temp-pass-for-test';
    mockFindOne.mockResolvedValue(null); // first boot — no existing hash
    mockFindOneAndUpdate.mockResolvedValue({ _id: 'fake-id' });
    await seedPassphraseFromEnv();
    expect(mockFindOneAndUpdate).toHaveBeenCalledTimes(1);
    const writeCall = mockFindOneAndUpdate.mock.calls[0] as [{ key: string }, { $set: { value: unknown } }];
    expect(writeCall[0].key).toBe('_admin.passphrase.hash');
    const stored = writeCall[1].$set.value as { hash: string; algorithm: string };
    expect(stored.algorithm).toBe('bcrypt');
    // Verify the hash actually corresponds to the plaintext
    const verifyOk = await bcrypt.compare('temp-pass-for-test', stored.hash);
    expect(verifyOk).toBe(true);
    delete process.env.ADMIN_DISCORD_PASSPHRASE;
  });
});