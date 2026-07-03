/**
 * feature-flag-scoping.test — multi-program isolation for /api/feature-flags.
 *
 * The previous behaviour returned every flag across every program
 * (a cross-tenant data leak). The fix: when `?batchId=<id>` is
 * supplied, the endpoint resolves each flag's value using the
 * per-program override → global default chain. When `?batchId` is
 * missing, the endpoint returns ONLY the global defaults — never
 * per-program overrides from any other program.
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
  await db.collection('yaksha_faq_feature_flags').deleteMany({});
});

const { default: FeatureFlag } = await import('../feature-flag.model.js');
const { default: Batch } = await import('../batch.model.js');
const { FEATURE_FLAGS, listFeatureFlags, ensureAllFlags, setPerProgramFeatureFlagOverride } = await import('../feature-flag.controller.js');

function mockReq(overrides: Record<string, unknown> = {}): any {
  return { query: {}, body: {}, params: {}, user: { _id: new Types.ObjectId() }, ...overrides };
}
function mockRes(): any {
  const body: any = { value: null };
  return {
    statusCode: 200,
    get body() { return body; },
    status(this: any, n: number) { this.statusCode = n; return this; },
    json(this: any, b: unknown) { body.value = b; return this; },
  };
}

async function seedTwoPrograms() {
  return await Promise.all([
    Batch.create({ name: `Program A ${Math.random()}`, description: '', startDate: new Date(), endDate: new Date(Date.now() + 86400_000), isActive: true }),
    Batch.create({ name: `Program B ${Math.random()}`, description: '', startDate: new Date(), endDate: new Date(Date.now() + 86400_000), isActive: true }),
  ]);
}

describe('listFeatureFlags — multi-program isolation', () => {
  it('returns ONLY global defaults when no batchId is supplied (no override leak)', async () => {
    const [progA] = await seedTwoPrograms();
    // Create a per-program override for progA that is enabled.
    await setPerProgramFeatureFlagOverride(
      mockReq({ params: { id: progA._id.toString() }, body: { enabled: true } }),
      mockRes(),
    );

    // Now ask the public endpoint for flags WITHOUT a batchId.
    const res = mockRes();
    await listFeatureFlags(mockReq({ query: {} }), res);
    // The response should contain ONLY the global default docs
    // (batchId: null), never the per-program override.
    const body = res.body.value as { flags: Array<{ batchId?: string | null; enabled: boolean; key: string }> };
    expect(body.flags.every((f) => f.batchId == null)).toBe(true);
  });

  it('returns resolved flag values for a specific program', async () => {
    const [progA] = await seedTwoPrograms();
    // Enable sessionSupport globally, disable goldenTicket globally.
    await ensureAllFlags();
    await FeatureFlag.updateOne({ key: 'sessionSupport', batchId: null }, { $set: { enabled: true } });
    await FeatureFlag.updateOne({ key: 'goldenTicket', batchId: null }, { $set: { enabled: false } });

    // Override goldenTicket for progA to enabled.
    // The route is /admin/programs/:id/feature-flags/:key, so the
    // program id is in `req.params.id` and the flag key in
    // `req.params.key`.
    await setPerProgramFeatureFlagOverride(
      mockReq({ params: { id: progA._id.toString(), key: 'goldenTicket' }, body: { enabled: true } }),
      mockRes(),
    );

    // Ask for progA's resolved flags.
    const res = mockRes();
    await listFeatureFlags(mockReq({ query: { batchId: progA._id.toString() } }), res);
    const body = res.body.value as { batchId: string; flags: Array<{ key: string; enabled: boolean; overridden: boolean }> };
    expect(body.batchId).toBe(progA._id.toString());
    const session = body.flags.find((f) => f.key === 'sessionSupport');
    const golden = body.flags.find((f) => f.key === 'goldenTicket');
    expect(session?.enabled).toBe(true);
    expect(session?.overridden).toBe(false);
    expect(golden?.enabled).toBe(true); // overridden to true for progA
    expect(golden?.overridden).toBe(true);
  });

  it('returns every known flag even when no overrides exist', async () => {
    const [progA] = await seedTwoPrograms();
    const res = mockRes();
    await listFeatureFlags(mockReq({ query: { batchId: progA._id.toString() } }), res);
    const body = res.body.value as { flags: Array<{ key: string; overridden: boolean }> };
    // One entry per known flag in FEATURE_FLAGS.
    expect(body.flags).toHaveLength(Object.keys(FEATURE_FLAGS).length);
    expect(body.flags.every((f) => f.overridden === false)).toBe(true);
  });
});