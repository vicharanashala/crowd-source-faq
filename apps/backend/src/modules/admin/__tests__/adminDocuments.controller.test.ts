/**
 * adminDocuments.controller.test — Phase 6.
 *
 * Tests for the admin document endpoints. Mocks the file processor so
 * tests don't touch the disk. Uses MongoMemoryServer for DocumentAsset.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import path from 'path';
import { promises as fs } from 'fs';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const { default: DocumentAsset } = await import(
    '../../../models/DocumentAsset.js'
  );
  await DocumentAsset.syncIndexes();
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const mockProcessDocumentFile = vi.hoisted(() => vi.fn());

vi.mock('../../../services/documentUpload.js', () => ({
  processDocumentFile: mockProcessDocumentFile,
}));

import { addDocument, listDocuments, deleteDocument } from '../adminDocuments.controller.js';
import DocumentAsset from '../../../models/DocumentAsset.js';

beforeEach(async () => {
  mockProcessDocumentFile.mockReset();
  const db = mongoose.connection.db;
  if (db) {
    try {
      await db.collection('yaksha_documents').deleteMany({});
    } catch {
      /* ignore */
    }
  }
});

describe('addDocument', () => {
  it('returns 400 when no file is attached', async () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    await addDocument({ body: {}, file: undefined } as never, { status, json } as never);
    expect(status).toHaveBeenCalledWith(400);
  });

  it('returns 400 on unsupported mime-type', async () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    await addDocument(
      {
        file: { mimetype: 'application/octet-stream' },
      } as never,
      { status, json } as never,
    );
    expect(status).toHaveBeenCalledWith(400);
  });

  it('returns 422 when processing fails', async () => {
    mockProcessDocumentFile.mockRejectedValueOnce(
      new Error('file exceeds 10485760 bytes'),
    );
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    await addDocument(
      {
        file: {
          mimetype: 'application/pdf',
          path: '/tmp/x.pdf',
          originalname: 'x.pdf',
          size: 999,
        },
      } as never,
      { status, json } as never,
    );
    expect(status).toHaveBeenCalledWith(422);
  });

  it('happy path: stores the document and returns ok', async () => {
    mockProcessDocumentFile.mockResolvedValueOnce({
      title: 'Setup guide',
      text: 'lorem ipsum dolor sit amet consectetur adipiscing elit',
      pageCount: 3,
    });
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const req = {
      body: {},
      file: {
        mimetype: 'application/pdf',
        path: '/tmp/setup.pdf',
        originalname: 'setup.pdf',
        size: 12345,
      },
      user: { _id: new Types.ObjectId() },
    } as never;
    await addDocument(req, { status, json } as never);
    expect(json).toHaveBeenCalled();
    const payload = json.mock.calls[0][0] as {
      ok: boolean;
      document: { title: string; mimeType: string; pageCount: number };
    };
    expect(payload.ok).toBe(true);
    expect(payload.document?.title).toBe('Setup guide');
    expect(payload.document?.mimeType).toBe('application/pdf');
    expect(payload.document?.pageCount).toBe(3);

    const stored = await DocumentAsset.findOne({ filename: 'setup.pdf' });
    expect(stored).not.toBeNull();
    expect(stored?.uploadedBy).not.toBeNull();
  });
});

describe('listDocuments', () => {
  it('returns paginated list', async () => {
    for (let i = 0; i < 3; i++) {
      await DocumentAsset.create({
        title: `doc${i}`,
        filename: `f${i}.txt`,
        storagePath: `/tmp/f${i}.txt`,
        mimeType: 'text/plain',
        sizeBytes: 100,
        text: `body ${i} lorem ipsum dolor`,
        uploadedAt: new Date(Date.now() - i * 1000),
      });
    }
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    await listDocuments(
      { query: { page: 1, limit: 2 } } as never,
      { status, json } as never,
    );
    expect(json).toHaveBeenCalled();
    const payload = json.mock.calls[0][0] as {
      total: number;
      items: unknown[];
      pages: number;
    };
    expect(payload.total).toBe(3);
    expect(payload.items.length).toBe(2);
    expect(payload.pages).toBe(2);
  });
});

describe('deleteDocument', () => {
  it('returns 400 on invalid id', async () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    await deleteDocument(
      { params: { id: 'nope' } } as never,
      { status, json } as never,
    );
    expect(status).toHaveBeenCalledWith(400);
  });

  it('returns 404 on missing', async () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    await deleteDocument(
      { params: { id: new Types.ObjectId().toString() } } as never,
      { status, json } as never,
    );
    expect(status).toHaveBeenCalledWith(404);
  });

  it('deletes a real row + file', async () => {
    // Create a real file on disk to confirm unlink
    const tmpFile = path.join(
      process.cwd(),
      'apps/backend/uploads/documents/test-delete.txt',
    );
    await fs.mkdir(path.dirname(tmpFile), { recursive: true });
    await fs.writeFile(tmpFile, 'delete me');

    const row = await DocumentAsset.create({
      title: 'to-delete',
      filename: 'test-delete.txt',
      storagePath: tmpFile,
      mimeType: 'text/plain',
      sizeBytes: 9,
      text: 'delete me',
      uploadedAt: new Date(),
    });

    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    await deleteDocument(
      { params: { id: String(row._id) } } as never,
      { status, json } as never,
    );
    expect(json).toHaveBeenCalled();
    const after = await DocumentAsset.findById(row._id);
    expect(after).toBeNull();
    // file should be gone
    await expect(fs.stat(tmpFile)).rejects.toThrow();
  });
});
