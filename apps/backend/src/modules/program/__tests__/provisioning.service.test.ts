/**
 * provisioning.service.test — bootstrap idempotency + cascade contracts.
 *
 * Uses mongodb-memory-server to spin up an isolated database. Covers:
 *   - Bootstrap creates ProgramConfig + ProgramSettings + per-program
 *     FeatureFlag overrides on first call
 *   - Bootstrap is idempotent: second call does not duplicate or
 *     clobber admin-edited rows
 *   - Bootstrap tolerates missing global FeatureFlag defaults
 *   - Bootstrap throws when the Batch itself is missing
 *   - Cascade-delete wipes every program-scoped collection
 *   - Cascade-delete is idempotent and leaves global defaults alone
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
  // Reset every batchId-scoped collection between tests.
  const db = mongoose.connection.db;
  if (!db) throw new Error('no db');
  const collections = await db.listCollections().toArray();
  for (const c of collections) {
    await db.collection(c.name).deleteMany({});
  }
});

const { bootstrapProgram } = await import('../provisioning.service.js');
const { cascadeDeleteProgram } = await import('../cascade-delete.service.js');

describe('provisioning.service — bootstrapProgram', () => {
  it('throws when the Batch is missing', async () => {
    const fakeId = new Types.ObjectId();
    await expect(bootstrapProgram(fakeId.toString())).rejects.toThrow(/not found/);
  });

  it('creates ProgramConfig, ProgramSettings, and per-program FeatureFlag overrides on first call', async () => {
    // Seed: a Batch + one global default FeatureFlag
    const db = mongoose.connection.db!;
    const { default: Batch } = await import('../batch.model.js');
    const { default: FeatureFlag } = await import('../feature-flag.model.js');
    const batch = await Batch.create({
      name: 'Test Program',
      description: 'desc',
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400_000),
      isActive: true,
    });
    await FeatureFlag.create({
      key: 'sessionSupport',
      batchId: null,
      enabled: true,
      label: 'Session support',
      description: 'Live sessions',
      updatedBy: null,
    });

    const result = await bootstrapProgram(batch._id.toString());

    expect(result.created.programConfig).toBe(true);
    expect(result.created.programSettings).toBe(true);
    expect(result.created.featureFlags).toBe(1);
    expect(result.errors).toEqual([]);

    // Verify the docs were actually written
    const programConfig = await db.collection('yaksha_program_configs').findOne({ batchId: batch._id });
    const programSettings = await db.collection('yaksha_program_settings').findOne({ batchId: batch._id });
    const override = await db.collection('yaksha_faq_feature_flags').findOne({ key: 'sessionSupport', batchId: batch._id });
    expect(programConfig).toBeTruthy();
    expect(programSettings).toBeTruthy();
    expect(override).toBeTruthy();
    expect(override?.enabled).toBe(true); // mirrors global default
  });

  it('is idempotent: a second call does not duplicate rows or clobber admin edits', async () => {
    const { default: Batch } = await import('../batch.model.js');
    const { default: FeatureFlag } = await import('../feature-flag.model.js');
    const batch = await Batch.create({
      name: 'Test Program 2',
      description: '',
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400_000),
      isActive: true,
    });
    await FeatureFlag.create({
      key: 'sessionSupport',
      batchId: null,
      enabled: true,
      label: 'Session support',
      description: '',
      updatedBy: null,
    });

    // First call: should create everything
    const r1 = await bootstrapProgram(batch._id.toString());
    expect(r1.created.programConfig).toBe(true);
    expect(r1.created.programSettings).toBe(true);
    expect(r1.created.featureFlags).toBe(1);

    // Admin edits ProgramSettings (sets a custom hero title)
    const { default: ProgramSettings } = await import('../program-settings.model.js');
    await ProgramSettings.updateOne(
      { batchId: batch._id },
      { $set: { 'hero.title': 'ADMIN EDITED' } },
    );

    // Admin toggles the per-program override to false
    await FeatureFlag.updateOne(
      { key: 'sessionSupport', batchId: batch._id },
      { $set: { enabled: false } },
    );

    // Second call: must NOT recreate rows, must NOT clobber admin edits
    const r2 = await bootstrapProgram(batch._id.toString());
    expect(r2.created.programConfig).toBe(false);
    expect(r2.created.programSettings).toBe(false);
    expect(r2.created.featureFlags).toBe(0);

    const settings = await ProgramSettings.findOne({ batchId: batch._id }).lean();
    expect((settings as any)?.hero?.title).toBe('ADMIN EDITED');

    const override = await FeatureFlag.findOne({ key: 'sessionSupport', batchId: batch._id }).lean();
    expect(override?.enabled).toBe(false);
  });

  it('tolerates missing global FeatureFlag defaults (no overrides created)', async () => {
    const { default: Batch } = await import('../batch.model.js');
    const batch = await Batch.create({
      name: 'Test Program 3',
      description: '',
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400_000),
      isActive: true,
    });

    // No global FeatureFlag seeded — bootstrap should still succeed
    const r = await bootstrapProgram(batch._id.toString());
    expect(r.created.programConfig).toBe(true);
    expect(r.created.programSettings).toBe(true);
    expect(r.created.featureFlags).toBe(0);
    expect(r.errors).toEqual([]);
  });
});

describe('provisioning.service — cascadeDeleteProgram', () => {
  it('wipes every program-scoped collection in one call', async () => {
    const { default: Batch } = await import('../batch.model.js');
    const { default: FAQ } = await import('../../faq/faq.model.js');
    const { default: CommunityPost } = await import('../../community/community-post.model.js');

    const batch = await Batch.create({
      name: 'Doomed Program',
      description: '',
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400_000),
      isActive: true,
    });
    await FAQ.create({
      batchId: batch._id,
      question: 'q', answer: 'a', category: 'c', status: 'approved',
    });
    await CommunityPost.create({
      batchId: batch._id,
      title: 't', body: 'b', author: new Types.ObjectId(), status: 'unanswered',
    });

    const r = await cascadeDeleteProgram(batch._id.toString());

    expect(r.deleted.batch).toBe(1);
    expect(r.deleted.faq).toBe(1);
    expect(r.deleted.communityPost).toBe(1);
    // Non-scope collections should not be touched
    expect(r.deleted.user).toBeUndefined();
    // Batch itself should be gone
    const stillThere = await Batch.findById(batch._id);
    expect(stillThere).toBeNull();
  });

  it('leaves global FeatureFlag defaults alone (only deletes per-program overrides)', async () => {
    const { default: Batch } = await import('../batch.model.js');
    const { default: FeatureFlag } = await import('../feature-flag.model.js');

    const batch = await Batch.create({
      name: 'Doomed P2',
      description: '',
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400_000),
      isActive: true,
    });
    await FeatureFlag.create({
      key: 'sessionSupport', batchId: null, enabled: true, label: 'l', description: '', updatedBy: null,
    });
    await FeatureFlag.create({
      key: 'sessionSupport', batchId: batch._id, enabled: false, label: 'l', description: '', updatedBy: null,
    });

    const r = await cascadeDeleteProgram(batch._id.toString());
    expect(r.deleted.featureFlag).toBe(1); // only the per-program override
    const globalDefault = await FeatureFlag.findOne({ key: 'sessionSupport', batchId: null });
    expect(globalDefault).toBeTruthy();
  });

  it('is idempotent: a second call deletes zero rows', async () => {
    const { default: Batch } = await import('../batch.model.js');
    const batch = await Batch.create({
      name: 'Doomed P3',
      description: '',
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400_000),
      isActive: true,
    });
    const r1 = await cascadeDeleteProgram(batch._id.toString());
    const r2 = await cascadeDeleteProgram(batch._id.toString());
    expect(r1.deleted.batch).toBe(1);
    expect(r2.deleted.batch).toBe(0);
  });
});