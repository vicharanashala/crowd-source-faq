/**
 * autoAnswer.e2e.test — Phase 4 §3.2 feedback-loop E2E test.
 *
 * Verifies the full feedback loop end-to-end using a real
 * MongoMemoryServer (so $text indexes work) and a real fetchContext
 * pipeline. Only the LLM call inside the ANSWER branch is mocked
 * via `vi.spyOn`, since we can't ship a live API key into the test.
 *
 * The retriever, ranking, and persistence layer are NEVER mocked —
 * that's the point of an E2E test.
 *
 * Two cases, exactly as plan §3.2 calls out:
 *
 *   1. "admin answers an ask_human post → next similar post gets a
 *      higher score" — seed a FAQ + post A, run processPost, promote
 *      a corrected answer, seed post B, run processPost, assert B's
 *      aiContext.hits contains the admin_corrected ProgramKnowledge
 *      row.
 *
 *   2. "admin edits an AI suggestion → ProgramKnowledge admin_corrected
 *      row created with confidenceBoost=1.5" — seed a post, run
 *      processPost, promote the corrected answer, assert the row
 *      carries the expected fields + batchId + originalContextId.
 *
 * The drill-down endpoint (`getAutoAnswerContext`) tests are added
 * by the Phase 4 endpoint commit so the file compiles incrementally
 * (the handler doesn't exist until that commit lands).
 *
 * Bootstrap mirrors `autoAnswer.test.ts` — MongoMemoryServer,
 * wipe the 5 retriever collections + app_settings in beforeEach,
 * dynamic-import the service AFTER mongoose.connect so the
 * retriever's registerDefaultSources() lands against the live
 * collections.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types } from 'mongoose';

// Mock ONLY the LLM call. We pick a sentinel answer so any
// accidental code path that lands on chatWithConfig is visible
// (the evergreen-confidence short-circuit means the ANSWER branch
// skips the LLM entirely, but the spy stays defensive).
vi.mock('../../utils/ai/aiProvider.js', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '../../utils/ai/aiProvider.js',
  );
  return {
    ...actual,
    chatWithConfig: vi.fn(async () => 'mocked LLM answer (unused in this test path)'),
    getPipelineProviderConfig: vi.fn(async () => ({
      provider: 'minimax' as const,
      apiKey: 'test-key',
      baseURL: 'http://localhost',
      model: 'test-model',
      authHeader: 'Authorization' as const,
      needsAnthropicVersion: false,
    })),
  };
});

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
  vi.restoreAllMocks();
});

// Dynamic imports AFTER mongoose.connect so contextRetriever's
// registerDefaultSources() lands against the live collections.
const { processPost, promoteCorrectedAnswer } = await import('../autoAnswer.js');
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
    tags: string[];
  }> = {},
): Promise<Types.ObjectId> {
  const batchId = overrides.batchId ?? new Types.ObjectId();
  const post = await CommunityPost.create({
    title: overrides.title ?? 'How do I register?',
    body: overrides.body ?? 'I need help with the registration process.',
    author: new Types.ObjectId(),
    status: overrides.status ?? 'unanswered',
    batchId,
    upvotes: [],
    tags: overrides.tags ?? ['registration'],
    deletedAt: null,
    aiAnswerStatus: null,
  });
  return post._id as Types.ObjectId;
}

/**
 * Seed a FAQ with explicit freshnessTier. Defaults to 'evergreen'
 * (confidence 0.95 per faqTextSource) so a single-hit rank tops out
 * at 0.95, comfortably in the ANSWER band. Pass a non-evergreen
 * tier for SUGGEST-band assertions.
 *
 * IMPORTANT: avoid sensitive topics in seed data — `isSensitiveContent`
 * flags "password", "credentials", "payment", etc. and forces the
 * ANSWER branch to 'ask_human' regardless of rank. We use a neutral
 * UI/settings topic (dark mode, dashboard export) that never trips
 * the sensitive-content check.
 */
async function seedFAQ(
  batchId: Types.ObjectId,
  q: string,
  a: string,
  freshnessTier: 'evergreen' | 'seasonal' | 'volatile' = 'evergreen',
) {
  await FAQ.create({
    question: q,
    answer: a,
    category: 'general',
    batchId,
    status: 'approved',
    freshnessTier,
    keywords: [],
    lastVerifiedDate: new Date(),
  });
}

describe('autoAnswer end-to-end feedback loop', () => {
  it('admin-corrected answer boosts the next similar post into suggest/answer territory', async () => {
    const batchId = new Types.ObjectId();

    // 1. Seed a high-quality FAQ about exporting data. We use the
    //    'seasonal' tier (confidence 0.7 per faqTextSource) so a
    //    single-hit rank tops out at 0.7 — comfortably in the
    //    SUGGEST band (≥ 0.60, < 0.85). That keeps the test off
    //    the LLM branch.
    await seedFAQ(
      batchId,
      'How do I export my data from the dashboard?',
      'Open Settings then Data then Export. Choose a date range and format. The export is emailed to you within 5 minutes of submission.',
      'seasonal',
    );

    // 2. Seed CommunityPost A asking the same question.
    const postAId = await seedPost({
      title: 'how to export my data dashboard',
      body: 'I want to download a copy of my account data for my records',
      batchId,
      tags: ['export', 'data'],
    });

    // 3. processPost should retrieve the FAQ via faqTextSource
    //    (confidence=0.7, weight=1.0, fresh → rank=0.7) and land
    //    in the SUGGEST band (0.60 ≤ rank < 0.85). Asserting
    //    suggest/ask_human avoids the LLM branch.
    const firstResult = await processPost(postAId);
    expect(['suggest', 'ask_human']).toContain(firstResult.decision);

    // 4. Admin approves an edit — promoteCorrectedAnswer is exactly
    //    what approveEditAutoAnswer calls after writing the
    //    corrected answer into the post.
    const postADoc = await CommunityPost.findById(postAId);
    if (!postADoc) throw new Error('post A not seeded');
    const correctedAnswer =
      'Open your account Settings, click the Data tab, then choose Export. ' +
      'Pick a date range and one of CSV or JSON format, then submit. ' +
      'A download link is emailed to your registered address within 5 minutes.';

    await promoteCorrectedAnswer({
      post: postADoc,
      correctedAnswer,
      createdBy: new Types.ObjectId(),
    });

    // 5. Assert the ProgramKnowledge row exists with the expected
    //    fields (seedSource, confidenceBoost, batchId match).
    const pkRow = await ProgramKnowledge.findOne({
      originalContextId: String(postAId),
      seedSource: 'admin_corrected',
    });
    expect(pkRow).toBeDefined();
    expect(pkRow?.seedSource).toBe('admin_corrected');
    expect(pkRow?.confidenceBoost).toBe(1.5);
    expect(pkRow?.answer).toContain('Export');
    expect(pkRow?.batchId.toString()).toBe(batchId.toString());

    // 6. Best-effort — make sure ProgramKnowledge's text index is
    //    synced so the kb source's $text query can find the new row.
    //    MongoMemoryServer + Mongoose normally auto-creates indexes
    //    on first write, but syncIndexes() is the documented belt.
    try {
      await ProgramKnowledge.syncIndexes();
    } catch {
      // best-effort
    }

    // 7. Seed CommunityPost B with a very similar question.
    const postBId = await seedPost({
      title: 'dashboard data export not arriving',
      body: 'I tried to download my data but the export email never came',
      batchId,
      tags: ['export', 'data'],
    });

    const secondResult = await processPost(postBId);

    // 8. The new retrieval must include the admin_corrected
    //    ProgramKnowledge row (kb source queries ProgramKnowledge
    //    directly via $text). The hit's source='kb' and
    //    meta.originCollection='ProgramKnowledge' are the
    //    unambiguous fingerprints.
    const kbHits = secondResult.context.hits.filter((h) => h.source === 'kb');
    const adminCorrectedHit = kbHits.find((h) => {
      const meta = h.meta as
        | { originCollection?: string; seedSource?: string }
        | undefined;
      return (
        meta?.originCollection === 'ProgramKnowledge' &&
        meta?.seedSource === 'admin_corrected'
      );
    });
    expect(adminCorrectedHit).toBeDefined();

    // The admin_corrected row carries confidence=0.95 in
    // kbTextSource.confidenceForProgramKnowledge — this should
    // rank above the FAQ (0.7 × 1.0 = 0.7) since the kb source
    // uses weight 1.1. The exact branch depends on rank math
    // but it must move OFF 'ask_human' (the pre-feedback state).
    expect(['suggest', 'answer']).toContain(secondResult.decision);

    // Persisted snapshot must reflect the same hits so the admin
    // drill-down endpoint can show them.
    const postBAfter = await CommunityPost.findById(postBId).lean();
    expect(postBAfter?.aiContext).toBeDefined();
    const persistedHits = postBAfter?.aiContext?.hits as Array<{
      source?: string;
      meta?: { seedSource?: string; originCollection?: string };
    }> | undefined;
    expect(
      persistedHits?.some(
        (h) =>
          h.source === 'kb' &&
          h.meta?.originCollection === 'ProgramKnowledge' &&
          h.meta?.seedSource === 'admin_corrected',
      ),
    ).toBe(true);
  });

  it('admin edits an AI suggestion → ProgramKnowledge admin_corrected row created with confidenceBoost=1.5', async () => {
    const batchId = new Types.ObjectId();

    // Seed an FAQ so the first processPost has a real hit (and
    // lands in SUGGEST instead of the no-context branch).
    await seedFAQ(
      batchId,
      'How to enable dark mode in the dashboard?',
      'Open Settings → Appearance → Theme → Dark. The change applies immediately to all your devices.',
    );

    // 1. Seed a CommunityPost and process it.
    const postId = await seedPost({
      title: 'enable dark mode dashboard settings',
      body: 'I want to switch the dashboard theme to dark mode but cannot find the toggle',
      batchId,
      tags: ['dark-mode', 'settings'],
    });

    const firstResult = await processPost(postId);
    // Decision may be 'suggest', 'ask_human', or 'answer' depending
    // on rank thresholds and evergreen confidence. The crucial
    // assertion is about the ProgramKnowledge row below, not the
    // initial decision branch.
    expect(['suggest', 'ask_human', 'answer']).toContain(firstResult.decision);

    // 2. Simulate the admin approve-edit path. promoteCorrectedAnswer
    //    is exactly what approveEditAutoAnswer calls after writing
    //    the corrected answer into the post.
    const postDoc = await CommunityPost.findById(postId);
    if (!postDoc) throw new Error('post not seeded');

    const correctedAnswer =
      'Navigate to your account Settings, then click the Appearance tab. ' +
      'Under Theme, choose "Dark". The new theme is applied immediately and ' +
      'syncs across all devices on your next sign-in.';

    await promoteCorrectedAnswer({
      post: postDoc,
      correctedAnswer,
      createdBy: new Types.ObjectId(),
    });

    // 3. Assert the ProgramKnowledge row exists with the
    //    contract fields.
    const pkRow = await ProgramKnowledge.findOne({
      originalContextId: String(postId),
      seedSource: 'admin_corrected',
    });
    expect(pkRow).toBeDefined();
    expect(pkRow?.seedSource).toBe('admin_corrected');
    expect(pkRow?.confidenceBoost).toBe(1.5);
    expect(pkRow?.originalContextId).toBe(String(postId));
    expect(pkRow?.batchId.toString()).toBe(batchId.toString());
    expect(pkRow?.question).toBe(postDoc.title);
    expect(pkRow?.answer).toBe(correctedAnswer);

    // Best-effort text-index sync.
    try {
      await ProgramKnowledge.syncIndexes();
    } catch {
      // best-effort
    }

    // 4. Run processPost AGAIN on a NEW similar post. The kb source
    //    must include the admin_corrected row in its hit list.
    const secondPostId = await seedPost({
      title: 'dashboard theme dark mode not visible',
      body: 'Where is the dark mode toggle in my dashboard?',
      batchId,
      tags: ['dark-mode', 'settings'],
    });

    const secondResult = await processPost(secondPostId);

    const kbHits = secondResult.context.hits.filter((h) => h.source === 'kb');
    const adminCorrectedHit = kbHits.find((h) => {
      const meta = h.meta as
        | { originCollection?: string; seedSource?: string }
        | undefined;
      return (
        meta?.originCollection === 'ProgramKnowledge' &&
        meta?.seedSource === 'admin_corrected'
      );
    });
    expect(adminCorrectedHit).toBeDefined();
    expect(adminCorrectedHit?.confidence).toBeGreaterThanOrEqual(0.9);
    expect(['suggest', 'answer']).toContain(secondResult.decision);

    // The aiContext snapshot must reflect the same hits.
    const postAfter = await CommunityPost.findById(secondPostId).lean();
    expect(postAfter?.aiContext).toBeDefined();
  });
});