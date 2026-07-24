/**
 * webCrawler.test — Phase 8.
 *
 * Unit tests for services/webCrawler.ts. Mocks the fetcher
 * (fetchAndExtractPage) so tests don't hit the network. Uses
 * MongoMemoryServer for WebPage persistence.
 *
 * Covers:
 *   - happy path: a seeded run inserts rows with source=auto_discovered
 *     and approved=false.
 *   - failed seed: a rejected fetch increments the `failed` counter
 *     and still returns a stats object (no throw).
 *   - depth-1 follow: same-domain links on a successful seed page get
 *     upserted too.
 *   - admin approved flag is preserved: if a row was previously
 *     approved=true and we re-crawl, the upsert must NOT clobber it
 *     back to false.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import WebPage from '../../models/WebPage.js';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await WebPage.syncIndexes();
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  const db = mongoose.connection.db;
  if (db) {
    try { await db.collection('yaksha_web_pages').deleteMany({}); } catch { /* ignore */ }
  }
  vi.restoreAllMocks();
});

// Mock the web fetcher so we don't actually hit the network.
const mockFetch = vi.hoisted(() => vi.fn());
vi.mock('../../services/webFetcher.js', () => ({
  fetchAndExtract: vi.fn(),
  fetchAndExtractPage: mockFetch,
}));

import { _runWithSeeds } from '../webCrawler.js';

describe('webCrawler._runWithSeeds', () => {
  it('inserts WebPage rows with source=auto_discovered and approved=false', async () => {
    mockFetch.mockResolvedValueOnce({
      title: 'About Us',
      text: 'We do things.',
      statusCode: 200,
      finalUrl: 'https://example.com/about',
      links: ['https://example.com/team'],
    });
    const stats = await _runWithSeeds([{ url: 'https://example.com/about', label: 'about' }]);
    expect(stats.inserted).toBeGreaterThan(0);
    const rows = await WebPage.find({ source: 'auto_discovered' });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].approved).toBe(false);
    expect(rows[0].lastFetchError).toBeNull();
  });

  it('returns stats with visited + failed counts on fetch failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('connection refused'));
    const stats = await _runWithSeeds([{ url: 'https://broken.example.com', label: 'broken' }]);
    expect(typeof stats.visited).toBe('number');
    expect(typeof stats.failed).toBe('number');
    expect(stats.failed).toBe(1);
    // The row should still be upserted — just with lastFetchError set
    // so the admin UI can see the broken entry and decide what to do.
    const row = await WebPage.findOne({ url: 'https://broken.example.com' });
    expect(row).not.toBeNull();
    expect(row?.lastFetchError).toBe('connection refused');
  });

  it('follows same-domain links (depth-1) when FOLLOW_LINKS is enabled', async () => {
    mockFetch.mockResolvedValueOnce({
      title: 'Home',
      text: 'Welcome to example.',
      statusCode: 200,
      finalUrl: 'https://example.com/',
      links: ['https://example.com/about', 'https://example.com/contact', 'https://other.example/elsewhere'],
    });
    // Subsequent calls (for /about) just return more content.
    mockFetch.mockResolvedValue({
      title: 'Subpage',
      text: 'Subpage body content for indexing tests.',
      statusCode: 200,
      finalUrl: 'https://example.com/about',
      links: [],
    });
    const stats = await _runWithSeeds([{ url: 'https://example.com/', label: 'root' }]);
    // Seed + 1 sibling (about), and contact is also within the same domain
    expect(stats.visited).toBeGreaterThanOrEqual(2);
    const rows = await WebPage.find({ source: 'auto_discovered' });
    const urls = rows.map((r) => r.url);
    expect(urls).toContain('https://example.com/');
    expect(urls).toContain('https://example.com/about');
    // Different-host link should NOT be crawled.
    expect(urls).not.toContain('https://other.example/elsewhere');
  });

  it('preserves an existing approved=true flag across re-crawls', async () => {
    // Pre-seed a row that has been approved by an admin.
    await WebPage.create({
      url: 'https://example.com/about',
      domain: 'example.com',
      title: 'old',
      text: 'old body for indexing tests',
      source: 'auto_discovered',
      statusCode: 200,
      fetchedAt: new Date(),
      lastFetchError: null,
      approved: true,
    });
    mockFetch.mockResolvedValueOnce({
      title: 'About Us — updated',
      text: 'Updated content for indexing tests.',
      statusCode: 200,
      finalUrl: 'https://example.com/about',
      links: [],
    });
    await _runWithSeeds([{ url: 'https://example.com/about', label: 'about' }]);
    const row = await WebPage.findOne({ url: 'https://example.com/about' });
    expect(row).not.toBeNull();
    expect(row?.approved).toBe(true);
    expect(row?.title).toBe('About Us — updated');
  });

  it('returns empty stats when given no seeds', async () => {
    const stats = await _runWithSeeds([]);
    expect(stats).toEqual({ visited: 0, inserted: 0, failed: 0 });
  });
});
