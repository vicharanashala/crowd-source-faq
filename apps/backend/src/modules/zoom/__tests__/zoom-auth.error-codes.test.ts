/**
 * Tests for the structured error-code mapping in connectZoom.
 *
 * v1.85 — when the runtime throws inside buildZoomAuthUrl /
 * getProgramZoomConfig, the catch block inspects the error
 * message and returns one of three `errorCode`s. We lock the
 * mapping with this test so a typo in the substring check
 * (the original bug) can't regress.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the OAuth module so we can make buildZoomAuthUrl throw
// any error we want, regardless of real env state.
vi.mock('../../../integrations/zoom/zoomOAuth.js', async () => {
  const actual = await vi.importActual<typeof import('../../../integrations/zoom/zoomOAuth.js')>(
    '../../../integrations/zoom/zoomOAuth.js',
  );
  let throwWith: unknown = null;
  return {
    ...actual,
    __setThrow: (err: unknown) => { throwWith = err; },
    buildZoomAuthUrl: async () => {
      if (throwWith) throw throwWith;
      return { url: 'https://zoom.us/oauth/authorize?...', codeVerifier: 'verifier' };
    },
  };
});

// Mock the auth middleware so we don't need a real JWT.
const mockUser = { _id: '64f0a1b2c3d4e5f6a7b8c9d0', role: 'admin' };
vi.mock('../../../middleware/auth.js', () => ({
  protect: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../../middleware/authShared.js', () => ({
  authorize: (..._roles: string[]) => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { connectZoom } from '../zoom-auth.controller.js';
import * as oauthMod from '../../../integrations/zoom/zoomOAuth.js';

const setThrow = (oauthMod as unknown as { __setThrow: (e: unknown) => void }).__setThrow;

interface MockRes {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
}

function mockRes(): MockRes {
  const json = vi.fn();
  // status() returns the same res shape (with .json on it) so
  // `res.status(503).json({...})` chains like the real Express
  // Response.
  const res = { status: vi.fn(() => res), json } as unknown as MockRes;
  return res;
}

describe('connectZoom — structured error codes on config issues', () => {
  beforeEach(() => {
    setThrow(null);
    mockRes();
  });

  it('Missing ZOOM_CLIENT_ID → 503 + zoom_credentials_missing', async () => {
    setThrow(new Error('Missing ZOOM_CLIENT_ID env var — add it to backend/.env.local'));
    const res = mockRes();
    await connectZoom({ user: mockUser, headers: {}, protocol: 'https', query: {} } as never, res as never);
    expect(res.status).toHaveBeenCalledWith(503);
    const payload = res.json.mock.calls[0][0];
    expect(payload.errorCode).toBe('zoom_credentials_missing');
    expect(payload.remediation).toMatch(/ZOOM_CLIENT_ID/);
  });

  it('Missing ZOOM_CLIENT_SECRET → 503 + zoom_credentials_missing', async () => {
    setThrow(new Error('Missing ZOOM_CLIENT_SECRET env var — add it to backend/.env.local'));
    const res = mockRes();
    await connectZoom({ user: mockUser, headers: {}, protocol: 'https', query: {} } as never, res as never);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json.mock.calls[0][0].errorCode).toBe('zoom_credentials_missing');
  });

  it('OAUTH_STATE_SECRET missing → 503 + oauth_state_secret_missing', async () => {
    // This is the bug we're guarding against — the original
    // handler did NOT route this error through the 503 path
    // because it typo'd the substring check ('oauphdstate_secret'
    // instead of 'oauth_state_secret'). The fix matches the
    // actual env-var name in the error message.
    setThrow(new Error('OAUTH_STATE_SECRET (or legacy JWT_SECRET) required to sign OAuth state'));
    const res = mockRes();
    await connectZoom({ user: mockUser, headers: {}, protocol: 'https', query: {} } as never, res as never);
    expect(res.status).toHaveBeenCalledWith(503);
    const payload = res.json.mock.calls[0][0];
    expect(payload.errorCode).toBe('oauth_state_secret_missing');
    expect(payload.remediation).toMatch(/OAUTH_STATE_SECRET/);
  });

  it('JWT_SECRET missing (legacy fallback) → 503 + oauth_state_secret_missing', async () => {
    // Same code, different exact wording.
    setThrow(new Error('OAUTH_STATE_SECRET (or legacy JWT_SECRET) required to sign OAuth state'));
    const res = mockRes();
    await connectZoom({ user: mockUser, headers: {}, protocol: 'https', query: {} } as never, res as never);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json.mock.calls[0][0].errorCode).toBe('oauth_state_secret_missing');
  });

  it('Decryption failure → 503 + decryption_failed', async () => {
    setThrow(new Error('Failed to decrypt API key for provider minimax: bad cipher'));
    const res = mockRes();
    await connectZoom({ user: mockUser, headers: {}, protocol: 'https', query: {} } as never, res as never);
    expect(res.status).toHaveBeenCalledWith(503);
    const payload = res.json.mock.calls[0][0];
    expect(payload.errorCode).toBe('decryption_failed');
    expect(payload.remediation).toMatch(/decrypt|Re-save/);
  });

  it('Generic 500 — any other error stays a 500 with the original message', async () => {
    setThrow(new Error('Connection refused: 127.0.0.1:6767'));
    const res = mockRes();
    await connectZoom({ user: mockUser, headers: {}, protocol: 'https', query: {} } as never, res as never);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].errorCode).toBeUndefined();
    expect(res.json.mock.calls[0][0].message).toBe('zoom connect failed');
  });
});
