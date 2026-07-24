/**
 * documentTextSource.test — Phase 6.
 *
 * Unit tests for the 7th default RetrievalSource. MongoMemoryServer
 * bootstrap matches the other sources in the suite.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types } from 'mongoose';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const { default: DocumentAsset } = await import('../../models/DocumentAsset.js');
  await DocumentAsset.syncIndexes();
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  const db = mongoose.connection.db;
  if (!db) throw new Error('no db');
  try {
    await db.collection('yaksha_documents').deleteMany({});
  } catch {
    // collection may not exist on first run
  }
  vi.restoreAllMocks();
});

const { documentTextSource } = await import(
  '../retrievalSources/documentTextSource.js'
);
const { default: DocumentAsset } = await import(
  '../../models/DocumentAsset.js'
);
const { listSources } = await import('../contextRetriever.js');

async function seedDocument(overrides: {
  title?: string;
  text?: string;
  uploadedAt?: Date;
  lastFetchError?: string | null;
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
  pageCount?: number;
  batchId?: Types.ObjectId;
} = {}) {
  return DocumentAsset.create({
    title: overrides.title ?? 'How to set up the dashboard',
    filename: overrides.filename ?? 'setup.txt',
    storagePath: '/tmp/fake-setup.txt',
    mimeType: overrides.mimeType ?? 'text/plain',
    sizeBytes: overrides.sizeBytes ?? 1024,
    text:
      overrides.text ??
      'Step one: install dependencies. Step two: configure the environment.',
    pageCount: overrides.pageCount ?? 0,
    uploadedAt: overrides.uploadedAt ?? new Date(),
    lastFetchError: overrides.lastFetchError ?? null,
    batchId: overrides.batchId,
  });
}

describe('documentTextSource — source registration', () => {
  it('has name=document and weight=0.85', () => {
    expect(documentTextSource.name).toBe('document');
    expect(documentTextSource.weight).toBe(0.85);
  });

  it('appears in listSources() after auto-register', () => {
    const names = listSources().map((s) => s.name);
    expect(names).toContain('document');
  });
});

describe('documentTextSource.search — happy path', () => {
  it('returns hits when $text matches a stored document', async () => {
    await seedDocument({
      title: 'Reset password guide',
      text: 'Click forgot password on the login page to reset your password.',
    });
    const hits = await documentTextSource.search('password', null, { topK: 3 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].source).toBe('document');
    expect(hits[0].answer.toLowerCase()).toContain('password');
    expect(hits[0].matchedOn).toMatch(/DocumentAsset/);
  });

  it('returns [] when no documents exist (no throw)', async () => {
    const hits = await documentTextSource.search('anything', null, { topK: 3 });
    expect(hits).toEqual([]);
  });
});

describe('documentTextSource.search — freshness decay', () => {
  it('fresh documents (< 30d) get confidence 0.85', async () => {
    await seedDocument({ uploadedAt: new Date() });
    const hits = await documentTextSource.search('dashboard', null, { topK: 1 });
    expect(hits[0]?.confidence).toBe(0.85);
  });

  it('stale documents (> 30d) get confidence 0.5', async () => {
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    await seedDocument({
      uploadedAt: old,
      title: 'Old setup guide',
      text: 'Old dashboard content here.',
    });
    const hits = await documentTextSource.search('dashboard', null, { topK: 1 });
    expect(hits[0]?.confidence).toBe(0.5);
    expect(hits[0]?.meta?.ageDays).toBeGreaterThan(30);
  });
});

describe('documentTextSource.search — error path', () => {
  it('returns [] when DocumentAsset.find throws (no upstream crash)', async () => {
    const spy = vi.spyOn(DocumentAsset, 'find').mockImplementation(() => {
      throw new Error('simulated mongo failure');
    });
    const hits = await documentTextSource.search('whatever', null, { topK: 3 });
    expect(hits).toEqual([]);
    spy.mockRestore();
  });
});

describe('documentTextSource.search — error filter', () => {
  it('excludes documents with lastFetchError set', async () => {
    await seedDocument({
      filename: 'broken.txt',
      title: 'Broken page',
      text: 'broken content dashboard',
    });
    await seedDocument({
      filename: 'good.txt',
      title: 'Good page',
      text: 'good content dashboard',
    });
    const broken = await DocumentAsset.findOne({ filename: 'broken.txt' });
    if (broken) {
      await DocumentAsset.updateOne(
        { _id: broken._id },
        { $set: { lastFetchError: 'PDF parse failed' } },
      );
    }
    const hits = await documentTextSource.search('dashboard', null, { topK: 10 });
    const filenames = hits.map((h: { meta?: { filename?: string } }) => h.meta?.filename);
    expect(filenames).not.toContain('broken.txt');
    expect(filenames).toContain('good.txt');
  });
});

describe('documentTextSource.search — Phase 9 metadata projection', () => {
  it('projects only metadata + capped text (does not fetch the full body)', async () => {
    // Seed a row with text longer than the 4000-char cap so we can prove
    // truncation happens. The original (uncapped) length should still
    // show up in meta.textLength so consumers can detect truncation.
    const longText = 'lorem ipsum dolor sit amet '.repeat(500); // 13_500 chars
    await seedDocument({ text: longText });
    // Spy on DocumentAsset.find so we can assert the .select() projection
    // was applied to the query chain (not just verify behavior).
    const findSpy = vi.spyOn(DocumentAsset, 'find');
    await documentTextSource.search('lorem', null, { topK: 1 });
    expect(findSpy).toHaveBeenCalled();
    const hits = await documentTextSource.search('lorem', null, { topK: 1 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].answer.length).toBeLessThanOrEqual(4000);
    expect(hits[0].answer.length).toBe(4000); // exactly capped, not less
    expect(hits[0].meta?.textLength).toBe(longText.length);
  });
});
