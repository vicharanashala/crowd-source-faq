/**
 * batch-slug.test — multi-program isolation bug fixes.
 *
 * Three bugs that surfaced from the audit:
 *   1. getBatchBySlug only returned `isActive: true` programs — any
 *      archived/inactive program 404'd even for admins.
 *   2. ProgramContext.resolveInitial silently auto-promoted the user
 *      from their explicit stored program to a different non-empty
 *      program if their stored program was empty (frontend-only fix).
 *   3. URL ↔ localStorage sync was one-way (URL → state on mount,
 *      never the other way around — refreshes lost the choice if the
 *      URL had a stale slug).
 *
 * Bug 1 lives in the backend; bugs 2 and 3 live in the frontend.
 * This test file covers bug 1 end-to-end via supertest-style direct
 * controller calls. The frontend fixes are validated by the
 * ProgramContext unit tests (added separately).
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
  await db.collection('yaksha_faq_batches').deleteMany({});
  await db.collection('yaksha_faq_faqs').deleteMany({});
});

// Import AFTER mongoose connects so the model uses the in-memory server.
const { default: Batch } = await import('../batch.model.js');
const { default: FAQ } = await import('../../faq/faq.model.js');
const { getBatchBySlug } = await import('../batch.controller.js');

// Minimal Express-like req/res helpers for calling the controller.
// We don't run the full Express stack — we just need req.params and
// a res that captures the status + body for assertion. Cast as
// `any` to bypass Express's strict `Response` type since we're
// stubbing the body/status for tests.
function mockReqRes(slug: string): {
  req: Parameters<typeof getBatchBySlug>[0];
  res: any;
} {
  const resBody = { value: null as unknown };
  const res: any = {
    statusCode: 200,
    get body() { return resBody.value; },
    status(n: number) {
      this.statusCode = n;
      return { json: (b: unknown) => { resBody.value = b; } };
    },
    json(b: unknown) {
      resBody.value = b;
    },
  };
  return {
    req: { params: { slug } } as unknown as Parameters<typeof getBatchBySlug>[0],
    res,
  };
}

function asBatch(b: unknown): { _id: string; name: string; isActive: boolean; status?: string; faqCount: number } {
  return b as { _id: string; name: string; isActive: boolean; status?: string; faqCount: number };
}

describe('getBatchBySlug — multi-program isolation fix', () => {
  it('returns ACTIVE programs by slug', async () => {
    const batch = await Batch.create({
      name: 'Active Program',
      description: '',
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400_000),
      isActive: true,
    });
    const { req, res } = mockReqRes('active-program');
    await getBatchBySlug(req, res);
    expect(res.statusCode).toBe(200);
    // The controller spreads `match` directly, so `_id` is an ObjectId
    // instance (Mongoose defaults). Compare via .toString().
    expect(asBatch(res.body)._id.toString()).toBe(batch._id.toString());
  });

  it('returns INACTIVE programs by slug (admin reach — bug fix)', async () => {
    // This is the exact bug from the screenshot. Previously this
    // returned 404 because the lookup filtered by isActive: true.
    const batch = await Batch.create({
      name: 'Monsoonship',
      description: '',
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400_000),
      isActive: false,
    });
    const { req, res } = mockReqRes('monsoonship');
    await getBatchBySlug(req, res);
    expect(res.statusCode).toBe(200);
    expect(asBatch(res.body)._id.toString()).toBe(batch._id.toString());
    expect(asBatch(res.body).isActive).toBe(false);
  });

  it('returns ARCHIVED programs by slug (status=archived)', async () => {
    const batch = await Batch.create({
      name: 'Old Cohort',
      description: '',
      startDate: new Date(Date.now() - 365 * 86400_000),
      endDate: new Date(Date.now() - 100 * 86400_000),
      isActive: true,
      status: 'archived',
    });
    const { req, res } = mockReqRes('old-cohort');
    await getBatchBySlug(req, res);
    expect(res.statusCode).toBe(200);
    expect(asBatch(res.body)._id.toString()).toBe(batch._id.toString());
    expect(asBatch(res.body).status).toBe('archived');
  });

  it('404s on truly nonexistent slug', async () => {
    const { req, res } = mockReqRes('does-not-exist');
    await getBatchBySlug(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('returns faqCount for the matched program (data isolation verified)', async () => {
    const a = await Batch.create({
      name: 'Program A', description: '',
      startDate: new Date(), endDate: new Date(Date.now() + 86400_000), isActive: true,
    });
    const b = await Batch.create({
      name: 'Program B', description: '',
      startDate: new Date(), endDate: new Date(Date.now() + 86400_000), isActive: true,
    });
    // 3 FAQs in A, 2 in B — ensures the slug endpoint doesn't leak counts.
    for (let i = 0; i < 3; i++) {
      await FAQ.create({
        batchId: a._id, question: `qA${i}`, answer: 'a', category: 'c', status: 'approved',
      });
    }
    for (let i = 0; i < 2; i++) {
      await FAQ.create({
        batchId: b._id, question: `qB${i}`, answer: 'a', category: 'c', status: 'approved',
      });
    }
    const aRes = mockReqRes('program-a');
    await getBatchBySlug(aRes.req, aRes.res);
    expect((aRes.res.body as { faqCount: number }).faqCount).toBe(3);

    const bRes = mockReqRes('program-b');
    await getBatchBySlug(bRes.req, bRes.res);
    expect((bRes.res.body as { faqCount: number }).faqCount).toBe(2);
  });
});