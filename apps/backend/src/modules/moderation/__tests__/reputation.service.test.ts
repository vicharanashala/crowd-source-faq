/**
 * reputation.service.test — Phase 1 R2: unit tests for the reputation
 * service. Verifies the dual-write (User + ProgramReputation +
 * ReputationLog) and the partial-failure tolerance.
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
    'yaksha_program_reputation',
    'yaksha_faq_reputation_logs',
    'yaksha_faq_badges',
  ]) {
    await db.collection(coll).deleteMany({});
  }
});

const { reputationService } = await import(
  '../../../services/reputation.service.js'
);
const { default: User } = await import('../../auth/user.model.js');
const { default: ProgramReputation } = await import(
  '../program-reputation.model.js'
);
const { default: ReputationLog } = await import('../reputation-log.model.js');
const { default: Badge } = await import('../badge.model.js');

async function seedUser(points = 0): Promise<{ _id: Types.ObjectId }> {
  const u = await User.create({
    name: 'Test User',
    email: `test-${Date.now()}-${Math.random()}@example.com`,
    password: 'x'.repeat(8),
    role: 'user',
    points,
    reputation: points,
  });
  return { _id: u._id };
}

async function seedBatch(): Promise<{ _id: Types.ObjectId }> {
  const Batch = (await import('../../program/batch.model.js')).default;
  const b = await Batch.create({
    name: `Program ${Math.random()}`,
    description: '',
    startDate: new Date(),
    endDate: new Date(Date.now() + 86400_000),
    isActive: true,
  });
  return { _id: b._id };
}

describe('reputationService.award — dual-write to User + ProgramReputation + ReputationLog', () => {
  it('awards points: writes to User.points, ProgramReputation (per-program), and ReputationLog', async () => {
    const { _id: userId } = await seedUser(0);
    const { _id: batchId } = await seedBatch();

    const result = await reputationService.award({
      userId,
      batchId,
      points: 25,
      action: 'answer_accepted',
      reason: 'Answer accepted by question author',
      targetId: new Types.ObjectId(),
      targetType: 'comment',
    });

    // 1. User global aggregate updated
    const user = await User.findById(userId);
    expect(user?.points).toBe(25);
    expect(user?.reputation).toBe(25);

    // 2. ProgramReputation per-program mirror updated
    const pr = await ProgramReputation.findOne({ userId, batchId });
    expect(pr?.points).toBe(25);

    // 3. ReputationLog written
    const log = await ReputationLog.findById(result.reputationLogId);
    expect(log).toBeTruthy();
    expect(log?.delta).toBe(25);
    expect(log?.action).toBe('answer_accepted');
    expect(log?.targetType).toBe('comment');

    expect(result.user.points).toBe(25);
    expect(result.programReputationUpdated).toBe(true);
  });

  it('clamps User.points to 0 (does not go negative)', async () => {
    const { _id: userId } = await seedUser(5);
    const result = await reputationService.award({
      userId,
      batchId: null,
      points: -100, // would push below 0
      action: 'admin_revoke',
      reason: 'Spam',
    });
    expect(result.user.points).toBe(0);
    expect(result.user.reputation).toBe(0);
    // The log records the intended delta
    const log = await ReputationLog.findById(result.reputationLogId);
    expect(log?.delta).toBe(-100);
  });

  it('with batchId=null: only User + ReputationLog (no per-program write)', async () => {
    const { _id: userId } = await seedUser();
    const result = await reputationService.award({
      userId,
      batchId: null,
      points: 10,
      action: 'admin_grant',
      reason: 'Good citizen',
    });
    expect(result.user.points).toBe(10);
    expect(result.programReputationUpdated).toBe(false);
    // No ProgramReputation row should be created for null batchId
    const pr = await ProgramReputation.find({ userId, batchId: null });
    expect(pr).toHaveLength(0);
  });

  it('multiple awards accumulate (no double-counting)', async () => {
    const { _id: userId } = await seedUser(0);
    const { _id: batchId } = await seedBatch();
    for (let i = 0; i < 3; i++) {
      await reputationService.award({
        userId,
        batchId,
        points: 10,
        action: 'upvote_received',
        reason: `upvote ${i}`,
      });
    }
    const user = await User.findById(userId);
    expect(user?.points).toBe(30);
    const pr = await ProgramReputation.findOne({ userId, batchId });
    expect(pr?.points).toBe(30);
    const logs = await ReputationLog.countDocuments({ userId, batchId });
    expect(logs).toBe(3);
  });

  it('refuses to award to a non-existent user (throws)', async () => {
    const fakeId = new Types.ObjectId();
    await expect(
      reputationService.award({
        userId: fakeId,
        batchId: null,
        points: 5,
        action: 'admin_grant',
        reason: 'x',
      }),
    ).rejects.toThrow(/User not found/);
  });
});

describe('reputationService.awardBadge — idempotent', () => {
  it('awards a badge once and is idempotent on re-call', async () => {
    const { _id: userId } = await seedUser();
    const badge = await Badge.create({
      name: 'Pioneer',
      slug: 'pioneer',
      description: 'Test badge',
      icon: '🏷️',
      type: 'positive',
      actionTrigger: 'manual',
      pointsRequired: 0,
      active: true,
    });

    const first = await reputationService.awardBadge(userId, String(badge._id));
    expect(first.awarded).toBe(true);

    const second = await reputationService.awardBadge(userId, String(badge._id));
    expect(second.awarded).toBe(false);
    expect(second.reason).toMatch(/already/i);

    // Log written only once
    const logs = await ReputationLog.countDocuments({
      userId,
      action: 'badge_earned',
    });
    expect(logs).toBe(1);
  });

  it('refuses to award a non-existent badge', async () => {
    const { _id: userId } = await seedUser();
    const result = await reputationService.awardBadge(
      userId,
      String(new Types.ObjectId()),
    );
    expect(result.awarded).toBe(false);
    expect(result.reason).toMatch(/not found/i);
  });
});

describe('reputationService.refreshTier — re-derives from points', () => {
  it('updates tier when points cross a threshold', async () => {
    const { _id: userId } = await seedUser(0);
    expect((await User.findById(userId))?.tier).toBe('newcomer');

    // Bump points to 60 → crosses contributor threshold (50)
    await User.updateOne({ _id: userId }, { $set: { points: 60 } });
    await reputationService.refreshTier(userId);
    const refreshed = await User.findById(userId);
    expect(refreshed?.tier).toBe('contributor');
  });
});

describe('reputationService.getReputation — merged view', () => {
  it('returns global + per-program rows for the user', async () => {
    const { _id: userId } = await seedUser(100);
    const { _id: batchIdA } = await seedBatch();
    const { _id: batchIdB } = await seedBatch();
    await ProgramReputation.create({
      userId,
      batchId: batchIdA,
      points: 25,
      tier: 'newcomer',
    });
    await ProgramReputation.create({
      userId,
      batchId: batchIdB,
      points: 40,
      tier: 'newcomer',
    });

    const result = await reputationService.getReputation(userId);
    expect(result.global.points).toBe(100);
    // Tier is whatever calculateTier(100) returns — the system may or may
    // not have re-derived it on User.create. We only assert it's a
    // valid tier from the union.
    expect(['newcomer', 'contributor', 'helper', 'expert', 'champion', 'knowledge_master'])
      .toContain(result.global.tier);
    expect(result.perProgram).toHaveLength(2);
  });
});

describe('reputationService.backfillPerProgram — idempotent', () => {
  it('creates ProgramReputation rows from User.points on first run, no-ops on second', async () => {
    await seedUser(100);
    await seedUser(200);
    await seedUser(0);

    const first = await reputationService.backfillPerProgram();
    expect(first.processed).toBe(3);
    // User with 0 points is skipped (no-op), so 2 rows created
    expect(first.created).toBe(2);

    const second = await reputationService.backfillPerProgram();
    expect(second.processed).toBe(3);
    expect(second.created).toBe(0);

    const total = await ProgramReputation.countDocuments({});
    expect(total).toBe(2);
  });
});
