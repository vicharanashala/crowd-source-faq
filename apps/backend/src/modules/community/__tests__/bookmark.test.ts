/**
 * bookmark.test — unit tests for getBookmarks / toggleBookmark in
 * bookmark.controller.ts. Covers: auth guard, add, remove (idempotent
 * toggle), and getBookmarks returning populated posts.
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
 
const { getBookmarks, toggleBookmark } = await import('../bookmark.controller.js');
const { default: User } = await import('../../auth/user.model.js');
const { default: CommunityPost } = await import('../community-post.model.js');
 
function mockReq(overrides: Record<string, unknown> = {}): any {
  return { params: {}, body: {}, user: undefined, ...overrides };
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
 
async function seedUser() {
  return User.create({
    name: 'Test User',
    email: `test-${Date.now()}-${Math.random()}@example.com`,
    password: 'x'.repeat(8),
  });
}
 
async function seedPost(authorId: Types.ObjectId) {
  return CommunityPost.create({
    title: 'How do I reset my password?',
    body: 'Cannot find the reset link.',
    author: authorId,
  });
}
 
describe('bookmark.controller', () => {
  beforeEach(async () => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('no db');
    await db.collection('yaksha_faq_users').deleteMany({});
    // CommunityPost collection name — matches whatever the model registers.
    await CommunityPost.deleteMany({});
  });
 
  it('getBookmarks returns 401 when unauthenticated', async () => {
    const req = mockReq({ user: undefined });
    const res = mockRes();
    await getBookmarks(req, res);
    expect(res.statusCode).toBe(401);
  });
 
  it('toggleBookmark returns 401 when unauthenticated', async () => {
    const req = mockReq({ user: undefined, params: { id: new Types.ObjectId().toString() } });
    const res = mockRes();
    await toggleBookmark(req, res);
    expect(res.statusCode).toBe(401);
  });
 
  it('adds a bookmark on first toggle', async () => {
    const user = await seedUser();
    const post = await seedPost(user._id);
    const req = mockReq({
      params: { id: post._id.toString() },
      user: { _id: user._id },
    });
    const res = mockRes();
 
    await toggleBookmark(req, res);
 
    expect(res.statusCode).toBe(200);
    expect(res.body.value.bookmarked).toBe(true);
 
    const updatedUser = await User.findById(user._id);
    expect(updatedUser?.bookmarks.map(String)).toContain(post._id.toString());
    const updatedPost = await CommunityPost.findById(post._id);
    expect(updatedPost?.bookmarks.map(String)).toContain(user._id.toString());
  });
 
  it('removes the bookmark on the second toggle (idempotent switch)', async () => {
    const user = await seedUser();
    const post = await seedPost(user._id);
    const req = () => mockReq({ params: { id: post._id.toString() }, user: { _id: user._id } });
 
    await toggleBookmark(req(), mockRes());       // add
    const res2 = mockRes();
    await toggleBookmark(req(), res2);             // remove
 
    expect(res2.body.value.bookmarked).toBe(false);
    const updatedUser = await User.findById(user._id);
    expect(updatedUser?.bookmarks.map(String)).not.toContain(post._id.toString());
  });
 
  it('404s when the post does not exist', async () => {
    const user = await seedUser();
    const req = mockReq({
      params: { id: new Types.ObjectId().toString() },
      user: { _id: user._id },
    });
    const res = mockRes();
 
    await toggleBookmark(req, res);
 
    expect(res.statusCode).toBe(404);
  });
 
  it('getBookmarks returns the populated, bookmarked posts', async () => {
    const user = await seedUser();
    const post = await seedPost(user._id);
    await toggleBookmark(
      mockReq({ params: { id: post._id.toString() }, user: { _id: user._id } }),
      mockRes(),
    );
 
    const req = mockReq({ user: { _id: user._id } });
    const res = mockRes();
    await getBookmarks(req, res);
 
    expect(res.statusCode).toBe(200);
    expect(res.body.value.total).toBe(1);
    expect(res.body.value.bookmarks[0]._id.toString()).toBe(post._id.toString());
  });
});
 