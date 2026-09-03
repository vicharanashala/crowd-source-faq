# Samagama → CSFAQ integration

**Audience:** the samagama.in team (sections 1–5) and csfaq maintainers (sections 6–10).
**Status:** csfaq side implemented in this PR. samagama.in side not yet built.
**Live at:** `https://samagama.in/csfaq` · admin at `/csfaq/admin`

---

## 1. What we are building, in one paragraph

A user signs in on samagama.in. They open `samagama.in/csfaq`. They are already logged in, already a member of the right cohort, and land directly in it. They never see a second login screen, and nobody has to enrol them by hand.

Both applications sit on the same domain, which is what makes a shared cookie possible at all.

---

## 2. The shape of the integration

```
  ┌──────────────┐   1. user signs in
  │ samagama.in  │◀──────────────────────────── user
  │   backend    │
  └──────┬───────┘
         │ 2. POST /csfaq/api/auth/bridge/exchange
         │    { email, displayName, programSlug, programRole, ts, sig }
         │    X-Bridge-Secret-Index: 0
         ▼
  ┌──────────────┐
  │    csfaq     │  3. verify HMAC + 60s window
  │   backend    │     resolve cohort, find-or-create user,
  │              │     create/refresh ProgramEnrollment
  └──────┬───────┘
         │ 4. { token, refreshToken, user, program:{ batchId, … } }
         ▼
  ┌──────────────┐  5. set cookie yaksha_session = token
  │ samagama.in  │     Domain=.samagama.in
  │   backend    │  6. redirect to /csfaq/?batch=<batchId>
  └──────┬───────┘
         ▼
  ┌──────────────┐  7. cookieBridge.ts copies cookie → localStorage
  │ csfaq (SPA)  │  8. ?batch=<id> selects the cohort
  │              │  9. all later calls use Authorization: Bearer
  └──────────────┘
```

Steps 3, 7, 8 and 9 already work. Steps 2, 5 and 6 are what samagama.in must build.

---

## 3. The endpoint

### `POST /csfaq/api/auth/bridge/exchange`

No authentication header. The HMAC signature *is* the authentication.

**Headers**

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `X-Bridge-Secret-Index` | `0` for the primary secret. `1`+ only during a rotation. |

**Body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | yes | The user's samagama.in email. Matched case-insensitively. |
| `displayName` | string | yes | 1–100 characters. Kept in sync on every login. |
| `programSlug` | string | v2 only | Derived slug of the cohort, e.g. `guru-vaani`. |
| `programRole` | string | v2 only | One of `student`, `ta`, `mentor`. |
| `ts` | number | yes | **Unix seconds**, not milliseconds. |
| `sig` | string | yes | Lowercase hex HMAC-SHA256. |

### 3.1 Signature

There are two canonical strings. Which one applies is decided by whether `programSlug` is present, so both versions can be in flight during rollout.

**v1** — no cohort:
```
`${ts}.${email.toLowerCase().trim()}.${displayName.trim()}`
```

**v2** — with cohort:
```
`${ts}.${email.toLowerCase().trim()}.${displayName.trim()}.${programSlug.toLowerCase().trim()}.${programRole.trim()}`
```

Then:
```js
const sig = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
```

**`programSlug` and `programRole` are inside the signature deliberately.** If they were outside it, anyone who could reach this endpoint could enrol themselves into any cohort at any privilege level. There is a test for exactly this (`v2: tampering with programRole invalidates the signature`).

### 3.2 Reference implementation for samagama.in

```js
const crypto = require('node:crypto');

async function bridgeToCsfaq({ email, displayName, programSlug, programRole }) {
  const ts = Math.floor(Date.now() / 1000);          // seconds, not ms
  const canonical =
    `${ts}.${email.toLowerCase().trim()}.${displayName.trim()}` +
    (programSlug ? `.${programSlug.toLowerCase().trim()}.${programRole.trim()}` : '');

  const sig = crypto
    .createHmac('sha256', process.env.CSFAQ_BRIDGE_SECRET)
    .update(canonical)
    .digest('hex');

  const res = await fetch('https://samagama.in/csfaq/api/auth/bridge/exchange', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Bridge-Secret-Index': '0',
    },
    body: JSON.stringify({ email, displayName, programSlug, programRole, ts, sig }),
  });

  if (!res.ok) throw new Error(`csfaq bridge failed: ${res.status} ${await res.text()}`);
  return res.json();   // { token, refreshToken, user, program }
}
```

### 3.3 Response

```json
{
  "token": "<jwt, 7 days>",
  "refreshToken": "<jwt, 7 days>",
  "program": {
    "batchId": "665f1c2a9b1e4a0012a3b4c5",
    "slug": "guru-vaani",
    "name": "Guru Vaani",
    "programRole": "student"
  },
  "user": { "id": "…", "name": "…", "email": "…", "role": "user" }
}
```

`program` is `null` for a v1 call.

### 3.4 Status codes

| Code | Meaning | What to do |
|---|---|---|
| 200 | Success | Set the cookie, redirect. |
| 400 | Bad `email`, `displayName`, or a `programRole` we do not allow | Fix the caller. |
| 401 | Signature mismatch, or `ts` outside ±60s | **Check clock sync first** — this is the most common cause. |
| 404 | `programSlug` matches no *active* cohort | Do not retry with a different slug. Alert someone. |
| 503 | `BRIDGE_ENABLED` is not `true`, or no secret configured | csfaq-side configuration. |

---

## 4. What samagama.in must do

### 4.1 At login, server side

1. Build the canonical string and HMAC it (§3.1).
2. `POST` to the endpoint.
3. Take `token` from the response and set it as a cookie:

```
Name:     yaksha_session
Value:    <token>
Domain:   .samagama.in
Path:     /
Secure:   true
SameSite: Lax
HttpOnly: false        ← required, see §4.3
Max-Age:  604800       (7 days, matching the JWT)
```

4. Redirect the user to `/csfaq/?batch=<program.batchId>`.

Step 4 is what makes the cohort routing work. csfaq's `ProgramContext` treats `?batch=` as the **highest-priority** signal, above any stored preference, so the user lands in the right cohort even if they last used a different one.

### 4.2 Choosing the slug and role

Samagama decides both. csfaq trusts them because they are signed.

| Who they are | `programSlug` | `programRole` |
|---|---|---|
| Internship participant | `summership` or `monsoonship` | `student` |
| Faculty on the FDP | `guru-vaani` | `student` |
| Someone teaching on a programme | that programme's slug | `mentor` |

Note that a faculty member on Guru Vaani is a **`student`** of that programme: `programRole` describes what they do *inside the cohort*, not their job title. `mentor` is for people who are there to teach.

`moderator` and `program_admin` **cannot** be assigned over the bridge. They are granted inside csfaq by an admin, and a login must never confer them.

Slugs are derived from the cohort's name in csfaq by lowercasing and replacing runs of non-alphanumerics with dashes. `Guru Vaani` → `guru-vaani`. **Confirm the exact list with a csfaq admin before going live** — a mismatch produces a 404, not a silent fallback, which is intentional.

### 4.3 ⚠️ The cookie cannot be HttpOnly

`cookieBridge.ts` reads the cookie from `document.cookie`, which requires `HttpOnly: false`. **Any XSS anywhere under `samagama.in` can therefore steal a 7-day JWT.**

This is a deliberate trade-off, recorded here so it is not inherited by accident. Two better options, if either is affordable:

- **(a)** Keep the cookie `HttpOnly` and add backend middleware in csfaq that reads it server-side. More secure, more surface area. The current design explicitly rejected this (see `bootstrap/app.ts`), but the decision can be revisited.
- **(b)** Shorten the bridged JWT's lifetime to minutes and lean on the refresh token, so a stolen cookie is worth much less.

If the current design stands, shorten `Max-Age` as far as the user experience tolerates.

### 4.4 Operational requirements

- **Clocks must be NTP-synced on both hosts.** A skew above 60 seconds silently fails every login with a 401 and no other symptom.
- The shared secret must be at least 32 random bytes, shared out of band. Never in a repository, chat message, or ticket.
- Do not log `sig` or `token` values.

---

## 5. Rollout

The endpoint accepts v1 and v2 simultaneously, so the two systems can deploy independently.

1. **csfaq** deploys this PR. v1 behaviour is unchanged.
2. **Both** agree the cohort slug list.
3. csfaq admin confirms each cohort exists with `status: 'active'`.
4. Secrets exchanged; `BRIDGE_ENABLED=true` and `BRIDGE_SHARED_SECRET` set.
5. **samagama.in** implements the caller, starting with v1 against a staging cohort.
6. samagama.in switches to v2 with `programSlug` + `programRole`.
7. Verify: a fresh user signs in on samagama.in and lands inside the right cohort.
8. Once no v1 traffic remains, v1 can be retired (optional — it costs nothing to keep).

### Rotating the shared secret

1. Append the new secret: `BRIDGE_SHARED_SECRET=old,new`.
2. samagama.in switches to `X-Bridge-Secret-Index: 1`.
3. After a week with no index-0 traffic, set `BRIDGE_SHARED_SECRET=new` and switch the header back to `0`.

Try this once in staging before you need it.

---

## 6. What this PR changed in csfaq

### `modules/auth/bridge-enrollment.ts` (new)

- `resolveActiveBatchBySlug(slug)` — slugs are **derived at read time**, not stored (see `batch.model.ts`), so this uses the same regex-prefilter-then-exact-match approach as `getBatchBySlug` rather than loading every cohort on each login. Only `status: 'active'` cohorts resolve.
- `syncBridgeEnrollment(userId, batch, role)` — idempotent upsert of the `ProgramEnrollment`, with the no-downgrade rule below.
- `BRIDGE_ASSIGNABLE_ROLES` — `student`, `ta`, `mentor`.

### `modules/auth/auth-bridge.controller.ts` (changed)

- v1/v2 canonical strings; `programSlug` and `programRole` are covered by the HMAC.
- The cohort is resolved **before** the user is created, so a bad slug does not leave an orphan account behind.
- Response gains `program`.
- The header comment now describes the real flow.

### `apps/frontend/src/auth/cookieBridge.ts` (comment only)

The previous comment contradicted `bootstrap/app.ts` and contained the original author reasoning aloud and correcting themselves mid-file. Replaced with the actual flow. No behaviour change.

### `modules/auth/__tests__/auth-bridge.test.ts` (new)

22 tests. The bridge previously had none.

---

## 7. Invariants this must never break

These are the rules a future change is most likely to violate by accident. Each has a test.

1. **The bridge never changes a global `User.role`.** If an admin signs in through samagama.in they must still be an admin afterwards.
2. **The bridge never downgrades a `ProgramEnrollment`.** If csfaq promoted someone to `ta` or `mentor`, a routine login must not silently return them to `student`. Upgrades are allowed; downgrades are not.
3. **An unknown cohort fails loudly.** No default, no nearest match. Putting a learner in the wrong cohort is worse than a failed login because nobody notices.
4. **Programme fields are inside the signature.** Moving them out would let a caller pick their own cohort and privilege level.
5. **A user may be in several cohorts.** Enrolling in one must not deactivate another.

---

## 8. Deliberate decisions, with reasons

**`enrollmentMode` is bypassed.** That flag governs *self*-enrollment from the public portal. A bridge call is an assertion from the upstream system of record, closer to an admin enrolling someone than to a user joining on their own. An `invite_only` cohort still accepts bridged users.

**`maxEnrollment` is not enforced on the bridge path.** Samagama has already decided this person is on the programme. Refusing their login at the door because of a csfaq-side cap would break sign-in for a reason the user can do nothing about. If a cap needs enforcing, it belongs in Samagama's enrolment flow, not in login.

**`enrolledBy` is left `null`.** It records the admin who enrolled someone. This was not an admin action, and inventing a sentinel user would pollute the audit trail.

**Only `status: 'active'` cohorts resolve.** Enrolling someone into a draft or archived programme would give them a login into a cohort that is not running.

---

## 9. Known gaps

- **No replay cache.** A captured request can be replayed within its 60-second window. Because the operation is idempotent the impact is limited to refreshing a token the caller already had. A nonce store would close it; it did not seem worth the added state.
- **No rate limit on the endpoint.** It is unauthenticated. The HMAC makes forgery impractical, but an attacker can still force signature computations. Worth adding `express-rate-limit`, which is already a dependency.
- **The regex prefilter in slug resolution** will not match every theoretically possible name whose slug collides (`x-y` vs `X Y`). It holds for the names in use. Inherited from `getBatchBySlug`.
- **`BRIDGE_ENABLED` in production is unverified.** Nobody has confirmed whether the flag is currently on.

---

## 10. Open questions

1. **What are the exact cohort names in production?** `summership`, `monsoonship` and `guru-vaani` are used throughout this document as expected values, but they must be confirmed against the real `Batch` records.
2. **What happens when a programme ends?** Should the enrollment be deactivated, or kept for history? Currently nothing changes it.
3. **Should Anveshan use this same bridge?** Its card on samagama.in says *"Separate login — not yet part of Samagama SSO"* — the identical problem. If so, this stops being a one-off and becomes the standard way products join Samagama.
4. **Should `HttpOnly: false` stand?** See §4.3.
