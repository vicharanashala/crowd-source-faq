/**
 * community-stats.test — unit tests for getCommunityStats().
 * Covers: zero-state, response-rate math, weekly window filtering,
 * and distinct-contributor counting.
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
 
const { getCommunityStats } = await import('../community-stats.controller.js');
const { default: CommunityPost } = await import('../community-post.model.js');
 
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
    body: 'Some body text',
    author: new Types.ObjectId(),
    status: 'open',
    ...overrides,
  });
}
 
describe('getCommunityStats', () => {
  beforeEach(async () => {
    await CommunityPost.deleteMany({});
  });
 
  it('returns all-zero stats when there are no posts', async () => {
    const res = mockRes();
    await getCommunityStats({} as any, res);
 
    expect(res.statusCode).toBe(200);
    expect(res.body.value.totalPosts).toBe(0);
    expect(res.body.value.responseRate).toBe(0);
    expect(res.body.value.activeContributors).toBe(0);
  });
 
  it('computes response rate from answered vs total posts', async () => {
    await createPost({ status: 'answered' });
    await createPost({ status: 'answered' });
    await createPost({ status: 'open' });
    await createPost({ status: 'open' });
 
    const res = mockRes();
    await getCommunityStats({} as any, res);
 
    expect(res.body.value.totalPosts).toBe(4);
    expect(res.body.value.answeredPosts).toBe(2);
    expect(res.body.value.unansweredPosts).toBe(2);
    expect(res.body.value.responseRate).toBe(50);
  });
 
  it('only counts posts from the last 7 days toward newQuestionsThisWeek', async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await createPost();
    await createPost();
    const old = await createPost();
    await CommunityPost.updateOne({ _id: old._id }, { createdAt: tenDaysAgo });
 
    const res = mockRes();
    await getCommunityStats({} as any, res);
 
    expect(res.body.value.totalPosts).toBe(3);
    expect(res.body.value.newQuestionsThisWeek).toBe(2);
  });
 
  it('counts distinct authors from the past week as activeContributors', async () => {
    const authorA = new Types.ObjectId();
    const authorB = new Types.ObjectId();
    await createPost({ author: authorA });
    await createPost({ author: authorA }); // same author, second post
    await createPost({ author: authorB });
 
    const res = mockRes();
    await getCommunityStats({} as any, res);
 
    expect(res.body.value.activeContributors).toBe(2);
  });
});
 