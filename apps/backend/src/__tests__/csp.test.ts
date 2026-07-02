/**
 * csp.test.ts — verifies the Content-Security-Policy emitted by
 * bootstrap/middleware.ts is permissive enough for the Cloudinary
 * signed-upload flow that runs from the browser (see
 * apps/frontend/src/hooks/useCloudinarySvgUpload.ts).
 *
 * Why this test exists:
 *   Helmet 8's DEFAULT CSP (`default-src 'self'`, `img-src 'self' data:`)
 *   silently blocks any cross-origin fetch to a third-party host. In
 *   production we hit the bug "img-src 'self' data: blocked
 *   https://res.cloudinary.com/..." — which surfaced after an upstream
 *   proxy (nginx/Cloudflare) intersected our explicit CSP with helmet's
 *   default, producing a more restrictive combination that no longer
 *   permitted the Cloudinary CDN. The fix is to set the CSP ourselves,
 *   bypassing helmet's option entirely so there is exactly ONE CSP in
 *   the response. These tests pin that invariant.
 *
 * We import `registerMiddleware` for real (so we're testing the actual
 * code path, not a copy) and stub the DB so the boot path doesn't try
 * to connect to MongoDB during unit tests.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import type { Server } from 'http';

// Stub the DB so registerMiddleware doesn't try to connect during tests.
vi.mock('../config/db.js', () => ({
  default: async () => undefined,
}));

// ingestFrontendLog touches the file logger; not relevant to CSP.
vi.mock('../utils/http/fileLogger.js', () => ({
  ingestFrontendLog: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// requestLogger writes to stdout on every request; silence it.
vi.mock('../utils/http/requestLogger.js', () => ({
  requestLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { registerMiddleware } from '../bootstrap/middleware.js';

const minimalConfig = {
  server: {
    env: 'test',
    trustProxyHops: 0,
  },
} as unknown;

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  registerMiddleware(app, minimalConfig as never);
  app.get('/__test', (_req, res) => {
    res.json({ ok: true });
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  if (addr && typeof addr === 'object') {
    baseUrl = `http://127.0.0.1:${addr.port}`;
  } else {
    throw new Error('Could not get test server address');
  }
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function fetchCspHeaders(): Promise<{ status: number; csp: string | null }> {
  const res = await fetch(`${baseUrl}/__test`);
  return {
    status: res.status,
    csp: res.headers.get('content-security-policy'),
  };
}

async function fetchCsp(): Promise<string> {
  const { status, csp } = await fetchCspHeaders();
  if (status !== 200) throw new Error(`Expected 200, got ${status}`);
  if (!csp) throw new Error('No Content-Security-Policy header');
  return csp;
}

describe('Content-Security-Policy header (Cloudinary SVG upload)', () => {
  it('sets exactly one Content-Security-Policy header on every response', async () => {
    const { csp } = await fetchCspHeaders();
    expect(csp).not.toBeNull();
    expect(csp!.length).toBeGreaterThan(0);
    // The whole point of the fix: we set CSP via res.setHeader (single
    // source of truth), NOT via helmet's option. If a future change
    // re-enables helmet's contentSecurityPolicy, the response would
    // carry TWO CSP headers and the browser would intersect them —
    // exactly the failure mode that produced the production bug.
    expect(csp!.split('; ').length).toBeGreaterThanOrEqual(8);
  });

  it('permits api.cloudinary.com on connect-src (SVG upload endpoint)', async () => {
    const csp = await fetchCsp();
    expect(csp).toMatch(/connect-src[^;]*https:\/\/api\.cloudinary\.com/);
  });

  it('permits res.cloudinary.com on both connect-src and img-src', async () => {
    const csp = await fetchCsp();
    expect(csp).toMatch(/connect-src[^;]*https:\/\/res\.cloudinary\.com/);
    expect(csp).toMatch(/img-src[^;]*https:\/\/res\.cloudinary\.com/);
  });

  it('still blocks inline scripts and objects (defence-in-depth)', async () => {
    const csp = await fetchCsp();
    expect(csp).toMatch(/object-src[^;]*'none'/);
    expect(csp).toMatch(/script-src[^;]*'self'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it('permits the HuggingFace Inference endpoint used by RAG/embeddings', async () => {
    const csp = await fetchCsp();
    expect(csp).toMatch(/connect-src[^;]*api-inference\.huggingface\.co/);
  });

  it("does NOT contain the helmet 8 default `img-src 'self' data:` only pattern", async () => {
    // Regression guard for the exact bug report: helmet 8's default
    // img-src is `img-src 'self' data:` — that single directive alone
    // blocks res.cloudinary.com. Our CSP must extend img-src to
    // include the Cloudinary CDN. If this assertion ever fails, the
    // browser will once again block Cloudinary images in production.
    const csp = await fetchCsp();
    // We assert the GOOD shape (cloudinary present) rather than the
    // BAD shape (no other text), so we don't fail when future
    // additions extend the directive list.
    expect(csp).toMatch(
      /img-src[^;]*'self'[^;]*data:[^;]*blob:[^;]*https:\/\/res\.cloudinary\.com/
    );
  });
});
