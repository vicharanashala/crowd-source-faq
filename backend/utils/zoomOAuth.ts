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

import User from '../models/User.js';
import { encrypt, decrypt } from './crypto.js';
import { zoomOAuthCircuit, zoomApiCircuit, CircuitOpenError } from './circuitBreaker.js';

// ─── Config ─────────────────────────────────────────────────────────────────

const ZOOM_AUTH_URL    = 'https://zoom.us/oauth/authorize';
const ZOOM_TOKEN_URL   = 'https://zoom.us/oauth/token';
const ZOOM_API_BASE    = 'https://api.zoom.us/v2';

// Lazy getters — read process.env directly (avoids module-level capture timing issues)
// Only validate when first called, after dotenv has loaded all env files
function getClientId()     { const v = process.env.ZOOM_CLIENT_ID;     if (!v) throw new Error('Missing ZOOM_CLIENT_ID env var — add it to backend/.env.local');     return v; }
function getClientSecret() { const v = process.env.ZOOM_CLIENT_SECRET; if (!v) throw new Error('Missing ZOOM_CLIENT_SECRET env var — add it to backend/.env.local'); return v; }
function getRedirectUri()  { return process.env.ZOOM_REDIRECT_URI ?? 'http://localhost:6767/api/zoom/auth/callback'; }

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
 * The state param encodes the user's internal ID so we know who to link on callback.
 */
export function buildZoomAuthUrl(internalUserId: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    state: Buffer.from(internalUserId).toString('base64'), // encode user ID in state
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
export async function exchangeCodeForTokens(code: string): Promise<ZoomTokens> {
  return await zoomOAuthCircuit.execute(async () => {
    const credentials = Buffer.from(`${getClientId()}:${getClientSecret()}`).toString('base64');

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
export async function refreshZoomTokens(refreshToken: string): Promise<ZoomTokens> {
  return await zoomOAuthCircuit.execute(async () => {
    const credentials = Buffer.from(`${getClientId()}:${getClientSecret()}`).toString('base64');

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
