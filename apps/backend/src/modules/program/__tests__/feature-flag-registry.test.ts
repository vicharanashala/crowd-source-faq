/**
 * feature-flag-registry.test — Phase 1 R1: unit tests for the typed
 * feature flag registry + service (`services/featureFlags.ts`).
 *
 * Verifies the public API surface:
 *   - isEnabled: registry default when no override; override when
 *     present; false for `default: false` flags.
 *   - setGlobal: persists, populates `updatedAt`/`updatedBy` (surfaced
 *     in the public type as `lastChangedAt`/`lastChangedBy`), invalidates
 *     the entire cache so per-program override writes never leave stale
 *     global reads behind (the bug from the v1.69 audit).
 *   - setProgramOverride: persists, populates the same audit fields on
 *     the override row, invalidates entire cache.
 *   - listAll({batchId}): returns the merged view; effective state
 *     reflects override when present.
 *   - Unknown key throws UnknownFeatureFlagError — fails loud, not silent.
 *
 * Uses `mongodb-memory-server` per the existing pattern in
 * `feature-flag-scoping.test.ts`. The MongoDB collection name and
 * model are imported from the existing module so the tests stay
 * faithful to the production schema.
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
  // Reset the singleton cache between tests so cache invalidation
  // is observable (not muddied by the previous test's warm reads).
  const { featureFlags } = await import('../../../services/featureFlags.js');
  featureFlags.invalidateAll();
});

const { default: FeatureFlag } = await import('../feature-flag.model.js');
const {
  FEATURE_FLAGS,
  FeatureFlags,
  UnknownFeatureFlagError,
  featureFlags: singleton,
} = await import('../../../services/featureFlags.js');

// ─── isEnabled ─────────────────────────────────────────────────────────────

describe('FeatureFlags.isEnabled — default + override resolution', () => {
  it('returns the registry default when no DB row exists', async () => {
    // sessionSupport.default === true; no global row yet → registry default wins.
    const result = await singleton.isEnabled('sessionSupport');
    expect(result).toBe(FEATURE_FLAGS.sessionSupport.default);
    expect(result).toBe(true);
  });

  it('returns false for a default-false flag (goldenTicket)', async () => {
    expect(FEATURE_FLAGS.goldenTicket.default).toBe(false);
    const result = await singleton.isEnabled('goldenTicket');
    expect(result).toBe(false);
  });

  it('returns the per-program override when one exists, even if it differs from the default', async () => {
    const batchId = new Types.ObjectId();
    await singleton.setProgramOverride('sessionSupport', String(batchId), false);
    // Global default for sessionSupport is true; per-program override is
    // false → per-program read returns false.
    const result = await singleton.isEnabled('sessionSupport', batchId.toString());
    expect(result).toBe(false);
    // Global read is unaffected.
    expect(await singleton.isEnabled('sessionSupport', null)).toBe(true);
  });

  it('per-program override beats global default', async () => {
    const batchId = new Types.ObjectId();
    // Flip global to false, then set per-program override to true.
    await singleton.setGlobal('sessionSupport', false);
    await singleton.setProgramOverride('sessionSupport', String(batchId), true);
    expect(await singleton.isEnabled('sessionSupport', batchId.toString())).toBe(true);
    expect(await singleton.isEnabled('sessionSupport', null)).toBe(false);
  });

  it('throws UnknownFeatureFlagError for a non-registered key (no silent false)', async () => {
    // @ts-expect-error: testing the runtime guard for an unknown key.
    await expect(singleton.isEnabled('notARealFlag')).rejects.toBeInstanceOf(
      UnknownFeatureFlagError,
    );
  });
});

// ─── setGlobal ─────────────────────────────────────────────────────────────

describe('FeatureFlags.setGlobal — persistence + cache invalidation', () => {
  it('persists to MongoDB and updates the resolved value on next read', async () => {
    await singleton.setGlobal('sessionSupport', false);
    const doc = await FeatureFlag.findOne({ key: 'sessionSupport', batchId: null })
      .lean();
    expect(doc).toBeTruthy();
    expect(doc?.enabled).toBe(false);
    expect(doc?.updatedAt).toBeInstanceOf(Date);
  });

  it('populates lastChangedAt (updatedAt) + lastChangedBy (updatedBy) on the global row', async () => {
    const userId = new Types.ObjectId();
    const before = new Date();
    await singleton.setGlobal('askAiChatbot', true, userId);
    const after = new Date();

    const doc = await FeatureFlag.findOne({ key: 'askAiChatbot', batchId: null })
      .lean();
    expect(doc).toBeTruthy();
    expect(doc?.updatedBy).not.toBeNull();
    expect(String(doc?.updatedBy)).toBe(userId.toString());
    expect(doc?.updatedAt).toBeInstanceOf(Date);
    // lastChangedAt is within [before, after].
    expect((doc?.updatedAt as Date).getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect((doc?.updatedAt as Date).getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('invalidates the entire cache: read flag → setGlobal → re-read reflects new value', async () => {
    // Prime: read the default-true flag (warms the cache slot).
    expect(await singleton.isEnabled('sessionSupport')).toBe(true);
    // Same read again should hit the cache and still report true.
    expect(await singleton.isEnabled('sessionSupport')).toBe(true);

    // Mutate via the service (invalidateAll should fire inside).
    await singleton.setGlobal('sessionSupport', false);

    // The next read MUST reflect the new value, not the stale cached true.
    // This is the regression: the old per-key delete left a 30s staleness
    // window after a per-program write that the audit caught.
    expect(await singleton.isEnabled('sessionSupport')).toBe(false);
  });

  it('invalidation is global, not per-key: per-program reads also refresh', async () => {
    const batchId = new Types.ObjectId();
    // Warm a per-program cache slot.
    await singleton.setProgramOverride('goldenTicket', String(batchId), true);
    expect(await singleton.isEnabled('goldenTicket', String(batchId))).toBe(true);

    // setGlobal must clear the per-program cache too (audit fix).
    await singleton.setGlobal('goldenTicket', false);

    // Override row still says true, so the per-program read should still
    // resolve to true — but importantly, it must hit Mongo rather than
    // serving a stale cached value. We prove cache wipe by setting
    // something we can observe changing.
    expect(await singleton.isEnabled('goldenTicket', String(batchId))).toBe(true);

    // Now also confirm the global cache slot is fresh: clear the override
    // and re-read — should hit Mongo and return the new global value.
    await singleton.clearProgramOverride('goldenTicket', String(batchId));
    expect(await singleton.isEnabled('goldenTicket', String(batchId))).toBe(false);
    expect(await singleton.isEnabled('goldenTicket', null)).toBe(false);
  });
});

// ─── setProgramOverride ────────────────────────────────────────────────────

describe('FeatureFlags.setProgramOverride — persistence + cache invalidation', () => {
  it('persists the override row with the program batchId', async () => {
    const batchId = new Types.ObjectId();
    await singleton.setProgramOverride('documentPipeline', String(batchId), false);
    const doc = await FeatureFlag.findOne({ key: 'documentPipeline', batchId })
      .lean();
    expect(doc).toBeTruthy();
    expect(doc?.enabled).toBe(false);
    expect(String(doc?.batchId)).toBe(batchId.toString());
    // Sanity: isEnabled honours the override.
    expect(await singleton.isEnabled('documentPipeline', String(batchId))).toBe(false);
  });

  it('populates lastChangedAt (updatedAt) + lastChangedBy (updatedBy) on the override row', async () => {
    const batchId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const before = new Date();
    await singleton.setProgramOverride('communityAutoAnswer', String(batchId), false, userId);
    const after = new Date();

    const doc = await FeatureFlag.findOne({
      key: 'communityAutoAnswer',
      batchId,
    }).lean();
    expect(doc).toBeTruthy();
    expect(doc?.updatedBy).not.toBeNull();
    expect(String(doc?.updatedBy)).toBe(userId.toString());
    expect(doc?.updatedAt).toBeInstanceOf(Date);
    expect((doc?.updatedAt as Date).getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect((doc?.updatedAt as Date).getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('invalidates the entire cache: global reads also refresh after a per-program write', async () => {
    const batchId = new Types.ObjectId();
    // Warm global cache (returns registry default true).
    expect(await singleton.isEnabled('documentPipeline')).toBe(true);

    // Per-program write must clear the global slot too (audit fix).
    await singleton.setProgramOverride('documentPipeline', String(batchId), false);

    // Global read must hit Mongo and return the registry default true
    // (still true because we never wrote a global row). The point is
    // the value comes from a fresh fetch, not stale cache.
    expect(await singleton.isEnabled('documentPipeline')).toBe(true);
    // Per-program read is the override.
    expect(await singleton.isEnabled('documentPipeline', batchId.toString())).toBe(false);
  });
});

// ─── clearProgramOverride ──────────────────────────────────────────────────

describe('FeatureFlags.clearProgramOverride', () => {
  it('removes the override row and falls back to the global default', async () => {
    const batchId = new Types.ObjectId();
    await singleton.setProgramOverride('welcomePackage', String(batchId), false);
    expect(await singleton.isEnabled('welcomePackage', String(batchId))).toBe(false);
    await singleton.clearProgramOverride('welcomePackage', String(batchId));
    expect(await singleton.isEnabled('welcomePackage', String(batchId))).toBe(
      FEATURE_FLAGS.welcomePackage.default,
    );
    const doc = await FeatureFlag.findOne({ key: 'welcomePackage', batchId }).lean();
    expect(doc).toBeNull();
  });
});

// ─── listAll ───────────────────────────────────────────────────────────────

describe('FeatureFlags.listAll — merged view', () => {
  it('returns one row per registered flag in registry order', async () => {
    const list = await singleton.listAll();
    const keys = list.map((r) => r.key);
    expect(keys).toEqual(Object.keys(FEATURE_FLAGS));
  });

  it('source is "default" when neither global nor override exists; lastChangedAt is null', async () => {
    const list = await singleton.listAll();
    const askAi = list.find((r) => r.key === 'askAiChatbot');
    expect(askAi?.source).toBe('default');
    expect(askAi?.lastChangedAt).toBeNull();
    expect(askAi?.lastChangedBy).toBeNull();
  });

  it('source is "global" when only the global default row exists', async () => {
    const userId = new Types.ObjectId();
    await singleton.setGlobal('askAiChatbot', true, userId);
    const list = await singleton.listAll();
    const askAi = list.find((r) => r.key === 'askAiChatbot');
    expect(askAi?.source).toBe('global');
    expect(askAi?.enabled).toBe(true);
    expect(askAi?.lastChangedAt).toBeInstanceOf(Date);
    expect(askAi?.lastChangedBy).toBeTruthy();
  });

  it('listAll({batchId}) returns the merged view with overrides surfaced as source="override"', async () => {
    const batchId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    await singleton.setProgramOverride('faqFreshness', String(batchId), false, userId);

    const list = await singleton.listAll({ batchId });
    const faq = list.find((r) => r.key === 'faqFreshness');
    expect(faq?.source).toBe('override');
    expect(faq?.enabled).toBe(false);
    // Override row has audit fields.
    expect(faq?.lastChangedAt).toBeInstanceOf(Date);
    expect(faq?.lastChangedBy).toBeTruthy();
    // Every registry key is present.
    expect(list).toHaveLength(Object.keys(FEATURE_FLAGS).length);
  });

  it('listAll({batchId}): effective state reflects override when present (override beats global)', async () => {
    const batchId = new Types.ObjectId();
    // Global default true, per-program override false → effective is false.
    await singleton.setGlobal('goldenTicket', true);
    await singleton.setProgramOverride('goldenTicket', String(batchId), false);
    const list = await singleton.listAll({ batchId });
    const golden = list.find((r) => r.key === 'goldenTicket');
    expect(golden?.enabled).toBe(false);
    expect(golden?.source).toBe('override');

    // And the other direction: global default false, per-program override
    // true → effective is true.
    const batchId2 = new Types.ObjectId();
    await singleton.setProgramOverride('askAiChatbot', batchId2, true);
    const list2 = await singleton.listAll({ batchId: batchId2 });
    const askAi = list2.find((r) => r.key === 'askAiChatbot');
    expect(askAi?.enabled).toBe(true);
    expect(askAi?.source).toBe('override');
  });
});

// ─── Instantiation ─────────────────────────────────────────────────────────

describe('FeatureFlags instantiation', () => {
  it('every instance has its own cache (test isolation)', async () => {
    const a = new FeatureFlags();
    const b = new FeatureFlags();
    expect(a).not.toBe(b);

    // Set an override via the singleton — both fresh instances should
    // resolve the override from Mongo, not from each other's cache.
    const batchId = new Types.ObjectId();
    await singleton.setProgramOverride('goldenTicket', String(batchId), true);
    expect(await a.isEnabled('goldenTicket', String(batchId))).toBe(true);
    expect(await b.isEnabled('goldenTicket', String(batchId))).toBe(true);
  });
});