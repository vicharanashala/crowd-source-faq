/**
 * cookieBridge.ts — frontend helper for samagama.in SSO.
 *
 * Reads the `yaksha_session` cookie (set by samagama.in's auth via
 * our bridge endpoint) and mirrors it into localStorage.yaksha_token
 * so the existing axios interceptor + AuthContext picks it up
 * without any other code changes.
 *
 * Called once on app boot (in main.tsx before AuthProvider mounts).
 * If no cookie, this is a no-op and the user stays unauthenticated.
 *
 * The full flow, in order:
 *
 *   1. A user signs in on samagama.in.
 *   2. samagama.in's backend calls our
 *      POST /api/auth/bridge/exchange (HMAC-signed) and gets back a
 *      csfaq JWT.
 *   3. samagama.in stores that JWT in the `yaksha_session` cookie,
 *      scoped to Domain=.samagama.in so it is sent to /csfaq too.
 *   4. The user opens /csfaq. This module runs on boot, reads the
 *      cookie, and copies the JWT into localStorage.
 *   5. Every later request uses the ordinary
 *      `Authorization: Bearer <jwt>` path via the existing axios
 *      interceptor and authShared.ts.
 *
 * There is deliberately NO backend middleware that reads this cookie.
 * The frontend mirror in step 4 is sufficient, which keeps the added
 * surface area to one endpoint plus this file. See the note in
 * apps/backend/src/bootstrap/app.ts if you are tempted to add one.
 *
 * The cookie must be JS-readable (HttpOnly=false on samagama.in's
 * side) for step 4 to work. That is a known trade-off: any XSS under
 * samagama.in can read the token. It is recorded in the integration
 * spec rather than left as an accident.
 */

const BRIDGE_COOKIE_NAME = 'yaksha_session';
const TOKEN_STORAGE_KEY = 'yaksha_token';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split(';')
    .map((s) => s.trim())
    .find((c) => c.startsWith(`${name}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(name.length + 1));
}

/**
 * Decode a JWT payload (without verifying — backend middleware
 * already verified it on this request). Returns the expiry timestamp
 * (in seconds) or null if the token is malformed.
 */
function jwtExpiry(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payloadB64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const padded = payloadB64 + '='.repeat((4 - (payloadB64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/**
 * Sync the bridge cookie into localStorage. Returns true if a token
 * was stored, false if the cookie is missing / malformed / expired.
 */
export function syncBridgeCookieToLocalStorage(): boolean {
  const token = readCookie(BRIDGE_COOKIE_NAME);
  if (!token) return false;

  // Validate expiry client-side too — no point storing an expired JWT.
  const exp = jwtExpiry(token);
  if (exp !== null) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (exp <= nowSeconds) return false;
  }

  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear the local JWT (called on logout — only our side; samagama.in
 * session is untouched per user requirement).
 */
export function clearLocalAuth(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem('yaksha_refresh_token');
    localStorage.removeItem('yaksha_user');
  } catch {
    /* ignore — SSR / private mode */
  }
}