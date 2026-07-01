/**
 * Zoom OAuth 2.0 utilities for per-user token management.
 *
 * Handles:
 *   - Authorization URL generation
 *   - Token exchange (auth code → access/refresh tokens)
 *   - Token refresh
 *   - Per-user token lookup + refresh-before-use pattern
 *   - Encryption of stored tokens at rest (AES-256-GCM via crypto.ts)
 *   - Circuit breakers to prevent cascading failures
 */

import crypto from 'crypto';
import User from '../../modules/auth/user.model.js';
import { encrypt, decrypt } from '../../utils/auth/crypto.js';
import { zoomOAuthCircuit, zoomApiCircuit } from '../../utils/http/circuitBreaker.js';
import { logger } from '../../utils/http/logger.js';

// ─── Config ─────────────────────────────────────────────────────────────────

const ZOOM_AUTH_URL    = 'https://zoom.us/oauth/authorize';
const ZOOM_TOKEN_URL   = 'https://zoom.us/oauth/token';
const ZOOM_API_BASE    = 'https://api.zoom.us/v2';

// Lazy getters — read process.env directly (avoids module-level capture timing issues)
// Only validate when first called, after dotenv has loaded all env files
function getClientId()     { const v = process.env.ZOOM_CLIENT_ID;     if (!v) throw new Error('Missing ZOOM_CLIENT_ID env var — add it to backend/.env.local');     return v; }
function getClientSecret() { const v = process.env.ZOOM_CLIENT_SECRET; if (!v) throw new Error('Missing ZOOM_CLIENT_SECRET env var — add it to backend/.env.local');     return v; }
function getRedirectUri()  {
  const fallback = 'http://localhost:6767/csfaq/api/zoom/auth/callback';
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.ZOOM_REDIRECT_URI) {
      throw new Error('ZOOM_REDIRECT_URI is not set in production — set it in Infisical to your public backend URL');
    }
    return process.env.ZOOM_REDIRECT_URI;
  }
  return process.env.ZOOM_REDIRECT_URI ?? fallback;
}

/**
 * v1.69 — Phase 5: per-program Zoom credential resolver.
 *
 * Each program can carry its own Zoom OAuth app registration in
 * `ProgramConfig.zoom` (clientId/clientSecret/webhookSecretToken/
 * accessToken/refreshToken, encrypted at rest). When `batchId`
 * is supplied, this helper returns the per-program credentials
 * (decrypted), falling back to the env-var-backed global app
 * when the program has nothing configured. When `batchId` is
 * null, it returns the env-var global app.
 *
 * Call sites that need the per-program credentials pass the
 * meeting's batchId. Until the per-program Zoom rewrite lands
 * in Phase 5+, the runtime uses the env-var-backed global app
 * (Phase 5a). The admin endpoint at
 * `/api/admin/programs/:id/zoom` stores per-program credentials
 * in `ProgramConfig.zoom` ready for the runtime switchover.
 */
export interface ResolvedZoomConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  webhookSecretToken: string;
  source: 'program' | 'env';
  batchId: string | null;
}

export async function getProgramZoomConfig(
  batchId: string | null = null
): Promise<ResolvedZoomConfig> {
  if (batchId) {
    try {
      // v1.69 — Phase 5: dynamic import so the file can be
      // loaded even when the program is mid-migration and the
      // ProgramConfig model hasn't been created yet.
      const { default: ProgramConfig } = await import('../../modules/program/program-config.model.js');
      const { decrypt } = await import('../../utils/auth/crypto.js');
      const doc = await ProgramConfig.findOne({ batchId }).select('+zoom.clientSecret +zoom.webhookSecretToken +zoom.accessToken +zoom.refreshToken').lean();
      if (doc?.zoom?.clientId && doc.zoom.clientSecret) {
        return {
          clientId: doc.zoom.clientId,
          clientSecret: decrypt(doc.zoom.clientSecret),
          redirectUri: doc.zoom.redirectUri ?? getRedirectUri(),
          webhookSecretToken: doc.zoom.webhookSecretToken ? decrypt(doc.zoom.webhookSecretToken) : '',
          source: 'program',
          batchId,
        };
      }
    } catch (err) {
      // ProgramConfig model not available or decryption failed —
      // fall through to the env-var global app.
    }
  }
  return {
    clientId: getClientId(),
    clientSecret: getClientSecret(),
    redirectUri: getRedirectUri(),
    webhookSecretToken: process.env.ZOOM_WEBHOOK_SECRET_TOKEN ?? '',
    source: 'env',
    batchId,
  };
}

/**
 * Build the Zoom OAuth redirect URI dynamically, based on the incoming request
 * (origin host + the path that handles the callback). Falls back to the env var
 * or the hard-coded localhost default if no request context is available.
 *
 * This makes the OAuth flow work in any environment (dev, ngrok, staging, prod)
 * without manually editing ZOOM_REDIRECT_URI for each deployment.
 *
 * Behavior:
 *   - If ZOOM_REDIRECT_URI is set in env, use that as-is (explicit override wins)
 *   - Otherwise, build from the request: `${proto}://${host}/api/zoom/auth/callback`
 *     where proto honours X-Forwarded-Proto (for ngrok / reverse proxies)
 *
 * The 'request' param can be omitted when called outside an HTTP context (e.g. from a script),
 * in which case the env var or hard-coded default is used.
 */
export function buildDynamicRedirectUri(request?: { headers?: Record<string, string | string[] | undefined>; protocol?: string }): string {
  // Explicit env var wins — admin has set it deliberately
  if (process.env.ZOOM_REDIRECT_URI) return process.env.ZOOM_REDIRECT_URI;

  if (!request) {
    return 'http://localhost:6767/csfaq/api/zoom/auth/callback';
  }

  // Pull host (and proto) from the incoming request — works behind ngrok / proxies
  const forwardedProto = (request.headers?.['x-forwarded-proto'] as string | undefined) ?? '';
  const forwardedHost  = (request.headers?.['x-forwarded-host']  as string | undefined) ?? '';
  const hostHeader     = (request.headers?.['host']              as string | undefined) ?? '';

  const host  = forwardedHost || hostHeader || 'localhost:6767';
  const proto = forwardedProto || request.protocol || (host.includes('localhost') ? 'http' : 'https');

  return `${proto}://${host}/csfaq/api/zoom/auth/callback`;
}

// ─── Token encryption helpers ─────────────────────────────────────────────────

/** Encrypt a token before storing it in the database. */
function encryptToken(token: string): string {
  return encrypt(token);
}

/** Decrypt a stored token. */
function decryptToken(encrypted: string): string {
  return decrypt(encrypted);
}

// Fallback: if this fails, leave zoomUserId blank — can be fetched on first webhook

/**
 * Build the Zoom OAuth authorization URL for a given user.
 * The state param is HMAC-signed with a server-side secret and includes an
 * expiry timestamp — this prevents the OAuth-state-forgery attack where an
 * attacker crafts `state=base64(victimUserId)` to link their own Zoom tokens
 * to the victim's account (issue N1 in issues.md).
 *
 * Format:  base64url( userId | "." | expiryMs | "." | hmacSha256 )
 * HMAC key: JWT_SECRET (already required by the rest of the app — no new env var)
 * TTL:       5 minutes (typical OAuth flow finishes in <60s; anything older is stale)
 *
 * If a request object is provided, the redirect URI is built dynamically from the
 * request's host — this is what makes the OAuth flow work across multiple deploy
 * targets (ngrok, staging, prod) without editing ZOOM_REDIRECT_URI.
 */
const STATE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// v1.68 — H1: dedicated secret for OAuth state HMAC. Falls back
// to JWT_SECRET for backwards compat. OAUTH_STATE_SECRET is
// recommended (rotate independently of JWT signing).
function getStateSecret(): string {
  const v = process.env.OAUTH_STATE_SECRET ?? process.env.JWT_SECRET;
  if (!v) throw new Error('OAUTH_STATE_SECRET (or legacy JWT_SECRET) required to sign OAuth state');
  return v;
}

/** Sign a state token for the given user. Returns the encoded `state` param. */
export function signOAuthState(internalUserId: string): string {
  const expiry = Date.now() + STATE_TTL_MS;
  const payload = `${internalUserId}.${expiry}`;
  const hmac = crypto
    .createHmac('sha256', getStateSecret())
    .update(payload)
    .digest('base64url');
  // base64url-encode the whole "payload.hmac" so the callback can decode safely
  return Buffer.from(`${payload}.${hmac}`, 'utf8').toString('base64url');
}

/** Verify a state token, return the userId on success, null on any failure. */
export function verifyOAuthState(state: string): string | null {
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const parts = decoded.split('.');
    if (parts.length !== 3) return null;
    const [userId, expiryStr, providedHmac] = parts;
    const payload = `${userId}.${expiryStr}`;
    const expectedHmac = crypto
      .createHmac('sha256', getStateSecret())
      .update(payload)
      .digest('base64url');

    // Constant-time comparison to prevent timing attacks
    const a = Buffer.from(providedHmac);
    const b = Buffer.from(expectedHmac);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    // Reject expired states
    const expiry = Number(expiryStr);
    if (!Number.isFinite(expiry) || expiry < Date.now()) return null;

    // userId must be a 24-char hex ObjectId
    if (!/^[a-f0-9]{24}$/i.test(userId)) return null;

    return userId;
  } catch (err) {
    logger.warn(`[zoomOAuth] State verification failed for state token: ${(err as Error).message}`);
    return null;
  }
}

/**
 * v1.69 — Phase 5 runtime: per-program Zoom OAuth flow.
 * When `batchId` is supplied, the URL is built with the
 * per-program Zoom app's client_id (resolved via
 * getProgramZoomConfig). When null, the env-var-backed
 * global Zoom app is used (backwards compat).
 */
export async function buildZoomAuthUrl(
  internalUserId: string,
  request?: { headers?: Record<string, string | string[] | undefined>; protocol?: string },
  batchId: string | null = null
): Promise<string> {
  const redirectUri = buildDynamicRedirectUri(request);
  const cfg = await getProgramZoomConfig(batchId);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    state: signOAuthState(internalUserId),
  });
  return `${ZOOM_AUTH_URL}?${params}`;
}

// ─── Token Exchange ────────────────────────────────────────────────────────────

interface ZoomTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number; // seconds
  scope: string;
}

/**
 * Exchange an authorization code for Zoom tokens.
 * Protected by the zoomOAuth circuit breaker.
 */
/**
 * v1.69 — Phase 5 runtime: per-program token exchange.
 * When `batchId` is supplied, the per-program Zoom app's
 * client_id/secret is used (resolved via
 * getProgramZoomConfig). The user's stored OAuth token is
 * then scoped to that program — every subsequent API call
 * via that token operates against the program's Zoom app.
 */
export async function exchangeCodeForTokens(code: string, batchId: string | null = null): Promise<ZoomTokens> {
  const cfg = await getProgramZoomConfig(batchId);
  return await zoomOAuthCircuit.execute(async () => {
    const credentials = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');

    const res = await fetch(`${ZOOM_TOKEN_URL}?grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(getRedirectUri())}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Zoom token exchange failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<ZoomTokens>;
  });
}

/**
 * Refresh a user's Zoom tokens using their stored refresh token.
 * Protected by the zoomOAuth circuit breaker.
 */
/**
 * v1.69 — Phase 5 runtime: per-program token refresh.
 * When `batchId` is supplied, the per-program Zoom app's
 * client_id/secret is used. The refreshed token is
 * re-bound to that program in the User doc.
 */
export async function refreshZoomTokens(refreshToken: string, batchId: string | null = null): Promise<ZoomTokens> {
  const cfg = await getProgramZoomConfig(batchId);
  return await zoomOAuthCircuit.execute(async () => {
    const credentials = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');

    const res = await fetch(`${ZOOM_TOKEN_URL}?grant_type=refresh_token&refresh_token=${refreshToken}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Zoom token refresh failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<ZoomTokens>;
  });
}

// ─── Per-user token management ────────────────────────────────────────────────

/**
 * Get a valid Zoom access token for a user.
 * If the stored token is expired or about to expire, automatically refreshes it.
 * Updates the user's document with new tokens if a refresh happened.
 * Tokens are stored encrypted; this function handles encryption/decryption.
 */
export async function getUserZoomToken(userId: string): Promise<string> {
  const user = await User.findById(userId).select('+zoomAccessToken +zoomRefreshToken +zoomTokenExpiry');
  if (!user || !user.zoomConnected || !user.zoomAccessToken) {
    throw new Error('User has not connected their Zoom account');
  }

  // Decrypt the stored token
  let accessToken: string;
  let refreshToken: string;
  try {
    accessToken  = decryptToken(user.zoomAccessToken);
    refreshToken = user.zoomRefreshToken ? decryptToken(user.zoomRefreshToken) : '';
  } catch {
    throw new Error('Failed to decrypt stored Zoom tokens — token may be corrupted or from a previous master key');
  }

  // Check expiry: refresh if expired or expiring within 60 seconds
  const isExpired = !user.zoomTokenExpiry || Date.now() >= user.zoomTokenExpiry.getTime() - 60_000;

  if (isExpired) {
    if (!refreshToken) throw new Error('No refresh token — user needs to reconnect Zoom');

    const tokens = await refreshZoomTokens(refreshToken);

    // Encrypt new tokens before storing
    const encryptedAccess  = encryptToken(tokens.access_token);
    const encryptedRefresh = encryptToken(tokens.refresh_token);

    user.zoomAccessToken  = encryptedAccess;
    user.zoomRefreshToken = encryptedRefresh;
    user.zoomTokenExpiry  = new Date(Date.now() + tokens.expires_in * 1000);
    await user.save();

    return tokens.access_token;
  }

  return accessToken;
}

/**
 * Fetch the Zoom user's own ID (used to link webhook events to our user).
 * We use /users?page_size=1 — requires recording:read scope (which we already have).
 * The 'me' alias (GET /users/me) requires user:read scope which may not be granted.
 */
export async function getZoomUserId(accessToken: string): Promise<string> {
  // Try /users/me first (works if user:read scope is granted)
  let res = await fetch(`${ZOOM_API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });

  // Fallback: list users — first user in the list is the connected account's owner
  if (!res.ok) {
    res = await fetch(`${ZOOM_API_BASE}/users?page_size=1`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });
  }

  if (!res.ok) throw new Error(`Failed to get Zoom user info (${res.status})`);
  const data = await res.json() as { id?: string; users?: { id: string }[] };

  // Return id from /users/me or first user from list
  const zoomUserId = data.id ?? data.users?.[0]?.id;
  if (!zoomUserId) throw new Error('Could not extract Zoom user ID from response');
  return zoomUserId;
}

/**
 * Make an authenticated Zoom API call using a user's stored token.
 * Protected by the zoomApi circuit breaker.
 */
export async function zoomApiAsUser<T = unknown>(
  userId: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getUserZoomToken(userId);
  return await zoomApiCircuit.execute(async () => {
    const res = await fetch(`${ZOOM_API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Zoom API error ${res.status} for ${path}: ${text}`);
    }
    return res.json() as Promise<T>;
  });
}

/**
 * Make a Zoom API call with retry + stale-cache fallback.
 * Use this for non-critical reads where serving stale data is better than erroring.
 *
 * Returns { data, fromCache, error } so caller can decide how to respond.
 */
export async function zoomApiWithFallback<T = unknown>(
  userId: string,
  path: string,
  options: RequestInit = {},
): Promise<{ data: T | null; fromCache: boolean; error: string | null }> {
  const { zoomFallback } = await import('./zoomFallback.js');

  return zoomFallback.withFallback<T>({
    cacheKey: `zoom:${userId}:${path}`,
    cacheTtlMs: 60_000,
    fetch: () => zoomApiAsUser<T>(userId, path, options),
  });
}

/**
 * Download a transcript file using a user's stored token.
 */
export async function downloadTranscriptAsUser(userId: string, downloadUrl: string): Promise<string> {
  const token = await getUserZoomToken(userId);
  const res = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Transcript download failed (${res.status})`);
  return res.text();
}

// ─── Past Recordings (backfill on connect) ────────────────────────────────────

export interface ZoomRecording {
  uuid: string;
  id: string;
  topic: string;
  startTime: string;
  duration: number;
  recordingFiles: {
    id: string;
    meetingId: string;
    recordingStart: string;
    recordingEnd: string;
    fileType: string;
    fileExtension: string;
    downloadUrl: string;
  }[];
}

export interface ListRecordingsResponse {
  pageSize: number;
  totalRecords: number;
  nextPageToken?: string;
  meetings: ZoomRecording[];
}

/**
 * Fetch past cloud recordings for a user.
 * Used during backfill after first Zoom OAuth connection.
 *
 * @param userId    — our internal user ID
 * @param from      — start date (ISO string), defaults to 90 days ago
 * @param to        — end date (ISO string), defaults to today
 * @param pageSize  — results per page (max 300)
 */
export async function getPastRecordings(
  userId: string,
  from?: string,
  to?: string,
  pageSize = 50,
): Promise<ZoomRecording[]> {
  const toDate   = to   ?? new Date().toISOString().split('T')[0];
  const fromDate = from ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const data = await zoomApiAsUser<ListRecordingsResponse>(
    userId,
    `/users/me/recordings?from=${fromDate}&to=${toDate}&page_size=${Math.min(pageSize, 300)}`,
  );

  return data.meetings ?? [];
}
