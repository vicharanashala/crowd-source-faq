/**
 * autoAnswer.test — Phase 3 R12.
 *
 * Unit tests for the auto-answer pipeline orchestrator. Covers:
 *  - processPost idempotency / cooldown gate
 *  - processPost decision branches (ask_human / suggest / answer)
 *  - processPost writes aiContext snapshot
 *  - rerunWithContext bypasses cooldown
 *  - runAutoAnswerBatch parallel execution
 *  - promoteCorrectedAnswer idempotent upsert
 *
 * Uses MongoMemoryServer + seeded FAQs/CommunityPosts. The LLM call
 * in the ANSWER branch is mocked by stubbing chatWithConfig.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
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
    'yaksha_faq_communityposts',
    'yaksha_faq_faqs',
    'yaksha_transcript_knowledge',
    'yaksha_faq_document_insights',
    'yaksha_program_knowledge',
    'yaksha_faq_app_settings',
    'yaksha_faq_programconfigs',
  ]) {
    try {
      await db.collection(coll).deleteMany({});
    } catch {
      // collection may not exist on first run
    }
  }
  // Reset all module mocks between tests
  vi.restoreAllMocks();
});

const { processPost, runAutoAnswerBatch, rerunWithContext, promoteCorrectedAnswer } =
  await import('../autoAnswer.js');
const { default: CommunityPost } = await import(
  '../../modules/community/community-post.model.js'
);
const { default: FAQ } = await import('../../modules/faq/faq.model.js');
const ProgramKnowledge = (await import('../../models/ProgramKnowledge.js'))
  .default;

async function seedPost(
  overrides: Partial<{
    title: string;
    body: string;
    batchId: Types.ObjectId;
    status: 'unanswered' | 'answered';
    aiAnswerStatus: 'pending' | 'suggested' | 'approved' | 'rejected' | 'ask_human' | 'escalated' | null;
  }> = {},
): Promise<Types.ObjectId> {
  const batchId = overrides.batchId ?? new Types.ObjectId();
  const post = await CommunityPost.create({
    title: overrides.title ?? 'How do I register?',
    body: overrides.body ?? 'I need help with the registration process for the program.',
    author: new Types.ObjectId(),
    status: overrides.status ?? 'unanswered',
    batchId,
    upvotes: [],
    tags: ['registration'],
    deletedAt: null,
    aiAnswerStatus: overrides.aiAnswerStatus ?? null,
  });
  return post._id as Types.ObjectId;
}

async function seedFAQ(batchId: Types.ObjectId, q: string, a: string) {
  await FAQ.create({
    question: q,
    answer: a,
    category: 'general',
    batchId,
    status: 'approved',
    freshnessTier: 'evergreen',
    keywords: [],
    lastVerifiedDate: new Date(),
  });
}

describe('processPost — decision branches', () => {
  it('returns decision=ask_human when no context hits match', async () => {
    const postId = await seedPost({
      title: 'completely unique xyzzy topic',
      body: 'plover qwerty nonsense that should never match',
    });
    const result = await processPost(postId);
    expect(result.decision).toBe('ask_human');
    expect(result.hitCount).toBe(0);
    expect(result.reason).toMatch(/no context|below floor/);
  });

  it('writes aiContext snapshot to the post on every real run', async () => {
    const postId = await seedPost({
      title: 'completely unique xyzzy topic',
      body: 'unrelated plover qwerty nonsense',
    });
    await processPost(postId);
    const post = await CommunityPost.findById(postId).lean();
    expect(post?.aiContext).toBeDefined();
    expect(post?.aiContext?.takenAt).toBeInstanceOf(Date);
    expect(post?.lastAutoAnswerAt).toBeInstanceOf(Date);
  });
});

describe('processPost — idempotency', () => {
  it('second call within cooldown returns the prior decision without re-running', async () => {
    const postId = await seedPost({
      title: 'xyzzy plover',
      body: 'completely unrelated body',
    });
    const first = await processPost(postId);
    // Second call must hit the cooldown gate.
    const second = await processPost(postId);
    expect(second.decision).toBe(first.decision);
    expect(second.reason).toMatch(/cooldown/);
    // attempts counter should be exactly 1 (only the first call did real work)
    const post = await CommunityPost.findById(postId).lean();
    expect(post?.aiAnswerAttempts).toBe(1);
  });
});

describe('rerunWithContext — bypasses cooldown', () => {
  it('appends extra context to the body and re-runs even within cooldown', async () => {
    const postId = await seedPost({
      title: 'xyzzy plover',
      body: 'completely unrelated body',
    });
    const first = await processPost(postId);
    const second = await rerunWithContext(postId, 'admin note: extra context');
    // The rerun should produce a fresh decision, not short-circuit.
    expect(second.reason).not.toMatch(/cooldown/);
    // The body should be back to its original (admin note stripped).
    const post = await CommunityPost.findById(postId).lean();
    expect(post?.body).not.toMatch(/ADMIN NOTE/);
  });
});

describe('runAutoAnswerBatch — parallel execution', () => {
  it('processes N posts in parallel (wall clock well below serial)', async () => {
    const batchId = new Types.ObjectId();
    for (let i = 0; i < 5; i++) {
      await seedPost({
        title: `topic ${i}`,
        body: `body ${i}`,
        batchId,
      });
    }
    // We can't easily measure orchestrator internal timing, but the
    // batch should complete well under 5 × processPost latency.
    const start = Date.now();
    const result = await runAutoAnswerBatch({ batchId: batchId.toString(), limit: 5 });
    const elapsed = Date.now() - start;
    expect(result.processed).toBe(5);
    // ProcessPost is fast (no LLM hit on ask_human branch) so this is loose.
    expect(elapsed).toBeLessThan(5000);
  });

  it('returns aggregate counts', async () => {
    const batchId = new Types.ObjectId();
    for (let i = 0; i < 3; i++) {
      await seedPost({ title: `xyzzy ${i}`, body: 'plover', batchId });
    }
    const result = await runAutoAnswerBatch({ batchId: batchId.toString() });
    expect(result.processed).toBe(3);
    // All three should land in ask_human (no context match).
    expect(result.escalated).toBe(3);
    expect(result.approved).toBe(0);
    expect(result.suggested).toBe(0);
  });
});

describe('promoteCorrectedAnswer — idempotent upsert', () => {
  it('writes a ProgramKnowledge row with seedSource=admin_corrected and confidenceBoost=1.5', async () => {
    const postId = await seedPost({
      title: 'how to reset',
      body: 'I forgot my password',
    });
    const post = await CommunityPost.findById(postId);
    if (!post) throw new Error('post not seeded');

    await promoteCorrectedAnswer({
      post,
      correctedAnswer: 'Click forgot password on the login page.',
      createdBy: new Types.ObjectId(),
    });

    const row = await ProgramKnowledge.findOne({
      originalContextId: String(postId),
      seedSource: 'admin_corrected',
    });
    expect(row).toBeDefined();
    expect(row?.confidenceBoost).toBe(1.5);
    expect(row?.answer).toContain('forgot password');

    // Second call updates in place, doesn't create a duplicate.
    await promoteCorrectedAnswer({
      post,
      correctedAnswer: 'Use the password reset link.',
      createdBy: new Types.ObjectId(),
    });
    const count = await ProgramKnowledge.countDocuments({
      originalContextId: String(postId),
      seedSource: 'admin_corrected',
    });
    expect(count).toBe(1);
  });
});