/**
 * soft-delete.test — Phase 1 R8: tests for the softDeleteService.
 * Covers the per-collection soft-delete + idempotency + restore.
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
  // Wipe every collection the service touches
  for (const coll of [
    'yaksha_faq_communityposts',
    'yaksha_faq_faqs',
    'yaksha_faq_documents',
    'yaksha_faq_zoom_meetings',
  ]) {
    await db.collection(coll).deleteMany({});
  }
});

const { softDeleteService } = await import(
  '../../services/soft-delete.service.js'
);
const { default: CommunityPost } = await import(
  '../../modules/community/community-post.model.js'
);
const { default: FAQ } = await import(
  '../../modules/faq/faq.model.js'
);

async function seedCommunityPost(batchId: Types.ObjectId): Promise<void> {
  await CommunityPost.create({
    title: 'test',
    body: 'body',
    author: new Types.ObjectId(),
    status: 'unanswered',
    batchId,
  });
}

async function seedFAQ(batchId: Types.ObjectId): Promise<void> {
  await FAQ.create({
    question: 'q',
    answer: 'a',
    category: 'general',
    batchId,
  });
}

describe('softDeleteService.softDelete', () => {
  it('marks CommunityPost docs as soft-deleted', async () => {
    const batchId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    await seedCommunityPost(batchId);
    await seedCommunityPost(batchId);
    await seedCommunityPost(batchId);

    const result = await softDeleteService.softDelete({
      batchId,
      deletedBy: userId,
    });
    expect(result.perCollection.CommunityPost).toBe(3);
    expect(result.total).toBe(3);

    // The docs still exist (soft delete, not hard delete)
    const remaining = await CommunityPost.countDocuments({ batchId });
    expect(remaining).toBe(3);
  });

  it('is idempotent — second call returns 0', async () => {
    const batchId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    await seedCommunityPost(batchId);

    const first = await softDeleteService.softDelete({ batchId, deletedBy: userId });
    expect(first.total).toBe(1);

    const second = await softDeleteService.softDelete({ batchId, deletedBy: userId });
    expect(second.total).toBe(0);
  });

  it('scopes to the batchId (other batches are untouched)', async () => {
    const batchA = new Types.ObjectId();
    const batchB = new Types.ObjectId();
    const userId = new Types.ObjectId();
    await seedCommunityPost(batchA);
    await seedCommunityPost(batchB);

    const result = await softDeleteService.softDelete({
      batchId: batchA,
      deletedBy: userId,
    });
    expect(result.perCollection.CommunityPost).toBe(1);

    const batchBRemaining = await CommunityPost.countDocuments({ batchId: batchB });
    expect(batchBRemaining).toBe(1);
  });

  it('works across multiple registered collections', async () => {
    const batchId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    await seedCommunityPost(batchId);
    await seedCommunityPost(batchId);
    await seedFAQ(batchId);

    const result = await softDeleteService.softDelete({
      batchId,
      deletedBy: userId,
    });
    expect(result.perCollection.CommunityPost).toBe(2);
    expect(result.perCollection.FAQ).toBe(1);
    expect(result.total).toBe(3);
  });
});

describe('softDeleteService.restore', () => {
  it('un-marks docs that were soft-deleted', async () => {
    const batchId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    await seedCommunityPost(batchId);
    await seedCommunityPost(batchId);

    await softDeleteService.softDelete({ batchId, deletedBy: userId });
    const restoreResult = await softDeleteService.restore(batchId);
    expect(restoreResult.perCollection.CommunityPost).toBe(2);
  });

  it('no-op on docs that were not soft-deleted', async () => {
    const batchId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    await seedCommunityPost(batchId);
    // No softDelete call first.
    const restoreResult = await softDeleteService.restore(batchId);
    expect(restoreResult.perCollection.CommunityPost).toBe(0);
  });
});
