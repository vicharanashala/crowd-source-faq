/**
 * adminWebPages.controller.test — Phase 5.
 *
 * Tests for the admin web-pages endpoints. Mocks the fetcher so tests
 * don't hit the network. Uses MongoMemoryServer for WebPage persistence.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types } from 'mongoose';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const { default: WebPage } = await import('../../../models/WebPage.js');
  await WebPage.syncIndexes();
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const mockFetchAndExtract = vi.hoisted(() => vi.fn());

vi.mock('../../../services/webFetcher.js', () => ({
  fetchAndExtract: mockFetchAndExtract,
}));

import {
  addWebPage,
  listWebPages,
  deleteWebPage,
  approveWebPage,
  unapproveWebPage,
} from '../adminWebPages.controller.js';
import WebPage from '../../../models/WebPage.js';

beforeEach(async () => {
  mockFetchAndExtract.mockReset();
  const db = mongoose.connection.db;
  if (db) {
    try { await db.collection('yaksha_web_pages').deleteMany({}); } catch { /* ignore */ }
  }
});

describe('addWebPage', () => {
  it('returns 400 on missing url', async () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    await addWebPage({ body: {} } as never, { status, json } as never);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }));
  });

  it('returns 400 on invalid url (not http/https)', async () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    await addWebPage({ body: { url: 'ftp://nope' } } as never, { status, json } as never);
    expect(status).toHaveBeenCalledWith(400);
  });

  it('returns 422 when page has no extractable text', async () => {
    mockFetchAndExtract.mockResolvedValueOnce({ title: 'x', text: '', statusCode: 200 });
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    await addWebPage({ body: { url: 'https://example.com' } } as never, { status, json } as never);
    expect(status).toHaveBeenCalledWith(422);
  });

  it('returns 502 on fetch failure', async () => {
    mockFetchAndExtract.mockRejectedValueOnce(new Error('HTTP 503'));
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    await addWebPage({ body: { url: 'https://example.com' } } as never, { status, json } as never);
    expect(status).toHaveBeenCalledWith(502);
  });

  it('happy path: stores the page and returns ok', async () => {
    mockFetchAndExtract.mockResolvedValueOnce({
      title: 'Setup guide',
      text: 'lorem ipsum dolor sit amet consectetur adipiscing elit',
      statusCode: 200,
    });
    const json = vi.fn();
    // chainable mock: status(n) returns { json }, json() also returns ok
    const status = vi.fn(() => ({ json }));
    const req = {
      body: { url: 'https://docs.example.com/setup' },
      user: { _id: new Types.ObjectId() },
    } as never;
    await addWebPage(req, { status, json } as never);
    // The controller calls res.json(...) directly on success (no status() call).
    expect(json).toHaveBeenCalled();
    const payload = json.mock.calls[0][0] as { ok: boolean; page: { url: string; title: string; domain: string; source: string } };
    expect(payload.ok).toBe(true);
    expect(payload.page?.url).toBe('https://docs.example.com/setup');
    const stored = await WebPage.findOne({ url: 'https://docs.example.com/setup' });
    expect(stored).not.toBeNull();
    expect(stored?.title).toBe('Setup guide');
    expect(stored?.domain).toBe('docs.example.com');
    expect(stored?.source).toBe('admin_pasted');
  });
});

describe('listWebPages', () => {
  it('returns paginated list', async () => {
    for (let i = 0; i < 3; i++) {
      await WebPage.create({
        url: `https://x.com/${i}`,
        domain: 'x.com',
        title: `t${i}`,
        text: `t${i} body content here for index ${i}`,
        source: 'admin_pasted',
        statusCode: 200,
        fetchedAt: new Date(Date.now() - i * 1000),
      });
    }
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    await listWebPages({ query: { page: 1, limit: 2 } } as never, { status, json } as never);
    expect(json).toHaveBeenCalled();
    const payload = json.mock.calls[0][0] as { total: number; items: unknown[]; pages: number };
    expect(payload.total).toBe(3);
    expect(payload.items.length).toBe(2);
    expect(payload.pages).toBe(2);
  });
});

describe('deleteWebPage', () => {
  it('returns 400 on invalid id', async () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    await deleteWebPage({ params: { id: 'nope' } } as never, { status, json } as never);
    expect(status).toHaveBeenCalledWith(400);
  });

  it('returns 404 on missing', async () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    await deleteWebPage({ params: { id: new Types.ObjectId().toString() } } as never, { status, json } as never);
    expect(status).toHaveBeenCalledWith(404);
  });

  it('deletes a real row', async () => {
    const row = await WebPage.create({
      url: 'https://del.example.com',
      domain: 'del.example.com',
      title: 'del',
      text: 'to be deleted content',
      source: 'admin_pasted',
      statusCode: 200,
      fetchedAt: new Date(),
    });
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    await deleteWebPage({ params: { id: String(row._id) } } as never, { status, json } as never);
    expect(json).toHaveBeenCalled();
    const payload = json.mock.calls[0][0] as { ok: boolean };
    expect(payload.ok).toBe(true);
    const after = await WebPage.findById(row._id);
    expect(after).toBeNull();
  });
});

describe('approveWebPage / unapproveWebPage — Phase 8', () => {
  it('approveWebPage sets approved: true and returns the updated page', async () => {
    const row = await WebPage.create({
      url: 'https://auto.example.com/page',
      domain: 'auto.example.com',
      title: 'auto',
      text: 'auto-discovered content for retrieval tests',
      source: 'auto_discovered',
      statusCode: 200,
      fetchedAt: new Date(),
      approved: false,
    });
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    await approveWebPage({ params: { id: String(row._id) } } as never, { status, json } as never);
    expect(json).toHaveBeenCalled();
    const payload = json.mock.calls[0][0] as { ok: boolean; page: { approved: boolean; url: string } };
    expect(payload.ok).toBe(true);
    expect(payload.page.approved).toBe(true);
    expect(payload.page.url).toBe('https://auto.example.com/page');
    const stored = await WebPage.findById(row._id);
    expect(stored?.approved).toBe(true);
  });

  it('unapproveWebPage sets approved: false and returns the updated page', async () => {
    const row = await WebPage.create({
      url: 'https://pasted.example.com/page',
      domain: 'pasted.example.com',
      title: 'pasted',
      text: 'admin-pasted approved content for retrieval tests',
      source: 'admin_pasted',
      statusCode: 200,
      fetchedAt: new Date(),
      approved: true,
    });
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    await unapproveWebPage({ params: { id: String(row._id) } } as never, { status, json } as never);
    expect(json).toHaveBeenCalled();
    const payload = json.mock.calls[0][0] as { ok: boolean; page: { approved: boolean } };
    expect(payload.ok).toBe(true);
    expect(payload.page.approved).toBe(false);
    const stored = await WebPage.findById(row._id);
    expect(stored?.approved).toBe(false);
  });

  it('approveWebPage returns 400 on invalid id', async () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    await approveWebPage({ params: { id: 'not-an-objectid' } } as never, { status, json } as never);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }));
  });

  it('approveWebPage returns 404 on missing', async () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    await approveWebPage({ params: { id: new Types.ObjectId().toString() } } as never, { status, json } as never);
    expect(status).toHaveBeenCalledWith(404);
  });

  it('unapproveWebPage returns 400 on invalid id', async () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    await unapproveWebPage({ params: { id: 'not-an-objectid' } } as never, { status, json } as never);
    expect(status).toHaveBeenCalledWith(400);
  });

  it('unapproveWebPage returns 404 on missing', async () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    await unapproveWebPage({ params: { id: new Types.ObjectId().toString() } } as never, { status, json } as never);
    expect(status).toHaveBeenCalledWith(404);
  });
});