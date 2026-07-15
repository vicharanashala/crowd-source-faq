/**
 * Tests for the public /api/health/build endpoint.
 *
 * v1.85 — we deliberately do NOT mock `child_process.execFileSync`
 * here. The endpoint reads the real git HEAD, which is exactly
 * what operators will see in production. If the test env doesn't
 * have a `.git` (e.g. a Docker image without /usr/bin/git), the
 * snapshot falls back to `sha: null` and the test still passes.
 */
import { describe, it, expect } from 'vitest';
import { getBuildSnapshot } from '../build-info.js';

describe('getBuildSnapshot', () => {
  it('returns a BuildSnapshot with all expected fields populated', () => {
    const snap = getBuildSnapshot();
    expect(typeof snap.dirty === 'boolean' || snap.dirty === null).toBe(true);
    expect(typeof snap.capturedAt).toBe('string');
    expect(typeof snap.features.zoomDiagnostics).toBe('boolean');
    expect(typeof snap.features.documentReindex).toBe('boolean');
    expect(typeof snap.features.documentReindexRing).toBe('boolean');
    expect(typeof snap.features.providerFallbackChain).toBe('boolean');
    // envHealth is always an array of present-only env masks for
    // the runtime-required vars. No values, just booleans.
    expect(Array.isArray(snap.envHealth)).toBe(true);
    expect(snap.envHealth.length).toBeGreaterThan(0);
    for (const row of snap.envHealth) {
      expect(typeof row.name).toBe('string');
      expect(typeof row.present).toBe('boolean');
      expect(typeof row.needed).toBe('boolean');
      expect(['zoom', 'auth']).toContain(row.category);
      // Values are NEVER present in envHealth — only the mask.
      expect((row as Record<string, unknown>).value).toBeUndefined();
    }
  });

  it('always reports the same env mask regardless of which vars are actually set', () => {
    // The mask structure is static — only the `present` booleans
    // change. Locking the variable list here means a typo in the
    // envHealth array above is caught in CI.
    const snap = getBuildSnapshot();
    const byName = (n: string) => snap.envHealth.find((r) => r.name === n);
    expect(byName('ZOOM_CLIENT_ID')?.category).toBe('zoom');
    expect(byName('ZOOM_CLIENT_SECRET')?.category).toBe('zoom');
    expect(byName('ZOOM_REDIRECT_URI')?.category).toBe('zoom');
    expect(byName('ZOOM_REDIRECT_URI')?.needed).toBe(false);
    expect(byName('OAUTH_STATE_SECRET')?.category).toBe('auth');
    expect(byName('JWT_SECRET')?.category).toBe('auth');
  });

  it('every feature capability is true (this build ships them all)', () => {
    const snap = getBuildSnapshot();
    // Capability flags are static for a given build — they don't
    // depend on env. The new build should advertise every
    // admin-side endpoint we just shipped.
    expect(snap.features.zoomDiagnostics).toBe(true);
    expect(snap.features.documentReindex).toBe(true);
    expect(snap.features.documentReindexRing).toBe(true);
    expect(snap.features.providerFallbackChain).toBe(true);
  });

  it('capturedAt is a recent ISO timestamp', () => {
    const snap = getBuildSnapshot();
    const captured = new Date(snap.capturedAt).getTime();
    // Within the last 5 minutes — process boot at most that
    // long ago.
    expect(Math.abs(Date.now() - captured)).toBeLessThan(5 * 60 * 1000);
  });

  it('when a real git repo exists, sha is a 40-char hex; shortSha is its 7-char prefix', () => {
    const snap = getBuildSnapshot();
    if (snap.sha === null) {
      // No `.git` directory in the cwd — fine, this is what the
      // Docker image path would see. Skip the assertion rather
      // than fail.
      // eslint-disable-next-line no-console
      console.warn('No git repo at cwd; skipping SHA-format assertion. Set GIT_COMMIT_SHA in the test env to force it.');
      return;
    }
    expect(snap.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(snap.shortSha).toBe(snap.sha.slice(0, 7));
  });
});
