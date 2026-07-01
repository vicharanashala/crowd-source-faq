/**
 * publicBasePath.test — the centralized URL helper used by every
 * server-side asset URL generator (orientation videos, onboarding
 * resources, etc.). The fix this lives behind: previously every
 * upload controller hardcoded `/uploads/...` which broke the
 * moment the app was hosted under any subdirectory (e.g. `/csfaq/`).
 *
 * Coverage:
 *   - default value (the only current deployment).
 *   - override via PUBLIC_BASE_PATH env.
 *   - publicAssetUrl prepends correctly + strips leading slashes.
 *   - mount paths used by static middleware resolve correctly.
 *   - the helper's cache resets between tests via _resetPublicBasePathCache.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { publicBasePath, publicAssetUrl, _resetPublicBasePathCache } from '../publicBasePath.js';

describe('publicBasePath — default /csfaq deployment', () => {
  beforeEach(() => {
    delete process.env.PUBLIC_BASE_PATH;
    _resetPublicBasePathCache();
  });
  afterEach(() => {
    delete process.env.PUBLIC_BASE_PATH;
    _resetPublicBasePathCache();
  });

  it('returns /csfaq when PUBLIC_BASE_PATH is unset', () => {
    _resetPublicBasePathCache();
    expect(publicBasePath()).toBe('/csfaq');
  });

  it('publicAssetUrl prepends /csfaq to relative asset paths', () => {
    _resetPublicBasePathCache();
    expect(publicAssetUrl('/uploads/foo.svg')).toBe('/csfaq/uploads/foo.svg');
  });

  it('publicAssetUrl strips leading slashes from the asset path before joining', () => {
    _resetPublicBasePathCache();
    expect(publicAssetUrl('uploads/foo.svg')).toBe('/csfaq/uploads/foo.svg');
    expect(publicAssetUrl('///uploads/foo.svg')).toBe('/csfaq/uploads/foo.svg');
  });
});

describe('publicBasePath — override via PUBLIC_BASE_PATH env', () => {
  beforeEach(() => {
    _resetPublicBasePathCache();
  });
  afterEach(() => {
    delete process.env.PUBLIC_BASE_PATH;
    _resetPublicBasePathCache();
  });

  it('respects a custom PUBLIC_BASE_PATH', () => {
    process.env.PUBLIC_BASE_PATH = '/myapp';
    _resetPublicBasePathCache();
    expect(publicBasePath()).toBe('/myapp');
    expect(publicAssetUrl('/uploads/foo.svg')).toBe('/myapp/uploads/foo.svg');
  });

  it('strips trailing slashes from the env var', () => {
    process.env.PUBLIC_BASE_PATH = '/csfaq/';
    _resetPublicBasePathCache();
    expect(publicBasePath()).toBe('/csfaq');
  });

  it('strips multiple trailing slashes', () => {
    process.env.PUBLIC_BASE_PATH = '/csfaq///';
    _resetPublicBasePathCache();
    expect(publicBasePath()).toBe('/csfaq');
  });

  it('adds a leading slash when missing', () => {
    process.env.PUBLIC_BASE_PATH = 'csfaq';
    _resetPublicBasePathCache();
    expect(publicBasePath()).toBe('/csfaq');
  });

  it('treats an empty PUBLIC_BASE_PATH as "mounted at root"', () => {
    process.env.PUBLIC_BASE_PATH = '';
    _resetPublicBasePathCache();
    expect(publicBasePath()).toBe('');
    expect(publicAssetUrl('/uploads/foo.svg')).toBe('/uploads/foo.svg');
  });

  it('treats "/" as "mounted at root"', () => {
    process.env.PUBLIC_BASE_PATH = '/';
    _resetPublicBasePathCache();
    expect(publicBasePath()).toBe('');
    expect(publicAssetUrl('/uploads/foo.svg')).toBe('/uploads/foo.svg');
  });

  it('trims whitespace around the env value', () => {
    process.env.PUBLIC_BASE_PATH = '   /csfaq   ';
    _resetPublicBasePathCache();
    expect(publicBasePath()).toBe('/csfaq');
  });
});

describe('publicAssetUrl — multi-prefix support', () => {
  beforeEach(() => {
    _resetPublicBasePathCache();
  });
  afterEach(() => {
    delete process.env.PUBLIC_BASE_PATH;
    _resetPublicBasePathCache();
  });

  it('handles future prefix changes (e.g. /v2/)', () => {
    process.env.PUBLIC_BASE_PATH = '/v2';
    _resetPublicBasePathCache();
    expect(publicAssetUrl('/uploads/onboarding-resources/abc.svg')).toBe(
      '/v2/uploads/onboarding-resources/abc.svg',
    );
  });

  it('handles deeply nested prefixes', () => {
    process.env.PUBLIC_BASE_PATH = '/apps/yaksha';
    _resetPublicBasePathCache();
    expect(publicAssetUrl('/uploads/foo.svg')).toBe('/apps/yaksha/uploads/foo.svg');
  });

  it('never returns a value with double slashes', () => {
    process.env.PUBLIC_BASE_PATH = '/csfaq/';
    _resetPublicBasePathCache();
    const out = publicAssetUrl('/uploads/foo.svg');
    expect(out).not.toContain('//');
  });
});

describe('static middleware mount path resolution', () => {
  // This is the path used by registerMiddleware() in
  // bootstrap/middleware.ts. Verifies that the mount path follows
  // publicBasePath() consistently.
  it('computes `${publicBasePath}/uploads` correctly for each prefix', () => {
    const cases: Array<[string, string]> = [
      ['/csfaq', '/csfaq/uploads'],
      ['/myapp', '/myapp/uploads'],
      ['', '/uploads'],
      ['/', '/uploads'],
    ];
    for (const [envValue, expected] of cases) {
      process.env.PUBLIC_BASE_PATH = envValue;
      _resetPublicBasePathCache();
      const base = publicBasePath();
      const mount = `${base}/uploads`;
      expect(mount).toBe(expected);
    }
  });
});