/**
 * admin-ai-decision-health.test — Tests for the AI Decision Health chart
 * aggregation endpoint.
 *
 * Covers:
 *  - default `?days=14` returns 14 rows, one per UTC day, oldest first
 *  - missing days are zero-filled (chart never has a misleading gap)
 *  - custom `?days=N` is respected
 *  - invalid `?days=` falls back to 14
 *  - faq_audit pipeline records are EXCLUDED (chart is auto_answer only)
 *  - unknown `verdict` values are EXCLUDED from buckets (forward-compat)
 *  - records older than the window are EXCLUDED
 *  - invalid `?batchId=` does not 500 (silently ignored)
 *  - empty collection returns all-zero rows (200, not 500)
 *
 * Pattern follows adminDocuments.controller.test.ts — Vitest +
 * MongoMemoryServer, mock express req/res with vi.fn() stubs.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types } from 'mongoose';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const mod = await import('../../ai/pipeline-result.model.js');
  const PipelineResult = mod.PipelineResult;
  await PipelineResult.syncIndexes();
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  const db = mongoose.connection.db;
  if (!db) return;
  try {
    await db.collection('pipelineresults').deleteMany({});
  } catch {
    /* ignore */
  }
});

// Import controller AFTER mongoose connection (ESM side-effect ordering).
const { getAiDecisionHealth } = await import('../admin.controller.js');
// Hoist the model reference for use inside tests.
const modelMod = await import('../../ai/pipeline-result.model.js');
const PipelineResultModel = modelMod.PipelineResult;

interface DayRow {
  date: string;
  approved: number;
  suggested: number;
  escalated: number;
  total: number;
  avgConfidence: number;
}

/** Build mock (req, res) and run the controller. Returns the json payload. */
async function runController(query: Record<string, string> = {}): Promise<{
  status: number;
  body: DayRow[] | null;
}> {
  const json = vi.fn() as unknown as (p: unknown) => void;
  const status = vi.fn(() => ({ json })) as unknown as (n: number) => unknown;
  const req = { query } as unknown as Parameters<typeof getAiDecisionHealth>[0];
  const res = { status, json } as unknown as Parameters<typeof getAiDecisionHealth>[1];
  await getAiDecisionHealth(req, res);

  // Inspect status — if the controller called res.status(), the response
  // path went through an error branch.
  const statusCalls = (status as unknown as { mock?: { calls: unknown[][] } }).mock?.calls ?? [];
  if (statusCalls.length > 0) {
    const code = statusCalls[0]![0] as number;
    return { status: code, body: null };
  }

  const jsonCalls = (json as unknown as { mock?: { calls: unknown[][] } }).mock?.calls ?? [];
  const payload = jsonCalls[0]?.[0];
  return { status: 200, body: (payload as DayRow[] | undefined) ?? null };
}

/** Seed one PipelineResult document. */
async function seedOne(opts: {
  pipeline?: 'auto_answer' | 'faq_audit';
  verdict?: string;
  confidence?: number;
  checkedAt?: Date;
} = {}): Promise<void> {
  await PipelineResultModel.create({
    pipeline: opts.pipeline ?? 'auto_answer',
    targetModel: 'CommunityPost',
    targetId: new Types.ObjectId(),
    targetTitle: 'seed',
    score: 0.5,
    verdict: opts.verdict ?? 'approved',
    reason: 'seed reason',
    confidence: opts.confidence ?? 0.9,
    sources: [],
    flagged: false,
    metadata: {},
    checkedAt: opts.checkedAt ?? new Date(),
    batchId: null,
  });
}

describe('getAiDecisionHealth', () => {
  it('returns 14 zero-filled rows when collection is empty', async () => {
    const { status, body } = await runController();
    expect(status).toBe(200);
    expect(body).not.toBeNull();
    expect(body!.length).toBe(14);
    for (const r of body!) {
      expect(r.approved).toBe(0);
      expect(r.suggested).toBe(0);
      expect(r.escalated).toBe(0);
      expect(r.total).toBe(0);
      expect(r.avgConfidence).toBe(0);
    }
  });

  it('produces 14 day rows ordered oldest → newest by default', async () => {
    const { body } = await runController();
    expect(body).not.toBeNull();
    expect(body!.length).toBe(14);

    // Dates strictly ascending and the last one is today (UTC).
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

  it('counts verdicts into the right buckets', async () => {
    const today = new Date();
    // Three approvals, two suggested, one escalated, all today.
    for (let i = 0; i < 3; i++) {
      await seedOne({ verdict: 'approved', checkedAt: today, confidence: 0.95 });
    }
    for (let i = 0; i < 2; i++) {
      await seedOne({ verdict: 'suggested', checkedAt: today, confidence: 0.70 });
    }
    await seedOne({ verdict: 'escalated', checkedAt: today, confidence: 0.20 });

    const { body } = await runController();
    expect(body).not.toBeNull();
    const todayRow = body!.find((r) => r.date === today.toISOString().split('T')[0]);
    expect(todayRow).toBeDefined();
    expect(todayRow!.approved).toBe(3);
    expect(todayRow!.suggested).toBe(2);
    expect(todayRow!.escalated).toBe(1);
    expect(todayRow!.total).toBe(6);
    // Weighted average = (3*0.95 + 2*0.70 + 1*0.20) / 6 ≈ 0.742
    expect(todayRow!.avgConfidence).toBeGreaterThan(0.70);
    expect(todayRow!.avgConfidence).toBeLessThan(0.78);
  });

  it('EXCLUDES faq_audit pipeline records (chart is auto_answer only)', async () => {
    await seedOne({ pipeline: 'faq_audit', verdict: 'correct', checkedAt: new Date() });
    await seedOne({ pipeline: 'faq_audit', verdict: 'stale', checkedAt: new Date() });

    const { body } = await runController();
    expect(body).not.toBeNull();
    const totalAcrossDays = body!.reduce((s, r) => s + r.total, 0);
    expect(totalAcrossDays).toBe(0);
  });

  it('EXCLUDES records with unknown verdicts (forward-compat)', async () => {
    // Imagine a future schema adds a new verdict — must not silently inflate buckets.
    await seedOne({ verdict: 'experimental_new_verdict', checkedAt: new Date() });

    const { body } = await runController();
    expect(body).not.toBeNull();
    const totalAcrossDays = body!.reduce((s, r) => s + r.total, 0);
    expect(totalAcrossDays).toBe(0);
  });

  it('EXCLUDES records older than the window', async () => {
    const longAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days back
    await seedOne({ verdict: 'approved', checkedAt: longAgo });

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
    // One record 3 days ago, nothing else.
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    threeDaysAgo.setUTCHours(12, 0, 0, 0);
    await seedOne({ verdict: 'approved', checkedAt: threeDaysAgo });

    const { body } = await runController();
    expect(body).not.toBeNull();
    const seedDateStr = threeDaysAgo.toISOString().split('T')[0];
    const seedIdx = body!.findIndex((r) => r.date === seedDateStr);
    expect(seedIdx).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < seedIdx; i++) {
      expect(body![i].total).toBe(0);
      expect(body![i].approved).toBe(0);
      expect(body![i].suggested).toBe(0);
      expect(body![i].escalated).toBe(0);
    }
    expect(body![seedIdx].approved).toBe(1);
  });
});
