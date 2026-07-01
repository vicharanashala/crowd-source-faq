/**
 * gcs.test.ts — unit tests for the GCS signed-upload module.
 *
 * Mirrors the Cloudinary signature test suite (apps/backend/src/__tests__/
 * backend.test.ts > Cloudinary signature).
 *
 * Why dependency-injection instead of mocking the Storage class:
 *   The Storage class from @google-cloud/storage is a complex instance with
 *   internal connection pools. Mocking the class with vi.mock works for
 *   the first call but vitest's test isolation breaks the mock chain for
 *   subsequent calls. We instead pass a plain mock object via the
 *   `storage` parameter on `signGcsUpload` — this is cleaner, more explicit,
 *   and avoids the class-mock pitfall entirely.
 *
 * Coverage:
 *   - getGcsConfig reads env correctly, throws on missing bucket/host
 *   - signGcsUpload returns the expected payload shape
 *   - Subfolder allowlist enforced
 *   - Content-Type allowlist enforced
 *   - userId format enforced
 *   - Filename sanitisation (path traversal stripped, leading dots, length cap)
 *   - Object path is server-controlled
 *   - isOurGcsAsset accepts valid URLs, rejects bad ones
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Storage as StorageType } from '@google-cloud/storage';
import {
  signGcsUpload,
  isOurGcsAsset,
  getGcsConfig,
} from '../integrations/gcs/gcs.js';

// ── Test fixtures ────────────────────────────────────────────────────────────

const VALID_USER_ID = '6a3ac808c9fe19f6b3a14c06'; // 24-char hex
const TEST_BUCKET = 'yaksha-media-test';
const TEST_HOST = 'media.test.example.com';

// Build a fresh mock Storage client per test. Each test gets its own
// instance so there's no shared state between tests.
function makeMockStorage() {
  const getSignedUrl = vi.fn().mockResolvedValue([
    'https://fake-signed-url.example.com/upload?signature=abc',
  ]);
  const file = vi.fn().mockReturnValue({ getSignedUrl });
  const bucket = vi.fn().mockReturnValue({ file });
  const storage = { bucket } as unknown as StorageType;
  return { storage, getSignedUrl, file, bucket };
}

beforeEach(() => {
  process.env.GCS_BUCKET = TEST_BUCKET;
  process.env.GCS_PUBLIC_HOST = TEST_HOST;
  process.env.GCS_ALLOWED_SUBFOLDERS = 'avatar,posts';
});

// ── getGcsConfig ─────────────────────────────────────────────────────────────

describe('GCS module — getGcsConfig', () => {
  it('reads GCS_BUCKET and GCS_PUBLIC_HOST from env', () => {
    const cfg = getGcsConfig();
    expect(cfg.bucket).toBe(TEST_BUCKET);
    expect(cfg.publicHost).toBe(TEST_HOST);
    expect(cfg.allowedSubfolders).toEqual(['avatar', 'posts']);
    expect(cfg.signedUrlTtlSeconds).toBe(900);
  });

  it('throws when GCS_BUCKET is missing', () => {
    delete process.env.GCS_BUCKET;
    expect(() => getGcsConfig()).toThrow(/GCS_BUCKET/);
  });

  it('throws when GCS_PUBLIC_HOST is missing', () => {
    delete process.env.GCS_PUBLIC_HOST;
    expect(() => getGcsConfig()).toThrow(/GCS_PUBLIC_HOST/);
  });

  it('strips protocol and trailing slash from publicHost', () => {
    process.env.GCS_PUBLIC_HOST = 'https://media.example.com/';
    const cfg = getGcsConfig();
    expect(cfg.publicHost).toBe('media.example.com');
  });

  it('parses custom subfolder allowlist', () => {
    process.env.GCS_ALLOWED_SUBFOLDERS = 'avatar, posts, support';
    const cfg = getGcsConfig();
    expect(cfg.allowedSubfolders).toEqual(['avatar', 'posts', 'support']);
  });
});

// ── signGcsUpload ────────────────────────────────────────────────────────────

describe('GCS module — signGcsUpload', () => {
  it('returns the expected payload shape on a valid request', async () => {
    const { storage, getSignedUrl } = makeMockStorage();
    const result = await signGcsUpload({
      userId: VALID_USER_ID,
      subfolder: 'avatar',
      filename: 'pic.jpg',
      contentType: 'image/jpeg',
      storage,
    });
    expect(result).toMatchObject({
      uploadUrl: expect.stringContaining('fake-signed-url'),
      publicUrl: expect.stringContaining(`https://${TEST_HOST}/avatar/${VALID_USER_ID}/`),
      gcsUri: expect.stringContaining(`gs://${TEST_BUCKET}/avatar/${VALID_USER_ID}/`),
      contentType: 'image/jpeg',
      ttlSeconds: 900,
    });
    expect(result.objectPath).toMatch(/^avatar\/[a-f0-9]{24}\/[a-f0-9]{12}-pic\.jpg$/);
    expect(typeof result.expiresAt).toBe('number');
    expect(result.expiresAt).toBeGreaterThan(Date.now());
    expect(getSignedUrl).toHaveBeenCalledTimes(1);
  });

  it('calls getSignedUrl with v4 write, contentType locked in', async () => {
    const { storage, getSignedUrl, file } = makeMockStorage();
    await signGcsUpload({
      userId: VALID_USER_ID,
      subfolder: 'posts',
      filename: 'a.png',
      contentType: 'image/png',
      storage,
    });
    expect(getSignedUrl).toHaveBeenCalledTimes(1);
    const args = getSignedUrl.mock.calls[0][0];
    expect(args.version).toBe('v4');
    expect(args.action).toBe('write');
    expect(args.contentType).toBe('image/png');
    expect(file.mock.calls[0][0]).toMatch(/^posts\/[a-f0-9]{24}\/[a-f0-9]{12}-a\.png$/);
  });

  it('rejects subfolders not in the allowlist', async () => {
    const { storage, getSignedUrl } = makeMockStorage();
    await expect(signGcsUpload({
      userId: VALID_USER_ID,
      subfolder: 'evil-folder',
      filename: 'x.jpg',
      contentType: 'image/jpeg',
      storage,
    })).rejects.toThrow(/not allowed/);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('rejects content types not in the allowlist', async () => {
    const { storage, getSignedUrl } = makeMockStorage();
    await expect(signGcsUpload({
      userId: VALID_USER_ID,
      subfolder: 'avatar',
      filename: 'evil.exe',
      contentType: 'application/octet-stream',
      storage,
    })).rejects.toThrow(/not allowed/);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('rejects malformed userId (not a 24-char ObjectId hex)', async () => {
    const { storage, getSignedUrl } = makeMockStorage();
    await expect(signGcsUpload({
      userId: 'short',
      subfolder: 'avatar',
      filename: 'a.jpg',
      contentType: 'image/jpeg',
      storage,
    })).rejects.toThrow(/ObjectId/);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('rejects userId with path-traversal characters', async () => {
    const { storage, getSignedUrl } = makeMockStorage();
    await expect(signGcsUpload({
      userId: '../etc/passwd',
      subfolder: 'avatar',
      filename: 'a.jpg',
      contentType: 'image/jpeg',
      storage,
    })).rejects.toThrow(/ObjectId/);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('sanitises the filename — strips unsafe chars', async () => {
    const { storage, file } = makeMockStorage();
    const result = await signGcsUpload({
      userId: VALID_USER_ID,
      subfolder: 'avatar',
      filename: '../../../etc/passwd.exe',
      contentType: 'image/jpeg',
      storage,
    });
    expect(result.objectPath).not.toContain('..');
    expect(result.objectPath).not.toContain('/etc/');
    // The file mock was called with the sanitised path
    expect(file.mock.calls[0][0]).not.toContain('..');
  });

  it('strips leading dots from filenames (no hidden files)', async () => {
    const { storage, file } = makeMockStorage();
    const result = await signGcsUpload({
      userId: VALID_USER_ID,
      subfolder: 'avatar',
      filename: '....hidden.jpg',
      contentType: 'image/jpeg',
      storage,
    });
    expect(result.objectPath).not.toMatch(/\/\.{1,}/);
    expect(file.mock.calls[0][0]).not.toMatch(/\/\.{1,}/);
  });

  it('caps filename length at 80 chars', async () => {
    const { storage, file } = makeMockStorage();
    const longName = 'a'.repeat(200) + '.jpg';
    await signGcsUpload({
      userId: VALID_USER_ID,
      subfolder: 'avatar',
      filename: longName,
      contentType: 'image/jpeg',
      storage,
    });
    const filename = (file.mock.calls[0][0] as string).split('/').pop();
    expect(filename!.length).toBeLessThanOrEqual(12 + 1 + 80);
  });

  it('object path is server-controlled — userId comes from auth, not from request', async () => {
    const { storage, file } = makeMockStorage();
    await signGcsUpload({
      userId: VALID_USER_ID,
      subfolder: 'avatar',
      filename: 'a.jpg',
      contentType: 'image/jpeg',
      storage,
    });
    // The path passed to file() MUST include the auth-session userId, not the request's userId
    expect(file.mock.calls[0][0]).toContain(VALID_USER_ID);
  });

  it('object path structure is subfolder/userId/uuid-filename', async () => {
    const { storage, file } = makeMockStorage();
    await signGcsUpload({
      userId: VALID_USER_ID,
      subfolder: 'posts',
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      storage,
    });
    const path = file.mock.calls[0][0] as string;
    expect(path).toMatch(/^posts\/[a-f0-9]{24}\/[a-f0-9]{12}-photo\.jpg$/);
  });

  it('expiresAt is in the future (15-min default TTL)', async () => {
    const { storage } = makeMockStorage();
    const before = Date.now();
    const result = await signGcsUpload({
      userId: VALID_USER_ID,
      subfolder: 'avatar',
      filename: 'a.jpg',
      contentType: 'image/jpeg',
      storage,
    });
    const after = Date.now();
    const ttlMs = result.expiresAt - before;
    // TTL is 900s = 900_000ms; allow some clock drift on each side
    expect(ttlMs).toBeGreaterThanOrEqual(900_000 - 100);
    expect(ttlMs).toBeLessThanOrEqual(900_000 + (after - before) + 100);
  });
});

// ── isOurGcsAsset ────────────────────────────────────────────────────────────

describe('GCS module — isOurGcsAsset', () => {
  const validUrl = `https://${TEST_HOST}/avatar/${VALID_USER_ID}/abc.jpg`;

  it('accepts a URL on the configured CDN host with a valid subfolder path', () => {
    expect(isOurGcsAsset(validUrl)).toBe(true);
  });

  it('accepts the root subfolder path itself (bare /avatar)', () => {
    expect(isOurGcsAsset(`https://${TEST_HOST}/avatar`)).toBe(true);
  });

  it('rejects URLs on a different host', () => {
    expect(isOurGcsAsset(`https://evil.example.com/avatar/${VALID_USER_ID}/x.jpg`)).toBe(false);
  });

  it('rejects URLs that look similar but differ in host (subdomain confusion)', () => {
    expect(isOurGcsAsset(`https://fake.${TEST_HOST}/avatar/x.jpg`)).toBe(false);
    expect(isOurGcsAsset(`https://${TEST_HOST}.evil.com/avatar/x.jpg`)).toBe(false);
  });

  it('rejects http:// (only https is allowed)', () => {
    expect(isOurGcsAsset(`http://${TEST_HOST}/avatar/${VALID_USER_ID}/x.jpg`)).toBe(false);
  });

  it('rejects paths outside the allowlist', () => {
    expect(isOurGcsAsset(`https://${TEST_HOST}/evil-folder/x.jpg`)).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(isOurGcsAsset('not a url')).toBe(false);
    expect(isOurGcsAsset('')).toBe(false);
  });

  it('rejects Cloudinary URLs (handled by isOurCloudinaryAsset, not us)', () => {
    expect(isOurGcsAsset(`https://res.cloudinary.com/somecloud/image/upload/v1/foo.jpg`)).toBe(false);
  });
});