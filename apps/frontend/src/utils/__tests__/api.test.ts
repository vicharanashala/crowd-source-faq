/**
 * Regression test for the /search/trending cancellation bug.
 *
 * Bug: The request interceptor in utils/api.ts had a "duplicate cancel" guard
 * that matched ANY URL containing "/search", including GET /search/trending.
 * Combined with React StrictMode's double-mount in dev, the second mount
 * aborted the first request via AbortController, leaving the trending chips
 * empty and showing "Failed to load trending queries." in the console.
 *
 * Fix: The guard now only cancels:
 *   - POST /search         (semantic search — replace stale result)
 *   - GET  /search/suggest (live suggestion dropdown)
 * GET /search/trending is a one-shot mount-time fetch and must always
 * complete.
 *
 * We test the behavior by spying on AbortController.prototype.abort and
 * counting how many times it's invoked per duplicate pair. This bypasses
 * the api.ts cache layer (which short-circuits the second call) and the
 * network adapter entirely.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('utils/api.ts duplicate-cancel guard', () => {
  // We spy on AbortController.prototype.abort to count how many times the
  // request interceptor invokes the previous controller's abort() when a
  // duplicate request fires. The exact spy type isn't important — we only
  // use .mock.calls.length.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let abortSpy: any;

  beforeEach(async () => {
    vi.resetModules();
    abortSpy = vi.spyOn(AbortController.prototype, 'abort');
  });

  afterEach(() => {
    abortSpy.mockRestore();
  });

  it('does NOT abort the previous GET /search/trending on a duplicate', async () => {
    const { default: api } = await import('../api');
    // Swallow rejections — adapter never resolves, so we ignore them.
    api.get('/search/trending').catch(() => {});
    api.get('/search/trending').catch(() => {});

    // /search/trending is excluded from the cancelable set, so abort must
    // never be called by the interceptor. (The second mount in StrictMode
    // was the trigger; this guards against regressions to that bug.)
    expect(abortSpy).not.toHaveBeenCalled();
  });

  it('DOES abort the previous POST /search on a duplicate (replaces stale result)', async () => {
    const { default: api } = await import('../api');
    api.post('/search', { query: 'foo' }).catch(() => {});
    // The interceptor runs synchronously inside api.post(), so by the time
    // we get here the abort should already have happened. Flush one
    // microtask to be safe.
    await Promise.resolve();
    api.post('/search', { query: 'foo' }).catch(() => {});
    await Promise.resolve();

    // POST /search IS in the cancelable set — the first request's
    // AbortController must be aborted by the second one.
    expect(abortSpy).toHaveBeenCalled();
  });

  it('DOES abort the previous GET /search/suggest on a duplicate', async () => {
    const { default: api } = await import('../api');
    api.get('/search/suggest?q=foo').catch(() => {});
    await Promise.resolve();
    api.get('/search/suggest?q=foo').catch(() => {});
    await Promise.resolve();

    expect(abortSpy).toHaveBeenCalled();
  });

  it('does NOT abort the previous GET /faq on a duplicate (unrelated endpoint)', async () => {
    const { default: api } = await import('../api');
    api.get('/faq').catch(() => {});
    api.get('/faq').catch(() => {});

    expect(abortSpy).not.toHaveBeenCalled();
  });

  it('does NOT abort the previous GET /community on a duplicate (unrelated endpoint)', async () => {
    const { default: api } = await import('../api');
    api.get('/community').catch(() => {});
    api.get('/community').catch(() => {});

    expect(abortSpy).not.toHaveBeenCalled();
  });
});
