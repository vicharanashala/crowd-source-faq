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
 * The cookie is JS-readable (HttpOnly=false on samagama.in's side) so
 * we can grab it from document.cookie. We then POST to our own
 * /api/auth/bridge/exchange endpoint? No — the cookie ALREADY
 * contains our JWT, signed by samagama.in's bridge after they hit
 * /api/auth/bridge/exchange. We just need to extract + store.
 *
 * Wait — that's wrong. Re-reading the design:
 *   samagama.in calls /api/auth/bridge/exchange → we return JWT
 *   samagama.in stores JWT in yaksha_session cookie
 *   Browser sends cookie to /csfaq → backend middleware verifies
 *   → populates req.user → request authenticated
 *
 * So on the frontend, the cookie DOES contain a valid JWT. The
 * frontend just needs to read it and store in localStorage so the
 * existing AuthContext reads it. No round-trip needed.
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