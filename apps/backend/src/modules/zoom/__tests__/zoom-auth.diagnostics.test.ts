/**
 * Tests for GET /api/zoom/auth/diagnostics.
 *
 * Strategy: stub the per-program DB lookup to return controlled
 * rows, set/unset the Zoom env vars per test, and assert the
 * returned shape reflects the live config + per-program state.
 * The decrypt probe is run against an in-memory stub function so
 * we don't need a real cipher in the test env.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the program-config model so the controller's per-program
// loop walks our controlled fixture instead of Mongo.
const mockProgramConfigDocs: Array<{
  batchId: unknown;
  zoom: { clientId?: string; clientSecret?: string; webhookSecretToken?: string };
}> = [];
vi.mock('../../program/program-config.model.js', () => ({
  default: {
    find: () => ({
      select: () => ({
        lean: async () => mockProgramConfigDocs,
      }),
    }),
  },
}));

// Stub the decrypt helper so we can simulate "decrypt works"
// vs "decrypt throws" without needing real ciphertext.
const mockDecrypt = vi.fn((_cipher: string) => 'decrypted-secret-plaintext');
vi.mock('../../../utils/auth/crypto.js', () => ({
  decrypt: (cipher: string) => mockDecrypt(cipher),
  // encrypt is referenced elsewhere — keep a stub.
  encrypt: (s: string) => `enc(${s})`,
}));

// Stub the resolution probe so the test doesn't depend on the
// real getProgramZoomConfig (which reads env at module-load).
vi.mock('../../../integrations/zoom/zoomOAuth.js', async () => {
  const actual = await vi.importActual<typeof import('../../../integrations/zoom/zoomOAuth.js')>(
    '../../../integrations/zoom/zoomOAuth.js',
  );
  return {
    ...actual,
    getProgramZoomConfig: vi.fn(async (batchId: string | null) => {
      if (!process.env.ZOOM_CLIENT_ID || !process.env.ZOOM_CLIENT_SECRET) {
        throw new Error(
          !process.env.ZOOM_CLIENT_ID
            ? 'Missing ZOOM_CLIENT_ID env var — add it to backend/.env.local'
            : 'Missing ZOOM_CLIENT_SECRET env var — add it to backend/.env.local',
        );
      }
      return {
        clientId: process.env.ZOOM_CLIENT_ID,
        clientSecret: process.env.ZOOM_CLIENT_SECRET,
        redirectUri: process.env.ZOOM_REDIRECT_URI ?? 'http://localhost:6767/csfaq/api/zoom/auth/callback',
        webhookSecretToken: process.env.ZOOM_WEBHOOK_SECRET_TOKEN ?? '',
        source: 'env',
        batchId,
      };
    }),
  };
});

import { getZoomDiagnostics } from '../zoom-auth.controller.js';

interface MockRes {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
}

function mockRes(): MockRes {
  return { status: vi.fn(), json: vi.fn() };
}

describe('getZoomDiagnostics — env var snapshot', () => {
  beforeEach(() => {
    mockProgramConfigDocs.length = 0;
    mockDecrypt.mockClear();
    mockDecrypt.mockImplementation((_cipher: string) => 'decrypted-secret-plaintext');
    delete process.env.ZOOM_CLIENT_ID;
    delete process.env.ZOOM_CLIENT_SECRET;
    delete process.env.ZOOM_REDIRECT_URI;
    delete process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
    delete process.env.OAUTH_STATE_SECRET;
    delete process.env.JWT_SECRET;
  });

  it('reports every Zoom env var as !present when nothing is configured', async () => {
    const res = mockRes();
    await getZoomDiagnostics({} as never, res as never);
    const payload = res.json.mock.calls[0][0];
    expect(payload.ok).toBe(false);
    expect(payload.summary).toMatch(/Missing required env vars/);
    // Expect every named env var to be reported
    const byName = (n: string) => payload.envVars.find((v: { name: string }) => v.name === n);
    expect(byName('ZOOM_CLIENT_ID')?.present).toBe(false);
    expect(byName('ZOOM_CLIENT_SECRET')?.present).toBe(false);
    expect(byName('ZOOM_REDIRECT_URI')?.present).toBe(false);
    expect(byName('ZOOM_WEBHOOK_SECRET_TOKEN')?.present).toBe(false);
    expect(byName('OAUTH_STATE_SECRET')?.present).toBe(false);
    expect(byName('JWT_SECRET')?.present).toBe(false);
  });

  it('reports ZOOM_CLIENT_ID/SECRET as present + used when both set (happy path)', async () => {
    process.env.ZOOM_CLIENT_ID = 'sk-test-client-id';
    process.env.ZOOM_CLIENT_SECRET = 'sk-test-client-secret';
    const res = mockRes();
    await getZoomDiagnostics({} as never, res as never);
    const payload = res.json.mock.calls[0][0];
    expect(payload.ok).toBe(true);
    expect(payload.summary).toBe('Zoom is fully configured.');
    // Resolution probe passes
    expect(payload.resolution.global?.ok).toBe(true);
    expect(payload.resolution.global?.clientId).toBe('sk-test-client-id');
    expect(payload.resolution.effectiveRedirectUri).toBe('http://localhost:6767/csfaq/api/zoom/auth/callback');
  });

  it('reports OAUTH_STATE_SECRET as the active HMAC secret, JWT_SECRET as fallback (note set)', async () => {
    process.env.ZOOM_CLIENT_ID = 'sk-id';
    process.env.ZOOM_CLIENT_SECRET = 'sk-secret';
    process.env.OAUTH_STATE_SECRET = 'state-secret';
    process.env.JWT_SECRET = 'jwt-secret';
    const res = mockRes();
    await getZoomDiagnostics({} as never, res as never);
    const payload = res.json.mock.calls[0][0];
    const oauth = payload.envVars.find((v: { name: string }) => v.name === 'OAUTH_STATE_SECRET');
    const jwt = payload.envVars.find((v: { name: string }) => v.name === 'JWT_SECRET');
    expect(oauth.present).toBe(true);
    expect(oauth.used).toBe(true);
    expect(jwt.present).toBe(true);
    // JWT_SECRET is set but NOT used because OAUTH_STATE_SECRET wins
    expect(jwt.used).toBe(false);
    expect(jwt.note).toBeUndefined();
  });

  it('reports JWT_SECRET as the fallback HMAC secret when OAUTH_STATE_SECRET is missing (with explanatory note)', async () => {
    process.env.ZOOM_CLIENT_ID = 'sk-id';
    process.env.ZOOM_CLIENT_SECRET = 'sk-secret';
    process.env.JWT_SECRET = 'jwt-secret';
    const res = mockRes();
    await getZoomDiagnostics({} as never, res as never);
    const payload = res.json.mock.calls[0][0];
    const jwt = payload.envVars.find((v: { name: string }) => v.name === 'JWT_SECRET');
    expect(jwt?.used).toBe(true);
    expect(jwt?.note).toMatch(/state HMAC secret/);
    expect(jwt?.note).toMatch(/OAUTH_STATE_SECRET is unset/);
  });

  it('reports explicit ZOOM_REDIRECT_URI override + uses it as effectiveRedirectUri', async () => {
    process.env.ZOOM_CLIENT_ID = 'sk-id';
    process.env.ZOOM_CLIENT_SECRET = 'sk-secret';
    process.env.ZOOM_REDIRECT_URI = 'https://samagama.in/csfaq/api/zoom/auth/callback';
    const res = mockRes();
    await getZoomDiagnostics({} as never, res as never);
    const payload = res.json.mock.calls[0][0];
    const rr = payload.envVars.find((v: { name: string }) => v.name === 'ZOOM_REDIRECT_URI');
    expect(rr?.present).toBe(true);
    expect(rr?.used).toBe(true);
    expect(payload.resolution.effectiveRedirectUri).toBe('https://samagama.in/csfaq/api/zoom/auth/callback');
  });
});

describe('getZoomDiagnostics — per-program overrides', () => {
  beforeEach(() => {
    mockProgramConfigDocs.length = 0;
    mockDecrypt.mockClear();
    mockDecrypt.mockImplementation((_cipher: string) => 'decrypted-secret-plaintext');
    delete process.env.ZOOM_CLIENT_ID;
    delete process.env.ZOOM_CLIENT_SECRET;
  });

  it('reports decrypted per-program rows', async () => {
    process.env.ZOOM_CLIENT_ID = 'sk-id';
    process.env.ZOOM_CLIENT_SECRET = 'sk-secret';
    mockProgramConfigDocs.push(
      {
        batchId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        zoom: {
          clientId: 'per-prog-client-id',
          clientSecret: 'encrypted:abc123',
          webhookSecretToken: 'encrypted:wh789',
        },
      },
    );
    const res = mockRes();
    await getZoomDiagnostics({} as never, res as never);
    const payload = res.json.mock.calls[0][0];
    expect(payload.perProgram).toHaveLength(1);
    const row = payload.perProgram[0];
    expect(row.batchId).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(row.hasClientId).toBe(true);
    expect(row.hasClientSecret).toBe(true);
    expect(row.hasWebhookToken).toBe(true);
    expect(row.decryptOk).toBe(true);
    // Sample program resolution probe uses the first row
    expect(payload.resolution.sampleProgram?.batchId).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(payload.resolution.sampleProgram?.source).toBe('program');
  });

  it('reports decryption failure without crashing the endpoint', async () => {
    process.env.ZOOM_CLIENT_ID = 'sk-id';
    process.env.ZOOM_CLIENT_SECRET = 'sk-secret';
    mockDecrypt.mockImplementation(() => { throw new Error('bad cipher: not authenticated'); });
    mockProgramConfigDocs.push({
      batchId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      zoom: { clientId: 'per-prog-id', clientSecret: 'enc:xx' },
    });
    const res = mockRes();
    await getZoomDiagnostics({} as never, res as never);
    const payload = res.json.mock.calls[0][0];
    expect(payload.perProgram[0].decryptOk).toBe(false);
    expect(payload.perProgram[0].decryptError).toMatch(/bad cipher/);
    // The diagnostics endpoint itself didn't throw — that's
    // the point. The decrypt failure is surfaced as data, not a
    // crash.
    expect(res.status).not.toHaveBeenCalled();
  });

  it('summary reflects missing ZOOM_CLIENT_SECRET', async () => {
    // No env keys set — there's nothing the runtime can fall
    // back to. The summary names what's missing.
    const res = mockRes();
    await getZoomDiagnostics({} as never, res as never);
    const payload = res.json.mock.calls[0][0];
    expect(payload.summary).toMatch(/ZOOM_CLIENT_ID.*ZOOM_CLIENT_SECRET|ZOOM_CLIENT_SECRET.*ZOOM_CLIENT_ID/);
  });
});
