/**
 * admin-moderator-workload.test — Tests for the Moderator Workload
 * chart aggregation endpoint.
 *
 * Covers:
 *  - default `?days=14` returns 14 rows, one per UTC day, oldest first
 *  - missing days are zero-filled (chart never has a misleading gap)
 *  - custom `?days=N` is respected
 *  - invalid `?days=` falls back to 14
 *  - all 11 ModerationAction values land in the correct bucket
 *  - `total = warnings + account + content` (unknown actions don't inflate it)
 *  - records older than the window are EXCLUDED
 *  - invalid `?batchId=` does not 500 (silently ignored)
 *  - empty collection returns all-zero rows (200, not 500)
 *
 * Pattern follows admin-ai-decision-health.test.ts — Vitest +
 * MongoMemoryServer, mock express req/res with vi.fn() stubs.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types } from 'mongoose';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const mod = await import('../../moderation/moderation-log.model.js');
  const ModerationLog = mod.default;
  await ModerationLog.syncIndexes();
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  const db = mongoose.connection.db;
  if (!db) return;
  try {
    await db.collection('yaksha_faq_moderation_logs').deleteMany({});
  } catch {
    /* ignore */
  }
});

// Import controller AFTER mongoose connection (ESM side-effect ordering).
const { getModeratorWorkload } = await import('../admin.controller.js');
const modelMod = await import('../../moderation/moderation-log.model.js');
const ModerationLogModel = modelMod.default;

interface DayRow {
  date: string;
  warnings: number;
  account: number;
  content: number;
  total: number;
}

/** Build mock (req, res) and run the controller. Returns the json payload. */
async function runController(query: Record<string, string> = {}): Promise<{
  status: number;
  body: DayRow[] | null;
}> {
  const json = (() => undefined) as unknown as (p: unknown) => void;
  const status = (() => undefined) as unknown as (n: number) => unknown;
  const statusCalls: unknown[][] = [];
  const jsonCalls: unknown[][] = [];
  const jsonFn = (...args: unknown[]): void => { jsonCalls.push(args); };
  const statusFn = (...args: unknown[]): unknown => { statusCalls.push(args); return { json: jsonFn }; };
  const req = { query } as unknown as Parameters<typeof getModeratorWorkload>[0];
  const res = { status: statusFn, json: jsonFn } as unknown as Parameters<typeof getModeratorWorkload>[1];
  await getModeratorWorkload(req, res);
  void json; void status;
  if (statusCalls.length > 0) {
    return { status: statusCalls[0]![0] as number, body: null };
  }
  const payload = jsonCalls[0]?.[0];
  return { status: 200, body: (payload as DayRow[] | undefined) ?? null };
}

/** Seed one ModerationLog document. */
async function seedOne(opts: {
  action?: string;
  createdAt?: Date;
  moderatorId?: Types.ObjectId;
  batchId?: Types.ObjectId | null;
} = {}): Promise<void> {
  await ModerationLogModel.create({
    moderatorId: opts.moderatorId ?? new Types.ObjectId(),
    batchId: opts.batchId ?? null,
    action: opts.action ?? 'warn',
    targetId: new Types.ObjectId(),
    targetType: 'user',
    reason: 'seed',
    duration: undefined,
    pointsDeduct: undefined,
    previousState: undefined,
    newState: undefined,
    createdAt: opts.createdAt ?? new Date(),
  });
}

describe('getModeratorWorkload', () => {
  it('returns 14 zero-filled rows when collection is empty', async () => {
    const { status, body } = await runController();
    expect(status).toBe(200);
    expect(body).not.toBeNull();
    expect(body!.length).toBe(14);
    for (const r of body!) {
      expect(r.warnings).toBe(0);
      expect(r.account).toBe(0);
      expect(r.content).toBe(0);
      expect(r.total).toBe(0);
    }
  });

  it('produces 14 day rows ordered oldest → newest by default', async () => {
    const { body } = await runController();
    expect(body).not.toBeNull();
    expect(body!.length).toBe(14);
    for (let i = 1; i < body!.length; i++) {
      expect(body![i].date > body![i - 1].date).toBe(true);
    }
    const todayUtc = new Date().toISOString().split('T')[0];
    expect(body![body!.length - 1].date).toBe(todayUtc);
  });

  it('respects custom ?days= query param', async () => {
    const { body } = await runController({ days: '7' });
    expect(body).not.toBeNull();
    expect(body!.length).toBe(7);
  });

  it('falls back to 14 days when ?days= is invalid', async () => {
    const { body } = await runController({ days: 'not-a-number' });
    expect(body).not.toBeNull();
    expect(body!.length).toBe(14);
  });

  it('counts all 11 ModerationAction values into the right buckets', async () => {
    const today = new Date();

    // warnings bucket: 4 actions × 1 each = 4
    for (const action of ['warn', 'lift_warning', 'point_deduct', 'badge_issue_negative']) {
      await seedOne({ action, createdAt: today });
    }
    // account bucket: 4 actions × 2 each = 8
    for (const action of ['ban', 'unban', 'suspend', 'unsuspend']) {
      await seedOne({ action, createdAt: today });
      await seedOne({ action, createdAt: today });
    }
    // content bucket: 3 actions × 3 each = 9
    for (const action of ['soft_delete', 'restore', 'delete_content']) {
      for (let i = 0; i < 3; i++) {
        await seedOne({ action, createdAt: today });
      }
    }

    const { body } = await runController();
    expect(body).not.toBeNull();
    const todayStr = today.toISOString().split('T')[0];
    const todayRow = body!.find((r) => r.date === todayStr);
    expect(todayRow).toBeDefined();
    expect(todayRow!.warnings).toBe(4);
    expect(todayRow!.account).toBe(8);
    expect(todayRow!.content).toBe(9);
    expect(todayRow!.total).toBe(21);
  });

  it('EXCLUDES records with unknown actions (no "other" bucket)', async () => {
    // Bypass schema validation so we can prove the *aggregation layer*
    // drops unknown actions even if a future schema allowed them in.
    // Mongoose's enum check happens at write-time; the chart endpoint
    // must also be safe if data ever slips past it (e.g., legacy docs).
    const db = mongoose.connection.db!;
    await db.collection('yaksha_faq_moderation_logs').insertOne({
      moderatorId: new Types.ObjectId(),
      batchId: null,
      action: 'experimental_new_action',
      targetId: new Types.ObjectId(),
      targetType: 'user',
      reason: 'seed',
      createdAt: new Date(),
    });

    const { body } = await runController();
    expect(body).not.toBeNull();
    const totalAcrossDays = body!.reduce((s, r) => s + r.total, 0);
    expect(totalAcrossDays).toBe(0);
  });

  it('EXCLUDES records older than the window', async () => {
    const longAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    await seedOne({ action: 'ban', createdAt: longAgo });

    const { body } = await runController();
    expect(body).not.toBeNull();
    const totalAcrossDays = body!.reduce((s, r) => s + r.total, 0);
    expect(totalAcrossDays).toBe(0);
  });

  it('handles an invalid ?batchId= gracefully (no 500)', async () => {
    const { status, body } = await runController({ batchId: 'not-an-objectid' });
    expect(status).toBe(200);
    expect(body).not.toBeNull();
    expect(body!.length).toBe(14);
  });

  it('zero-fills every day before the first record', async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    threeDaysAgo.setUTCHours(12, 0, 0, 0);
    await seedOne({ action: 'warn', createdAt: threeDaysAgo });

    const { body } = await runController();
    expect(body).not.toBeNull();
    const seedDateStr = threeDaysAgo.toISOString().split('T')[0];
    const seedIdx = body!.findIndex((r) => r.date === seedDateStr);
    expect(seedIdx).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < seedIdx; i++) {
      expect(body![i].total).toBe(0);
    }
    expect(body![seedIdx].warnings).toBe(1);
  });
});
