/**
 * contextRetriever.test — Phase 2 R10.
 *
 * Unit tests for the fetchContext pipeline. Covers source registration,
 * per-source top-K, RRF-style score normalization, freshness demotion,
 * batchId scoping, comment inclusion toggle, fault isolation, and the
 * parallelism guarantee (5 sources × 100ms each completes in < 250ms).
 *
 * Uses a real MongoMemoryServer so $text indexes are honored. The 5
 * default text sources run end-to-end against seeded data.
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
    'yaksha_faq_faqs',
    'yaksha_faq_communityposts',
    'yaksha_transcript_knowledge',
    'yaksha_faq_document_insights',
    'yaksha_program_knowledge',
  ]) {
    try {
      await db.collection(coll).deleteMany({});
    } catch {
      // ignore — collection might not exist yet on first run
    }
  }
});

const { fetchContext, registerSource, listSources, _resetSources } = await import(
  '../contextRetriever.js'
);
const { default: FAQ } = await import('../../modules/faq/faq.model.js');
const { default: CommunityPost } = await import(
  '../../modules/community/community-post.model.js'
);
const { TranscriptKnowledge } = await import(
  '../../modules/knowledge/transcript-knowledge.model.js'
);
const DocumentInsight = (
  await import('../../modules/knowledge/document-insight.model.js')
).default;
const ProgramKnowledge = (await import('../../models/ProgramKnowledge.js'))
  .default;

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

async function seedAnsweredPost(
  batchId: Types.ObjectId,
  title: string,
  body: string,
) {
  await CommunityPost.create({
    title,
    body,
    author: new Types.ObjectId(),
    status: 'answered',
    aiAnswerStatus: 'approved',
    batchId,
    upvotes: [],
    answer: 'an approved AI answer to this question',
    deletedAt: null,
    updatedAt: new Date(),
  });
}

async function seedProgramKnowledge(
  batchId: Types.ObjectId,
  q: string,
  a: string,
  seedSource: 'zoom_qa' | 'doc_promoted' | 'admin_response' | 'admin_corrected',
) {
  await ProgramKnowledge.create({
    question: q,
    answer: a,
    keywords: [],
    batchId,
    seedSource,
    confidenceBoost: seedSource === 'admin_corrected' ? 1.5 : 1.0,
    lastVerifiedDate: new Date(),
  });
}

describe('fetchContext — source registry', () => {
  it('auto-registers the default text sources on import', () => {
    const names = listSources().map((s) => s.name).sort();
    expect(names).toEqual(
      ['comments', 'community', 'document', 'faq', 'kb', 'recent_activity', 'web'].sort(),
    );
  });

  it('registerSource adds to list; duplicate name replaces', () => {
    const before = listSources().length;
    registerSource({
      name: 'custom',
      weight: 0.5,
      search: async () => [],
    });
    expect(listSources()).toHaveLength(before + 1);
    expect(listSources().find((s) => s.name === 'custom')?.weight).toBe(0.5);

    registerSource({
      name: 'custom',
      weight: 0.9,
      search: async () => [],
    });
    expect(listSources().find((s) => s.name === 'custom')?.weight).toBe(0.9);
  });
});

describe('fetchContext — fan-out + filtering', () => {
  it('returns hits from multiple sources for a relevant query', async () => {
    const batchId = new Types.ObjectId();
    await seedFAQ(batchId, 'how to register', 'go to the registration page');
    await seedFAQ(batchId, 'how to login', 'click the login button');
    await seedAnsweredPost(batchId, 'where is the schedule', 'see /schedule');
    await seedProgramKnowledge(
      batchId,
      'admissions deadline',
      'before August 15',
      'admin_response',
    );

    const result = await fetchContext('register', {
      batchId: batchId.toString(),
      topK: 5,
      maxHits: 10,
    });

    expect(result.hits.length).toBeGreaterThan(0);
    // Per-source summary includes the names that returned something
    const returnedNames = result.sources
      .filter((s) => s.returned > 0)
      .map((s) => s.name)
      .sort();
    expect(returnedNames.length).toBeGreaterThan(0);
    // query + takenAt are echoed back
    expect(result.query).toContain('register');
    expect(result.takenAt).toMatch(/T.*Z$/);
  });

  it('honors per-source topK', async () => {
    const batchId = new Types.ObjectId();
    for (let i = 0; i < 10; i++) {
      await seedFAQ(
        batchId,
        `registration step ${i}`,
        `step ${i} body about registration`,
      );
    }
    const result = await fetchContext('registration', {
      batchId: batchId.toString(),
      topK: 2,
      maxHits: 20,
    });
    // topK=2 means the faq source returns at most 2 hits
    const faqSource = result.sources.find((s) => s.name === 'faq');
    expect(faqSource).toBeDefined();
    expect(faqSource!.returned).toBeLessThanOrEqual(2);
  });

  it('batchId filter excludes hits from other programs', async () => {
    const batchA = new Types.ObjectId();
    const batchB = new Types.ObjectId();
    await seedFAQ(batchA, 'specific question for batch A', 'answer A');
    await seedFAQ(batchB, 'specific question for batch B', 'answer B');

    const resultA = await fetchContext('specific question', {
      batchId: batchA.toString(),
      topK: 5,
      maxHits: 10,
    });
    // Only batchA's hit should appear in any text-matched source
    for (const h of resultA.hits) {
      if (h.source === 'faq' && h.score > 0) {
        expect(h.batchId).toBe(batchA.toString());
        expect(h.answer).toContain('answer A');
      }
    }
  });

  it('includeComments=false skips the comments source', async () => {
    const result = await fetchContext('any query', {
      batchId: null,
      includeComments: false,
      topK: 3,
    });
    const commentsSummary = result.sources.find((s) => s.name === 'comments');
    // Source was filtered out — no entry in the per-source summary
    expect(commentsSummary).toBeUndefined();
  });

  it('returns <= maxHits', async () => {
    const batchId = new Types.ObjectId();
    for (let i = 0; i < 30; i++) {
      await seedFAQ(batchId, `topic ${i} registration`, `answer ${i}`);
    }
    const result = await fetchContext('registration', {
      batchId: batchId.toString(),
      topK: 5,
      maxHits: 5,
    });
    expect(result.hits.length).toBeLessThanOrEqual(5);
  });
});

describe('fetchContext — ranking + freshness', () => {
  it('ranks admin_corrected ProgramKnowledge higher than recent_activity floor', async () => {
    const batchId = new Types.ObjectId();
    await seedProgramKnowledge(
      batchId,
      'how to reset password',
      'click forgot password',
      'admin_corrected',
    );

    const result = await fetchContext('reset password', {
      batchId: batchId.toString(),
      topK: 5,
      maxHits: 10,
      includeComments: false,
    });
    expect(result.hits.length).toBeGreaterThan(0);
    // The top hit should be from a curated source, not the breadth floor
    const top = result.hits[0];
    expect(top.source).not.toBe('recent_activity');
    // Every hit has the rank fields populated
    for (const h of result.hits) {
      expect(typeof h.rank).toBe('number');
      expect(typeof h.ageDays).toBe('number');
      expect(typeof h.score).toBe('number');
      expect(h.confidence).toBeGreaterThanOrEqual(0);
      expect(h.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('demotes stale hits (ageDays > halfLife * 2) by at least 50%', async () => {
    const batchId = new Types.ObjectId();
    const longAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // 1 year
    await ProgramKnowledge.create({
      question: 'stale topic how to enroll',
      answer: 'old answer about enrollment',
      keywords: [],
      batchId,
      seedSource: 'admin_response',
      confidenceBoost: 1.0,
      lastVerifiedDate: longAgo,
    });
    await ProgramKnowledge.create({
      question: 'fresh topic how to enroll',
      answer: 'fresh answer about enrollment',
      keywords: [],
      batchId,
      seedSource: 'admin_response',
      confidenceBoost: 1.0,
      lastVerifiedDate: new Date(),
    });

    const result = await fetchContext('how to enroll', {
      batchId: batchId.toString(),
      topK: 5,
      maxHits: 10,
      freshnessHalfLifeDays: 90,
    });

    const stale = result.hits.find((h) => h.answer.includes('old answer'));
    const fresh = result.hits.find((h) => h.answer.includes('fresh answer'));
    expect(stale).toBeDefined();
    expect(fresh).toBeDefined();
    // Freshness of 1y/90d halfLife = 0.5 ^ (365/90) ≈ 0.060 → rank should be
    // substantially lower than fresh.
    expect(stale!.rank).toBeLessThan(fresh!.rank * 0.5);
  });
});

describe('fetchContext — fault isolation', () => {
  it('one failing source does not fail the whole fetch', async () => {
    registerSource({
      name: '__boom__',
      weight: 1.0,
      search: async () => {
        throw new Error('simulated source failure');
      },
    });

    let result;
    try {
      result = await fetchContext('anything', { topK: 3 });
    } catch (err) {
      throw new Error('fetchContext should not throw on a failing source: ' + (err as Error).message);
    }
    // The boom source returned 0, others still returned normally
    const boomSummary = result.sources.find((s) => s.name === '__boom__');
    expect(boomSummary).toBeDefined();
    expect(boomSummary!.returned).toBe(0);
  });
});

describe('fetchContext — parallelism', () => {
  it('runs all sources in parallel (wall clock < 5 * single source delay)', async () => {
    // Reset and register 5 slow sources, each takes 100ms.
    _resetSources();
    for (let i = 0; i < 5; i++) {
      registerSource({
        name: `slow_${i}`,
        weight: 1.0,
        search: async () => {
          await new Promise((r) => setTimeout(r, 100));
          return [];
        },
      });
    }
    const start = Date.now();
    const result = await fetchContext('parallel test', { topK: 3, maxHits: 5 });
    const elapsed = Date.now() - start;
    // Serial would be ≥500ms. Parallel should be well under 300ms.
    expect(elapsed).toBeLessThan(300);
    expect(result.sources).toHaveLength(5);
  }, 1000);
});