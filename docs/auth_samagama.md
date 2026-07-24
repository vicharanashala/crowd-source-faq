# Samagama.in → /csfaq SSO Bridge (Setup Guide)

This document is for the **samagama.in team**. It describes how to integrate samagama.in's auth with the Yaksha FAQ Portal at `samagama.in/csfaq`.

After this integration is set up, any user who logs into samagama.in will **automatically be signed in to /csfaq** — no extra clicks, no redirects. The user simply navigates to `samagama.in/csfaq` and they're already authenticated.

---

## How it works (high level)

1. User logs into samagama.in (your auth, your UI — nothing changes here).
2. Immediately after successful login, **samagama.in's backend POSTs a signed request to our `/api/auth/bridge/exchange` endpoint**. The request carries the user's email + display name + HMAC signature.
3. We verify the signature, find-or-create a local user in our DB, and return our own 7-day JWT.
4. **Samagama.in stores the JWT in a cookie named `yaksha_session`, scoped to `.samagama.in`** (so both `samagama.in` and `samagama.in/csfaq` see it).
5. User goes on with their day in samagama.in — no interruption.
6. Later, when the user types `samagama.in/csfaq` in their browser, the cookie travels automatically. Our backend verifies the JWT, populates the session, and they're logged in.

The user does **not** see anything special happen. No redirects, no double-login. One login → both apps authenticated.

---

## What samagama.in needs to change

Exactly **two things**:

### 1. Server-to-server call after successful login

After your auth handler verifies credentials and creates/updates the session, make this POST request to our backend:

```
POST https://samagama.in/csfaq/api/auth/bridge/exchange
Content-Type: application/json
X-Bridge-Secret-Index: 0

{
  "email": "alice@example.com",
  "displayName": "Alice Smith",
  "ts": 1717420000,
  "sig": "a3f8...hex...e91b"
}
```

### 2. Store the response in a cookie

The response looks like this:

```json
{
  "token": "eyJhbGciOi...JWT...",
  "refreshToken": "eyJhbGciOi...JWT...",
  "user": {
    "id": "6a2d...",
    "name": "Alice Smith",
    "email": "alice@example.com",
    "role": "user",
    "..."
  }
}
```

Store `token` in a cookie named `yaksha_session` with these attributes:

```
Set-Cookie: yaksha_session=<token>; Domain=.samagama.in; Path=/; Secure; SameSite=Lax; Max-Age=604800
```

`Max-Age=604800` matches the 7-day JWT lifetime — without it, the cookie becomes a session cookie and the user is logged out when they close their browser.

**Critical:** the cookie must be readable by JavaScript on the `/csfaq` page (so our frontend can mirror it into localStorage). Therefore:

  * **Do NOT set `HttpOnly`** (our frontend needs `document.cookie` access).
  * DO set `Secure` (HTTPS only).
  * DO set `SameSite=Lax` (so the cookie is sent on top-level navigation from samagama.in to /csfaq).
  * `Domain=.samagama.in` (leading dot — so the cookie is shared between samagama.in and samagama.in/csfaq).
  * `Path=/`.

---

## How to compute the signature

The signature is **HMAC-SHA256** over a canonical string, using the shared secret we'll provide you.

### Canonical string

```
${ts}.${email.toLowerCase()}.${displayName.trim()}
```

  * `ts` — current Unix timestamp in **seconds** (not milliseconds).
  * `email` — the user's email, lowercased and trimmed.
  * `displayName` — the user's display name, trimmed.

### Pseudocode

```js
const crypto = require('node:crypto');

function signBridgeRequest(email, displayName, secret) {
  const ts = Math.floor(Date.now() / 1000);
  const canonical = `${ts}.${email.toLowerCase().trim()}.${displayName.trim()}`;
  const sig = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
  return { ts, sig };
}

// Usage:
const { ts, sig } = signBridgeRequest('alice@example.com', 'Alice Smith', BRIDGE_SHARED_SECRET);
const res = await fetch('https://samagama.in/csfaq/api/auth/bridge/exchange', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Bridge-Secret-Index': '0',
  },
  body: JSON.stringify({
    email: 'alice@example.com',
    displayName: 'Alice Smith',
    ts,
    sig,
  }),
});
const { token } = await res.json();
// Set the cookie via Set-Cookie header (Node http.ServerResponse):
res.setHeader('Set-Cookie', `yaksha_session=${token}; Domain=.samagama.in; Path=/; Secure; SameSite=Lax; Max-Age=604800`);
```

### Optional header: secret index

If you support **multiple secrets during rotation**, set the `X-Bridge-Secret-Index` header on the POST:

```
X-Bridge-Secret-Index: 0
```

`0` (default if header omitted) is the current primary secret. `1`, `2`, etc. are old rotated secrets we keep around for a grace period.

For the initial rollout, **don't set this header** — we use only one secret.

---

## Security notes

  * **Replay protection**: the bridge endpoint requires `ts` to be within **±60 seconds** of our server clock at the moment the POST arrives. Generate `ts` close to the request send time — don't precompute and cache it.
  * **Constant-time comparison**: our backend uses timing-safe HMAC comparison; you don't need to do anything special on your side.
  * **HTTPS only**: the bridge must be called over HTTPS. Our backend sits behind your reverse proxy at `/csfaq/api/*` — your TLS termination (nginx, Cloudflare, AWS ALB, etc.) is what enforces this, not the Node app. Make sure the reverse proxy rejects plaintext HTTP on `/csfaq/api/auth/bridge/exchange`.
  * **User privacy**: we don't share any data with samagama.in beyond the JWT we return. We log the bridge login (email + timestamp) for audit purposes.
  * **Secret and JWT are separate**: `BRIDGE_SHARED_SECRET` (HMAC) and `JWT_SECRET` (JWT signing) are unrelated. Rotating one does not invalidate tokens signed with the other. See "Secret rotation" below.

---

## Error handling

| Status | Body | What to do |
|--------|------|------------|
| 200 | `{ token, refreshToken, user }` | Success. Set the cookie. |
| 400 | `{ message: "email must be a valid email address" }` | The email you sent is malformed. Fix your code. |
| 400 | `{ message: "displayName must be 1-100 chars" }` | The display name is missing or too long. Fix your code. |
| 401 | `{ message: "Invalid bridge signature" }` | HMAC signature didn't match. Check: (1) the secret matches ours, (2) the canonical string format is exact, (3) the timestamp is fresh. |
| 401 | `{ message: "Bridge token expired (timestamp outside 60s window)" }` | Your server's clock is too far off from ours, OR you're sending an old request. Use NTP. |
| 503 | `{ message: "Bridge is disabled" }` | We turned the bridge off. Check in with us. |
| 503 | `{ message: "Bridge is not configured (BRIDGE_SHARED_SECRET unset)" }` | Our backend is misconfigured. Check in with us. |

**DO NOT** show raw error messages to the end user. If the bridge call fails, just continue with normal samagama.in login (the user can still use samagama.in; they just won't be auto-signed-in to /csfaq).

---

## Local development

If you want to test the integration on localhost before deploying:

  1. Update your local `samagama.in` config to POST to `http://localhost:6767/csfaq/api/auth/bridge/exchange` (or your local port).
  2. Use a separate `BRIDGE_SHARED_SECRET` value for local dev. The contract is the same as production — the HMAC must match exactly. There's no dev-mode bypass.
  3. The cookie `Domain=.samagama.in` won't work on `localhost` (browsers reject that). For local testing, just **omit `Domain=`** — the cookie will be scoped to `localhost` and our `/csfaq` local frontend will still read it.

---

## Secret rotation procedure

When you need to rotate `BRIDGE_SHARED_SECRET` (recommended every 90 days, or immediately if compromised):

1. Generate a new 32-byte hex secret: `openssl rand -hex 32`
2. **Both teams** update their env vars to support both old and new (new first = index 0):
   ```
   BRIDGE_SHARED_SECRET=<new_secret>,<old_secret>
   ```
3. **All new bridge requests** must use the new secret (index 0). Send `X-Bridge-Secret-Index: 0` on the POST.
4. **Old bridge requests still arrive** during the rotation window — our backend accepts index 1 as a fallback. Once your side has fully cut over to index 0 and the rotation window has passed, you can drop index 1.
5. **JWTs in existing cookies are unaffected.** Those JWTs are signed with `JWT_SECRET`, not with `BRIDGE_SHARED_SECRET`. They keep working until their own `exp` (7 days), regardless of HMAC secret rotation.
6. After **7 days** (one full JWT lifetime), the old HMAC secret can be removed from `BRIDGE_SHARED_SECRET`.

Our backend supports this rotation out of the box — no code changes needed on our side.

---

## Sample implementation (Node.js / Express)

```js
// After successful samagama.in login, BEFORE redirecting the user:
async function bridgeToCsfaq(user) {
  const secret = process.env.BRIDGE_SHARED_SECRET;
  if (!secret) {
    console.warn('BRIDGE_SHARED_SECRET not set — skipping csfaq bridge');
    return;
  }
  const ts = Math.floor(Date.now() / 1000);
  const canonical = `${ts}.${user.email.toLowerCase().trim()}.${user.name.trim()}`;
  const sig = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
  
  try {
    const res = await fetch('https://samagama.in/csfaq/api/auth/bridge/exchange', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Secret-Index': '0',
      },
      body: JSON.stringify({ email: user.email, displayName: user.name, ts, sig }),
      // 5-second timeout — don't block samagama.in's login if our backend is slow
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error(`csfaq bridge failed: ${res.status}`);
      return;
    }
    const { token } = await res.json();
    // Set the cookie on samagama.in's response — use res.setHeader (Node http.ServerResponse):
    res.setHeader('Set-Cookie', `yaksha_session=${token}; Domain=.samagama.in; Path=/; Secure; SameSite=Lax; Max-Age=604800`);
  } catch (err) {
    console.error('csfaq bridge error:', err);
    // Don't block login — /csfaq will just not be auto-signed-in for this user
  }
}
```

Call `bridgeToCsfaq(user)` from your existing login handler, after you've created/updated the session.

---

## FAQ

**Q: What if our user doesn't have an email?**
A: The bridge requires email. If your auth doesn't have email, generate one (e.g. `noreply+userId@samagama.in`).

**Q: What if display name is empty?**
A: Reject the request. We need a display name to create the local user.

**Q: What if the email changes in samagama.in?**
A: Currently we don't sync email changes. Same email = same local user. If you need email-change sync, let us know — it's a 5-line addition.

**Q: What if the user logs out of samagama.in?**
A: The /csfaq cookie remains until expiry (7 days). The user can manually log out of /csfaq via the existing /csfaq logout button (clears local state only — samagama.in's session is untouched).

**Q: What if /csfaq's backend is down?**
A: The bridge call will fail with a network error. Just log it and continue with samagama.in's normal login. The user will have to log into /csfaq separately (with email/password) until our backend is back up.

**Q: Does this replace samagama.in's existing session/cookie?**
A: No. Samagama.in keeps its own session exactly as before. We're just adding a parallel cookie that's visible to /csfaq.

---

## Contact

If anything is unclear, ping us. We're happy to jump on a call to walk through the integration.

The shared secret will be delivered via [your-secret-sharing-channel] once both teams confirm readiness.