/**
 * related.test — unit tests for getRelatedForPost() in related.controller.ts.
 * Covers: 404 on missing post, tag-overlap ranking for related community
 * posts, tag-overlap ranking for similar FAQs, hidden-post exclusion, and
 * the `limit` query param clamping.
 *
 * Note: the no-tags fallback path (Atlas $vectorSearch / $text search) is
 * NOT covered here — it needs a real Atlas Search index and text index
 * that mongodb-memory-server doesn't provide. That path degrades
 * gracefully (empty similarFaqs) if left untested; a follow-up PR could
 * cover it with a mocked db.collection().aggregate().
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
 
let mongo: MongoMemoryServer;
 
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 120_000);
 
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
 
const { getRelatedForPost } = await import('../../faq/related.controller.js');
const { default: CommunityPost } = await import('../community-post.model.js');
const { default: FAQ } = await import('../../faq/faq.model.js');
 
function mockReq(overrides: Record<string, unknown> = {}): any {
  return { params: {}, query: {}, ...overrides };
}
 
function mockRes(): any {
  const body: any = { value: null };
  let statusVal = 200;
  return {
    get statusCode() { return statusVal; },
    get body() { return body; },
    status(this: any, n: number) { statusVal = n; return this; },
    json(this: any, b: unknown) { body.value = b; return this; },
  };
}
 
async function createPost(overrides: Record<string, unknown> = {}) {
  return CommunityPost.create({
    title: 'A question',
    body: 'Body text',
    author: new Types.ObjectId(),
    tags: [],
    ...overrides,
  });
}
 
async function createFAQ(overrides: Record<string, unknown> = {}) {
  return FAQ.create({
    question: 'An FAQ question',
    answer: 'An answer',
    category: 'general',
    status: 'approved',
    tags: [],
    ...overrides,
  });
}
 
describe('getRelatedForPost', () => {
  beforeEach(async () => {
    await CommunityPost.deleteMany({});
    await FAQ.deleteMany({});
  });
 
  it('404s when the post does not exist', async () => {
    const req = mockReq({ params: { id: new Types.ObjectId().toString() } });
    const res = mockRes();
 
    await getRelatedForPost(req, res);
 
    expect(res.statusCode).toBe(404);
  });
 
  it('ranks related community posts by tag overlap, excluding itself and hidden posts', async () => {
    const post = await createPost({ tags: ['wifi', 'network'] });
    const bestMatch = await createPost({ tags: ['wifi', 'network', 'router'] }); // overlap 2
    const partialMatch = await createPost({ tags: ['wifi'] }); // overlap 1
    await createPost({ tags: ['unrelated'] }); // overlap 0, excluded by $in
    await createPost({ tags: ['wifi', 'network'], isHidden: true }); // hidden, excluded
 
    const req = mockReq({ params: { id: post._id.toString() } });
    const res = mockRes();
 
    await getRelatedForPost(req, res);
 
    expect(res.statusCode).toBe(200);
    const ids = res.body.value.relatedQuestions.map((r: any) => r._id);
    expect(ids[0]).toBe(bestMatch._id.toString());
    expect(ids).toContain(partialMatch._id.toString());
    expect(ids).toHaveLength(2);
  });
 
  it('ranks similar FAQs by tag overlap and only includes approved FAQs', async () => {
    const post = await createPost({ tags: ['printer', 'setup'] });
    const approvedMatch = await createFAQ({ tags: ['printer', 'setup'], status: 'approved' });
    await createFAQ({ tags: ['printer', 'setup'], status: 'pending' }); // excluded — not approved
 
    const req = mockReq({ params: { id: post._id.toString() } });
    const res = mockRes();
 
    await getRelatedForPost(req, res);
 
    const ids = res.body.value.similarFaqs.map((f: any) => f._id);
    expect(ids).toEqual([approvedMatch._id.toString()]);
  });
 
  it('clamps the limit query param between 1 and 5', async () => {
    const post = await createPost({ tags: ['a'] });
    for (let i = 0; i < 8; i++) {
      await createPost({ tags: ['a'] });
    }
 
    const req = mockReq({ params: { id: post._id.toString() }, query: { limit: '20' } });
    const res = mockRes();
 
    await getRelatedForPost(req, res);
 
    expect(res.body.value.relatedQuestions.length).toBeLessThanOrEqual(5);
  });
});
 