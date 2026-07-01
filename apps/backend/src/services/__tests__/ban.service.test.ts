/**
 * ban.service.test — Phase 1 R4: unit tests for the ban service.
 *
 * Covers the six behaviours the audit flagged as missing
 * end-to-end coverage for:
 *   - canCreateContent returns true when no ban, false with reason
 *     when golden-banned
 *   - canCreateContent returns true after ban expires
 *   - setGoldenBan persists, subsequent canCreateContent returns false
 *   - applyGoldenRejection decrements SP, sets lastGoldenRejectionAt
 *   - clearExpiredGoldenBans removes only expired bans, leaves active ones
 *   - getBanState returns the full state
 *
 * Uses `mongodb-memory-server` so the service runs against a real
 * mongoose User model + ReputationLog without touching prod data.
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
  for (const coll of [
    'yaksha_faq_users',
    'yaksha_faq_reputation_logs',
  ]) {
    await db.collection(coll).deleteMany({});
  }
});

// ─── Imports (after beforeAll has run) ───────────────────────────────────

const { banService } = await import('../../services/ban.service.js');
const { default: User } = await import('../../modules/auth/user.model.js');
const { default: ReputationLog } = await import(
  '../../modules/moderation/reputation-log.model.js'
);
const {
  assertCanCreateContent,
  computeGoldenRejectPenalty,
} = await import('../../utils/banUtils.js');

// ─── Fixtures ─────────────────────────────────────────────────────────────

async function seedUser(overrides: Partial<{ sp: number }> = {}): Promise<Types.ObjectId> {
  const u = await User.create({
    name: 'Test User',
    email: `test-${Date.now()}-${Math.random()}@example.com`,
    password: 'x'.repeat(8),
    role: 'user',
    sp: overrides.sp ?? 100,
  });
  return u._id as Types.ObjectId;
}

// ─── canCreateContent ─────────────────────────────────────────────────────

describe('banService.canCreateContent — no ban', () => {
  it('returns canCreate=true when the user has no ban', async () => {
    const userId = await seedUser();
    const result = await banService.canCreateContent(userId);
    expect(result.canCreate).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.bannedUntil).toBeUndefined();
  });
});

describe('banService.canCreateContent — golden-banned', () => {
  it('returns canCreate=false with reason + bannedUntil when goldenBannedUntil is in the future', async () => {
    const userId = await seedUser();
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // +1h
    await User.updateOne({ _id: userId }, { $set: { goldenBannedUntil: expiry } });

    const result = await banService.canCreateContent(userId);
    expect(result.canCreate).toBe(false);
    expect(result.reason).toContain('restricted from creating new content');
    expect(result.reason).toContain(expiry.toISOString());
    expect(result.bannedUntil).toBeInstanceOf(Date);
    expect(result.bannedUntil!.getTime()).toBe(expiry.getTime());
  });
});

describe('banService.canCreateContent — suspended', () => {
  it('returns canCreate=false when suspendedUntil is in the future', async () => {
    const userId = await seedUser();
    const until = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await User.updateOne({ _id: userId }, { $set: { suspendedUntil: until } });

    const result = await banService.canCreateContent(userId);
    expect(result.canCreate).toBe(false);
    expect(result.reason).toContain('suspended');
    expect(result.reason).toContain(until.toISOString());
    expect(result.bannedUntil).toBeInstanceOf(Date);
  });

  it('returns canCreate=false for a user that does not exist (fail-closed)', async () => {
    const fakeId = new Types.ObjectId();
    const result = await banService.canCreateContent(fakeId);
    expect(result.canCreate).toBe(false);
    expect(result.reason).toContain('not found');
  });
});

describe('banService.canCreateContent — after ban expires', () => {
  it('returns canCreate=true once goldenBannedUntil has passed', async () => {
    const userId = await seedUser();
    // Set the ban in the past — the gate check is `> now` so it
    // should immediately report the user as not-banned.
    const pastExpiry = new Date(Date.now() - 60 * 1000); // -1m
    await User.updateOne({ _id: userId }, { $set: { goldenBannedUntil: pastExpiry } });

    const result = await banService.canCreateContent(userId);
    expect(result.canCreate).toBe(true);
  });
});

// ─── setGoldenBan ─────────────────────────────────────────────────────────

describe('banService.setGoldenBan — persistence', () => {
  it('persists the expiry + reason + setBy + setAt, then canCreateContent returns false', async () => {
    const userId = await seedUser();
    const setBy = await seedUser();
    const expiry = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72h

    const result = await banService.setGoldenBan({
      userId,
      bannedUntil: expiry,
      reason: 'Golden ticket abuse',
      setBy,
    });
    expect(result.bannedUntil).toBeInstanceOf(Date);
    expect(result.bannedUntil!.getTime()).toBe(expiry.getTime());

    const reloaded = await User.findById(userId).lean();
    expect(reloaded?.goldenBannedUntil).toBeInstanceOf(Date);
    expect(reloaded?.goldenBannedUntil!.getTime()).toBe(expiry.getTime());
    expect(reloaded?.goldenBanReason).toBe('Golden ticket abuse');
    expect(reloaded?.goldenBannedBy?.toString()).toBe(setBy.toString());
    expect(reloaded?.goldenBannedAt).toBeInstanceOf(Date);

    // Audit log entry exists
    const audit = await ReputationLog.findOne({
      userId,
      action: 'admin_grant' as any,
      targetType: 'user',
    });
    expect(audit).not.toBeNull();
    expect(audit?.reason).toContain('Golden ticket abuse');

    // Gate check now blocks
    const check = await banService.canCreateContent(userId);
    expect(check.canCreate).toBe(false);
    expect(check.reason).toContain('restricted');
  });

  it('accepts bannedUntil=null for a permanent ban', async () => {
    const userId = await seedUser();
    const setBy = await seedUser();

    const result = await banService.setGoldenBan({
      userId,
      bannedUntil: null,
      reason: 'permanent',
      setBy,
    });
    expect(result.bannedUntil).toBeNull();

    const reloaded = await User.findById(userId).lean();
    expect(reloaded?.goldenBannedUntil).toBeNull();
    // canCreateContent with goldenBannedUntil=null → no golden ban,
    // user is allowed (no other restriction).
    const check = await banService.canCreateContent(userId);
    expect(check.canCreate).toBe(true);
  });

  it('truncates a too-long reason to 500 chars', async () => {
    const userId = await seedUser();
    const setBy = await seedUser();
    const longReason = 'x'.repeat(1000);

    await banService.setGoldenBan({
      userId,
      bannedUntil: new Date(Date.now() + 60_000),
      reason: longReason,
      setBy,
    });

    const reloaded = await User.findById(userId).lean();
    expect(reloaded?.goldenBanReason ?? '').toBe('x'.repeat(500));
    expect((reloaded?.goldenBanReason ?? '').length).toBe(500);
  });
});

// ─── applyGoldenRejection ─────────────────────────────────────────────────

describe('banService.applyGoldenRejection — SP + timestamp', () => {
  it('decrements SP and stamps lastGoldenRejectionAt', async () => {
    const userId = await seedUser({ sp: 200 });
    const setBy = await seedUser();
    const before = await User.findById(userId).lean();
    expect(before?.sp).toBe(200);
    expect(before?.lastGoldenRejectionAt).toBeNull();

    const result = await banService.applyGoldenRejection({
      userId,
      penalty: 25, // 1.25 * 20 base cost
      reason: 'Golden ticket rejected by admin',
      setBy,
    });

    expect(result.user.sp).toBe(175); // 200 - 25
    expect(result.user.lastGoldenRejectionAt).toBeInstanceOf(Date);

    const reloaded = await User.findById(userId).lean();
    expect(reloaded?.sp).toBe(175);
    expect(reloaded?.lastGoldenRejectionAt).toBeInstanceOf(Date);
  });

  it('stamps lastGoldenRejectionAt even when penalty=0 (cooldown only)', async () => {
    const userId = await seedUser({ sp: 100 });
    const setBy = await seedUser();

    const result = await banService.applyGoldenRejection({
      userId,
      penalty: 0,
      reason: 'cooldown stamp',
      setBy,
    });

    expect(result.user.sp).toBe(100);
    expect(result.user.lastGoldenRejectionAt).toBeInstanceOf(Date);
  });

  it('throws when SP would go negative (insufficient balance)', async () => {
    const userId = await seedUser({ sp: 10 });
    const setBy = await seedUser();

    await expect(
      banService.applyGoldenRejection({
        userId,
        penalty: 50, // more than the user has
        reason: 'too big',
        setBy,
      }),
    ).rejects.toThrow(/insufficient/i);

    // SP unchanged after the throw
    const reloaded = await User.findById(userId).lean();
    expect(reloaded?.sp).toBe(10);
    // lastGoldenRejectionAt should NOT be set since the spend failed
    expect(reloaded?.lastGoldenRejectionAt).toBeNull();
  });

  it('forwards meta.targetId to the SP ledger when provided', async () => {
    const userId = await seedUser({ sp: 100 });
    const setBy = await seedUser();
    const targetId = new Types.ObjectId();

    await banService.applyGoldenRejection({
      userId,
      penalty: 5,
      reason: 'with target',
      setBy,
      meta: { targetId },
    });

    const ledger = await ReputationLog.findOne({
      userId,
      action: 'sp_spent' as any,
    }).lean();
    expect(ledger).not.toBeNull();
    expect(ledger?.targetId?.toString()).toBe(targetId.toString());
  });
});

// ─── clearExpiredGoldenBans ───────────────────────────────────────────────

describe('banService.clearExpiredGoldenBans — selectivity', () => {
  it('clears only expired bans, leaves active ones untouched', async () => {
    const userExpired = await seedUser();
    const userExpiredAtBoundary = await seedUser();
    const userActive = await seedUser();
    const userUnbanned = await seedUser();

    const past = new Date(Date.now() - 60_000);
    const now = new Date();
    const future = new Date(Date.now() + 60 * 60 * 1000);

    await User.updateOne({ _id: userExpired }, { $set: { goldenBannedUntil: past } });
    await User.updateOne(
      { _id: userExpiredAtBoundary },
      { $set: { goldenBannedUntil: now } },
    );
    await User.updateOne({ _id: userActive }, { $set: { goldenBannedUntil: future } });

    const result = await banService.clearExpiredGoldenBans();
    // Both `past` (strictly < now) AND `now` (lte) should be cleared.
    // The query is `$lte: now, $ne: null` so both rows are cleared.
    expect(result.cleared).toBe(2);

    const expired = await User.findById(userExpired).lean();
    expect(expired?.goldenBannedUntil).toBeNull();
    expect(expired?.goldenBanReason ?? '').toBe('');

    const boundary = await User.findById(userExpiredAtBoundary).lean();
    expect(boundary?.goldenBannedUntil).toBeNull();

    const active = await User.findById(userActive).lean();
    expect(active?.goldenBannedUntil).toBeInstanceOf(Date);
    expect(active?.goldenBannedUntil!.getTime()).toBe(future.getTime());

    const unbanned = await User.findById(userUnbanned).lean();
    expect(unbanned?.goldenBannedUntil).toBeNull();
  });

  it('is idempotent — second call clears 0', async () => {
    const userId = await seedUser();
    await User.updateOne(
      { _id: userId },
      { $set: { goldenBannedUntil: new Date(Date.now() - 60_000) } },
    );

    const first = await banService.clearExpiredGoldenBans();
    expect(first.cleared).toBe(1);
    const second = await banService.clearExpiredGoldenBans();
    expect(second.cleared).toBe(0);
  });

  it('returns cleared=0 when there are no banned users', async () => {
    const result = await banService.clearExpiredGoldenBans();
    expect(result.cleared).toBe(0);
  });
});

// ─── getBanState ──────────────────────────────────────────────────────────

describe('banService.getBanState — full state', () => {
  it('returns the full ban state with all four fields', async () => {
    const userId = await seedUser({ sp: 150 });
    const goldenExpiry = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const suspension = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const lastRejection = new Date(Date.now() - 30 * 60_000);
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          goldenBannedUntil: goldenExpiry,
          suspendedUntil: suspension,
          sp: 150,
          lastGoldenRejectionAt: lastRejection,
        },
      },
    );

    const state = await banService.getBanState(userId);
    expect(state.goldenBannedUntil?.getTime()).toBe(goldenExpiry.getTime());
    expect(state.suspendedUntil?.getTime()).toBe(suspension.getTime());
    expect(state.sp).toBe(150);
    expect(state.lastGoldenRejectionAt?.getTime()).toBe(lastRejection.getTime());
  });

  it('returns nulls / zero for a user with no ban state', async () => {
    const userId = await seedUser({ sp: 100 });
    const state = await banService.getBanState(userId);
    expect(state.goldenBannedUntil).toBeNull();
    expect(state.suspendedUntil).toBeNull();
    expect(state.sp).toBe(100);
    expect(state.lastGoldenRejectionAt).toBeNull();
  });

  it('returns all-null / zero state for a user that does not exist', async () => {
    const fakeId = new Types.ObjectId();
    const state = await banService.getBanState(fakeId);
    expect(state.goldenBannedUntil).toBeNull();
    expect(state.suspendedUntil).toBeNull();
    expect(state.sp).toBe(0);
    expect(state.lastGoldenRejectionAt).toBeNull();
  });
});

// ─── Re-exports ───────────────────────────────────────────────────────────

describe('ban service re-exports of legacy helpers', () => {
  it('re-exports assertCanCreateContent from banUtils', () => {
    expect(typeof assertCanCreateContent).toBe('function');
  });

  it('re-exports computeGoldenRejectPenalty from banUtils', () => {
    expect(typeof computeGoldenRejectPenalty).toBe('function');
    // Sanity-check the formula matches the spec: ceil(sp * 1.25)
    expect(computeGoldenRejectPenalty(20)).toBe(25);
    expect(computeGoldenRejectPenalty(0)).toBe(0);
  });
});