# Implementation Prompt for samagama.in's Coding LLM

You are implementing a Single Sign-On (SSO) bridge between samagama.in (your application) and the Yaksha FAQ Portal (a separate product, served at `samagama.in/csfaq`). When a user logs into samagama.in, they should automatically be logged into the FAQ portal at `samagama.in/csfaq` — no second login screen, no redirects. One login, two apps authenticated.

Your job: implement the server-side bridge call on samagama.in's backend that posts a signed request to our backend at `https://samagama.in/csfaq/api/auth/bridge/exchange`, and store the returned JWT in a cookie the FAQ frontend can read.

## What you do NOT need to do

- Do NOT build anything in the FAQ portal itself — the receiver endpoint is already implemented on our side.
- Do NOT touch the FAQ frontend code — it already mirrors our cookie into localStorage on boot.
- Do NOT add CORS configuration — the FAQ backend is reverse-proxied at `/csfaq/api/*` on the same origin, so no cross-origin setup is needed.
- Do NOT install new dependencies if `node:crypto` (or your language's built-in HMAC) is sufficient. It is.

## What you DO need to do

Three concrete deliverables, in this order:
1. A reusable helper function that signs and POSTs the bridge request.
2. A call to that helper from your existing successful-login handler.
3. A `Set-Cookie` header on the response that stores the returned JWT with the exact attributes we specify.

## The contract (binding — match it exactly)

### Endpoint
```
POST https://samagama.in/csfaq/api/auth/bridge/exchange
Content-Type: application/json
X-Bridge-Secret-Index: 0
```

### Request body (JSON)
```json
{
  "email": "alice@example.com",
  "displayName": "Alice Smith",
  "ts": 1717420000,
  "sig": "a3f8...hex...e91b"
}
```

| Field | Type | Notes |
|---|---|---|
| `email` | string | The user's email. Must match `^[^\s@]+@[^\s@]+\.[^\s@]+$`. |
| `displayName` | string | The user's display name, 1-100 chars. We update the user's local `name` if it differs. |
| `ts` | number | Unix seconds at the moment the POST is sent. Must be within ±60 seconds of our server clock. |
| `sig` | string | Hex-encoded HMAC-SHA256 (lowercase hex output). |

### Canonical string for the HMAC
```
${ts}.${email.toLowerCase().trim()}.${displayName.trim()}
```

This is the exact byte sequence the HMAC is computed over. Whitespace and case are part of the contract — do not deviate. Compute `ts` immediately before signing; do not cache it.

### Response (200)
```json
{
  "token": "eyJhbG.......",
  "refreshToken": "eyJhbG...VCJ9....",
  "user": { "id": "...", "name": "...", "email": "...", "role": "user", "..." }
}
```

You only need `token`. The rest is informational.

### Error responses (table)
| Status | Body | What to do |
|---|---|---|
| 200 | `{ token, refreshToken, user }` | Success — set the cookie. |
| 400 | `{ message: "email must be a valid email address" }` | The email you sent is malformed. Fix your code. |
| 400 | `{ message: "displayName must be 1-100 chars" }` | The display name is missing or too long. |
| 401 | `{ message: "Invalid bridge signature" }` | HMAC mismatch. Check secret, canonical string, and timestamp. |
| 401 | `{ message: "Bridge token expired (timestamp outside 60s window)" }` | Your clock is off from ours, or you're sending an old request. Use NTP. |
| 503 | `{ message: "Bridge is disabled" }` | We turned the bridge off. Check in with us. |
| 503 | `{ message: "Bridge is not configured (BRIDGE_SHARED_SECRET unset)" }` | Our backend is misconfigured. Check in with us. |

**Critical rule: do NOT show raw error messages to the end user.** If the bridge call fails for any reason, log it server-side and continue with normal samagama.in login. The user's samagama.in login must NEVER be blocked by a bridge failure.

### Cookie attributes (exact — match every character)
```
Set-Cookie: yaksha_session=<token>; Domain=.samagama.in; Path=/; Secure; SameSite=Lax; Max-Age=604800
```

| Attribute | Value | Why |
|---|---|---|
| Name | `yaksha_session` | Hardcoded in our frontend reader. |
| Value | `<token from response body>` | The JWT we returned. |
| Domain | `.samagama.in` | Leading dot — covers samagama.in and any subdomain. Without the dot, the cookie won't be visible at subdomains. |
| Path | `/` | Browser sends on every request to the domain. |
| Secure | ✓ | HTTPS only. |
| HttpOnly | **UNCHECKED / false** | Our FAQ frontend reads this cookie via `document.cookie` on app boot and mirrors it into `localStorage`. If HttpOnly is true, the frontend can't read it and the bridge silently fails. |
| SameSite | `Lax` | Same-origin navigation. Lax is correct. Do NOT use Strict (would block cross-app navigation). |
| Max-Age | `604800` | 7 days, matching JWT lifetime. Without this, the cookie becomes a session cookie and the user is logged out when they close their browser. |

**Express `res.cookie()` users:** pass `httpOnly: false` explicitly. Express's default is true.
**Fastify users:** `reply.setCookie(name, value, { httpOnly: false, ... })`.
**Plain Node `http`:** write the `Set-Cookie` header string verbatim with all attributes.

## The shared secret

`BRIDGE_SHARED_SECRET` (yours) / `YAKSHA_BRIDGE_SECRET` (your env var name) is a high-entropy string we'll provide you out-of-band. Generate it locally with `openssl rand -hex 32` and share with us via your secret manager (NOT git, NOT Slack public channels). Until you have the real secret, set a placeholder locally so your code paths can be exercised.

Use the SAME secret for HMAC signing on your side and verification on our side. There is no per-user secret — one secret per environment (dev / staging / prod).

## Reference implementation (Node.js / Express / TypeScript)

This is the shape of the code. Adapt to your framework, but preserve every line's intent.

```typescript
// lib/yakshaBridge.ts
import { createHmac } from 'node:crypto';

const BRIDGE_URL = 'https://samagama.in/csfaq/api/auth/bridge/exchange';
const BRIDGE_TIMEOUT_MS = 5000;

interface BridgeSuccess {
  token: string;
  refreshToken: string;
  user: { id: string; name: string; email: string; role: string };
}

export interface BridgeUser { email: string; name: string; }
export interface BridgeResult {
  ok: boolean;
  token?: string;
  reason?: 'no-secret' | 'http-error' | 'network-error' | 'malformed-response';
  status?: number;
}

export async function bridgeToCsfaq(
  user: BridgeUser,
  setCookieHeader: (name: string, value: string, maxAgeSec: number) => void,
): Promise<BridgeResult> {
  const secret = process.env.YAKSHA_BRIDGE_SECRET;
  if (!secret) {
    console.warn('[yaksha-bridge] YAKSHA_BRIDGE_SECRET not set — skipping');
    return { ok: false, reason: 'no-secret' };
  }

  const ts = Math.floor(Date.now() / 1000);
  const email = user.email.toLowerCase().trim();
  const displayName = user.name.trim();

  const canonical = `${ts}.${email}.${displayName}`;
  const sig = createHmac('sha256', secret).update(canonical).digest('hex');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BRIDGE_TIMEOUT_MS);

  try {
    const res = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Secret-Index': '0',
      },
      body: JSON.stringify({ email, displayName, ts, sig }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.text();
      console.error(`[yaksha-bridge] HTTP ${res.status}: ${body.slice(0, 200)}`);
      return { ok: false, reason: 'http-error', status: res.status };
    }

    const data = (await res.json()) as BridgeSuccess;
    if (!data.token || typeof data.token !== 'string') {
      console.error('[yaksha-bridge] response missing token field');
      return { ok: false, reason: 'malformed-response' };
    }

    setCookieHeader('yaksha_session', data.token, 7 * 24 * 60 * 60);
    return { ok: true, token: data.token };
  } catch (err) {
    clearTimeout(timer);
    console.error('[yaksha-bridge] network error:', (err as Error).message);
    return { ok: false, reason: 'network-error' };
  }
}
```

Wire it into your login handler AFTER credential validation succeeds, BEFORE the redirect:

```typescript
import { bridgeToCsfaq } from './lib/yakshaBridge';

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await validateCredentials(email, password);
  if (!user) return res.status(401).send('invalid');

  // your existing session creation goes here
  await createSamagamaSession(res, user);

  // bridge to FAQ portal — non-fatal on failure
  const bridgeResult = await bridgeToCsfaq(
    { email: user.email, name: user.name },
    (name, value, maxAge) => {
      res.cookie(name, value, {
        domain: '.samagama.in',
        path: '/',
        secure: true,
        sameSite: 'lax',
        httpOnly: false,        // FAQ frontend reads this via document.cookie
        maxAge: maxAge * 1000,  // express wants ms
      });
    },
  );

  if (!bridgeResult.ok) {
    console.warn(`[yaksha-bridge] failed: ${bridgeResult.reason}${bridgeResult.status ? ` (${bridgeResult.status})` : ''}`);
  }

  res.redirect('/dashboard');
});
```

Add logout cleanup:
```typescript
app.post('/logout', (req, res) => {
  // your existing logout logic
  res.clearCookie('yaksha_session', { domain: '.samagama.in', path: '/' });
});
```

## Testing checklist — verify each before declaring done

1. **Manual curl test.** Use the secret we'll provide, sign a request by hand, POST it. Expect 200 with a token. If 401, diff your canonical string against `printf '%s' "${ts}.${email}.${displayName}"` — `echo` adds a newline, `printf '%s'` doesn't.
2. **End-to-end browser test.** Open a private/incognito window. Log in on samagama.in. Confirm `POST /csfaq/api/auth/bridge/exchange` returns 200 in DevTools → Network. Navigate to `https://samagama.in/csfaq`. Confirm the FAQ portal shows your name, not "Sign in".
3. **Cookie attributes test.** In DevTools → Application → Cookies, confirm `yaksha_session` exists with: Domain=`.samagama.in` (leading dot), Path=`/`, Secure ✓, HttpOnly ☐, Max-Age=604800. **If HttpOnly is checked, the integration silently fails — fix the cookie call.**
4. **Negative-path tests.** (a) Bad signature → 401 "Invalid bridge signature". (b) `ts` 120 seconds in the past → 401 "Bridge token expired". (c) `email: "not-an-email"` → 400 "email must be a valid email address".
5. **Failure resilience test.** Temporarily set `YAKSHA_BRIDGE_SECRET` to a wrong value. Log in. samagama.in login must still succeed; only the FAQ auto-login should fail (logged in your server logs).

## Out of scope

- **Secret rotation procedure** (covered in our full doc at `docs/auth_samagama.md`, section "Secret rotation procedure") — only needed for prod maintenance, not for initial rollout.
- **Email change sync** — we don't currently sync email changes from samagama.in. Same email = same local user. If you need email-change sync, ask us — it's a small addition.
- **Refresh tokens** — the `refreshToken` in the bridge response is for our backend's token refresh flow only. You don't need to store or use it.

## When to come back to us

- 401 on the curl test that doesn't match the canonical-string mismatch pattern → paste the exact `ts`, email, displayName, sig, and your signing code. We'll diff against our verifier.
- Cookie lands in DevTools but `/csfaq` still shows logged out → screenshot the cookie attributes plus a Network trace of `/csfaq/api/auth/me`.
- A user is shown as a different person on `/csfaq` than on samagama.in → email case mismatch somewhere. Send us the email as your login flow sees it AND as it appears in our MongoDB user record.
