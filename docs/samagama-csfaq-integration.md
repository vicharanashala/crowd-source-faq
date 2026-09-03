# Samagama ↔ CSFAQ integration

**Single source of truth for this integration.** Everything needed to build, configure, test and operate it is in this file.

| | |
|---|---|
| **Goal** | A "Need support?" button on the Samagama dashboard that drops a signed-in user into the csfaq portal, already logged in, already in their own cohort. |
| **csfaq side** | Implemented. PR [#235](https://github.com/vicharanashala/crowd-source-faq/pull/235). |
| **samagama.in side** | Not built yet. Sections 3–6 are the brief for it. |
| **Live portal** | `https://samagama.in/csfaq` · admin at `/csfaq/admin` |
| **Last verified against production** | 2026-09-03 |

---

## Contents

1. [What we are building](#1-what-we-are-building)
2. [How it works](#2-how-it-works)
3. [The endpoint](#3-the-endpoint)
4. [Building the Samagama side](#4-building-the-samagama-side)
5. [The live cohorts](#5-the-live-cohorts)
6. [Security](#6-security)
7. [Configuration](#7-configuration)
8. [Rollout and testing](#8-rollout-and-testing)
9. [Troubleshooting](#9-troubleshooting)
10. [Operating it](#10-operating-it)
11. [What was changed in csfaq](#11-what-was-changed-in-csfaq)
12. [Invariants, decisions and known gaps](#12-invariants-decisions-and-known-gaps)
13. [Open questions](#13-open-questions)

---

## 1. What we are building

The Samagama dashboard gets a **"Need support?"** button.

A signed-in user clicks it. Samagama works out who they are and which programme they belong to, hands them to the csfaq support portal, and they arrive already logged in and already inside that programme's cohort. No second login screen. Nobody enrols them by hand.

**It is one backend route and one button.** csfaq already does the hard part.

Both applications are served from `samagama.in` — csfaq is mounted at `/csfaq` — which is what makes a shared session cookie possible without any cross-domain work.

---

## 2. How it works

The exchange happens **when the button is clicked**, not at login. The token is minted at the moment it is used, and a user who never clicks the button never gets a csfaq account.

```
  ┌──────────────┐   user clicks "Need support?" on the dashboard
  │ samagama.in  │◀──────────────────────────── user
  │   backend    │
  │              │  1. identify the signed-in user (id → email, name)
  │              │  2. look up their programme tag
  └──────┬───────┘
         │ 3. POST /csfaq/api/auth/bridge/exchange
         │    { email, displayName, programSlug, programRole, ts, sig }
         │    X-Bridge-Secret-Index: 0
         ▼
  ┌──────────────┐
  │    csfaq     │  4. verify HMAC + 60s window
  │   backend    │     resolve cohort, find-or-create user,
  │              │     create/refresh ProgramEnrollment
  └──────┬───────┘
         │ 5. { token, refreshToken, user, program, redirectUrl }
         ▼
  ┌──────────────┐  6. set cookie yaksha_session = token
  │ samagama.in  │     Domain=.samagama.in
  │   backend    │  7. 302 to the returned redirectUrl
  └──────┬───────┘
         ▼
  ┌──────────────┐  8. csfaq copies the cookie into localStorage
  │ csfaq (SPA)  │  9. ?batch=<id> selects the cohort
  │              │ 10. all later calls use Authorization: Bearer
  └──────────────┘
```

Steps 4, 8, 9 and 10 already work. **Steps 1, 2, 3, 6 and 7 are the work**, and they all live in one request handler.

---

## 3. The endpoint

### `POST https://samagama.in/csfaq/api/auth/bridge/exchange`

No authentication header. **The HMAC signature is the authentication.**

**Headers**

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `X-Bridge-Secret-Index` | `0` for the primary secret. `1`+ only during a rotation. |

**Body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | yes | The user's Samagama email. Matched case-insensitively. |
| `displayName` | string | yes | 1–100 characters. Refreshed on every call. |
| `programSlug` | string | v2 only | Cohort slug, e.g. `guruvaani`. See §5. |
| `programRole` | string | v2 only | One of `student`, `ta`, `mentor`. |
| `ts` | number | yes | **Unix seconds**, not milliseconds. |
| `sig` | string | yes | Lowercase hex HMAC-SHA256. |

### 3.1 The signature

Two canonical strings. Which applies is decided by whether `programSlug` is present, so both versions can be in flight during rollout.

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

It must match **byte for byte**, including the lowercasing and trimming. Any difference is a 401.

> **`programSlug` and `programRole` are inside the signature deliberately.** Outside it, anyone able to reach this endpoint could enrol themselves into any cohort at any privilege level. There is a test named `v2: tampering with programRole invalidates the signature`.

### 3.2 Response

```json
{
  "token": "<jwt, 7 days>",
  "refreshToken": "<jwt, 7 days>",
  "program": {
    "batchId": "6a8d0f6468e06917a2efe1b9",
    "slug": "guruvaani",
    "name": "GuruVaani",
    "programRole": "student"
  },
  "redirectUrl": "https://samagama.in/csfaq/?batch=6a8d0f6468e06917a2efe1b9",
  "user": { "id": "…", "name": "…", "email": "…", "role": "user" }
}
```

For a v1 call, `program` is `null` and `redirectUrl` points at the portal root.

**Use `redirectUrl` rather than constructing the URL yourself.** It is returned so Samagama does not need to know that the portal is mounted at `/csfaq`, or that cohort selection is expressed as `?batch=`. If either changes, the button keeps working.

**The token is deliberately not in that URL.** Query strings end up in access logs, browser history and `Referer` headers.

### 3.3 Status codes

| Code | Meaning | What to do |
|---|---|---|
| `200` | Success | Set the cookie, redirect. |
| `400` | Bad `email` or `displayName`, or a `programRole` that cannot be assigned | Fix the caller. |
| `401` | Signature mismatch, or `ts` outside ±60s | **Check clock sync first.** |
| `404` | `programSlug` matches no *active* cohort | Do not retry with a different slug. Alert someone. |
| `503` | Bridge not enabled or not configured | csfaq-side configuration, see §7. |

---

## 4. Building the Samagama side

### 4.1 The route

```js
// GET /need-support
// MUST require a signed-in Samagama session — see §6.
app.get('/need-support', requireSamagamaLogin, async (req, res) => {
  const user = req.user;

  // 1. Which cohort is this person in?
  const { programSlug, programRole } = resolveProgramTag(user);

  // 2. No cohort? Decide deliberately — see §4.3.
  if (!programSlug) return res.redirect('/support/general');

  // 3. Exchange for a csfaq session.
  const bridged = await bridgeToCsfaq({
    email: user.email,
    displayName: user.name,
    programSlug,
    programRole,
  });

  // 4. Hand the session over.
  res.cookie('yaksha_session', bridged.token, {
    domain: '.samagama.in',
    path: '/',
    secure: true,
    sameSite: 'lax',
    httpOnly: false,              // required — see §6.3
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  // 5. Straight into their cohort.
  return res.redirect(bridged.redirectUrl);
});
```

The button is then just a link to `/need-support`.

### 4.2 The exchange helper

```js
const crypto = require('node:crypto');

async function bridgeToCsfaq({ email, displayName, programSlug, programRole }) {
  const ts = Math.floor(Date.now() / 1000);        // SECONDS, not milliseconds

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

  if (!res.ok) {
    throw new Error(`csfaq bridge ${res.status}: ${await res.text()}`);
  }
  return res.json();
}
```

### 4.3 Users with no programme tag

Not everyone signed in to Samagama belongs to a cohort. Decide what the button does for them rather than letting it fail. **Do not invent a slug** — csfaq answers 404 by design rather than guessing, precisely so that a wrong cohort is never silently assigned.

Three reasonable options:

1. Hide the button for those users.
2. Send them to a general support page.
3. Call the bridge **without** `programSlug` (a v1 call). They are still signed in, and `redirectUrl` points at the portal root.

---

## 5. The live cohorts

Read from production on 2026-09-03. **These are the real values.**

| Cohort name | `programSlug` | `batchId` | Default? |
|---|---|---|---|
| `GuruVaani` | **`guruvaani`** | `6a8d0f6468e06917a2efe1b9` | no |
| `Monsoonship` | **`monsoonship`** | `6a442882bec7d41fab5da7f2` | no |
| `summership` | **`summership`** | `6a2da1bd887f1e7ceb58dcbb` | **yes** |

> ⚠️ **The Guru Vaani slug is `guruvaani`, one word, no dash.** The cohort is stored as `GuruVaani` and the slug is derived from that name. `guru-vaani` returns 404. Verified:
>
> ```
> GET /csfaq/api/batches/by-slug/guruvaani    -> 200
> GET /csfaq/api/batches/by-slug/guru-vaani   -> 404
> ```

### 5.1 Reading the list at runtime

Public, no authentication:

```bash
curl https://samagama.in/csfaq/api/batches
```

**Prefer looking the slug up from this endpoint over hardcoding it.** Renaming a cohort in the csfaq admin changes its derived slug, and a hardcoded value would break silently.

### 5.2 Mapping a user to a cohort

| Who they are | `programSlug` | `programRole` |
|---|---|---|
| Internship participant, summer batch | `summership` | `student` |
| Internship participant, monsoon batch | `monsoonship` | `student` |
| Faculty on the FDP | `guruvaani` | `student` |
| Someone teaching on a programme | that programme's slug | `mentor` |

**A faculty member on Guru Vaani is a `student` of that programme.** `programRole` describes what someone does *inside the cohort*, not their job title. `mentor` is for people who are there to teach.

Only `student`, `ta` and `mentor` can be set through the bridge. `moderator` and `program_admin` are granted inside csfaq by an admin, and a login will never confer them.

`summership` is the current default cohort, which only affects users arriving with no `?batch=`. A v2 call always lands the user in the cohort you named.

---

## 6. Security

### 6.1 The route must require a signed-in session

`/need-support` creates a csfaq account from whatever email it is handed. An unauthenticated route here would let anyone create an account for any address.

### 6.2 Handling the secret

`CSFAQ_BRIDGE_SECRET` comes from your secrets store. **Never** in a commit, a chat message, a ticket, or this document. Do not log `sig` or `token` values.

### 6.3 The cookie cannot be HttpOnly — a decision to take consciously

`httpOnly` must be `false`, because the csfaq frontend reads the cookie from `document.cookie` on boot.

**This means any XSS anywhere under `samagama.in` can steal a 7-day session token.** It is a real trade-off, not an oversight, and it should be accepted deliberately rather than inherited.

Two better options if either is affordable:

- **(a)** Keep the cookie `HttpOnly` and add server-side cookie handling in csfaq. More secure, more surface area. The current design explicitly rejected this, but it can be revisited.
- **(b)** Shorten the token's life substantially and lean on the refresh token, so a stolen cookie is worth much less.

If the current design stands, reduce `maxAge` as far as the user experience tolerates.

---

## 7. Configuration

### 7.1 csfaq side — for the admin

Set these and restart the service:

| Variable | Value |
|---|---|
| `BRIDGE_ENABLED` | `true` |
| `BRIDGE_SHARED_SECRET` | 32+ random bytes |
| `PUBLIC_URL` | `https://samagama.in` — used to build `redirectUrl` |

Generate the secret:

```bash
openssl rand -hex 32
```

Share it with the Samagama team through a password manager or secrets store.

### 7.2 Samagama side

| Variable | Value |
|---|---|
| `CSFAQ_BRIDGE_SECRET` | the same value |

### 7.3 Confirming the bridge is live

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://samagama.in/csfaq/api/auth/bridge/exchange \
  -H 'Content-Type: application/json' -d '{}'
```

- **`401`** — enabled and configured. This is what you want. The empty body fails signature verification, which is correct.
- **`503`** — `BRIDGE_ENABLED` is not `true`, or `BRIDGE_SHARED_SECRET` is unset.

---

## 8. Rollout and testing

The endpoint accepts v1 and v2 at the same time, so the two systems deploy independently.

1. **csfaq** deploys PR #235. v1 behaviour is unchanged.
2. **csfaq admin** applies §7.1 and restarts.
3. **Both** confirm the cohort slug list against §5.
4. Secret exchanged out of band.
5. Confirm §7.3 returns `401`, not `503`.
6. **Samagama** implements §4, starting with one cohort.
7. End-to-end check with a real user.
8. Roll out the button to all cohorts.

### Testing checklist

1. §7.3 returns `401`, not `503`.
2. Exchange with a real email and `programSlug: "guruvaani"` returns `200`, with `redirectUrl` containing `batch=6a8d0f6468e06917a2efe1b9`.
3. Clicking the button as a Guru Vaani user lands in the portal, signed in, cohort already selected.
4. Clicking it again duplicates nothing — the exchange is idempotent.
5. A deliberately wrong slug returns `404`, and no user is created.
6. A user with no tag takes whichever path you chose in §4.3.
7. A user promoted to `ta` or `mentor` inside csfaq keeps that role after clicking the button again.

---

## 9. Troubleshooting

| Symptom | Cause |
|---|---|
| `401` on every call | **Check clock sync first.** More than 60s of NTP drift between hosts fails every request, with no other symptom. Otherwise the canonical string does not match byte for byte. |
| `404` | Wrong slug. Almost always `guru-vaani` instead of `guruvaani`. |
| `503` | csfaq config not applied, or the service was not restarted. |
| Lands but not signed in | The cookie is not reaching `/csfaq`. Check `Domain=.samagama.in`, `Path=/`, and that `httpOnly` is `false`. |
| Signed in but wrong cohort | You redirected somewhere other than `bridged.redirectUrl`. |
| Signed in, sees nothing | No enrollment. Check the response contained a `program` block. |

---

## 10. Operating it

### Rotating the shared secret

1. Append the new secret: `BRIDGE_SHARED_SECRET=old,new`.
2. Samagama switches to `X-Bridge-Secret-Index: 1`.
3. After a week with no index-0 traffic, set `BRIDGE_SHARED_SECRET=new` and switch the header back to `0`.

Try this once in staging before you need it in anger.

### Ongoing requirements

- **Clocks NTP-synced on both hosts.** This is the single most common cause of a bridge that "just stopped working".
- Both applications served from `samagama.in`. The shared cookie depends on it.
- When a cohort is renamed in the csfaq admin, its slug changes. Either update Samagama or use the runtime lookup in §5.1.

---

## 11. What was changed in csfaq

All in PR [#235](https://github.com/vicharanashala/crowd-source-faq/pull/235).

**`modules/auth/bridge-enrollment.ts`** (new) — resolves a cohort from its derived slug and upserts the `ProgramEnrollment`. Slugs are derived at read time rather than stored, so it uses the same regex-prefilter-then-exact-match approach as `getBatchBySlug` instead of loading every cohort on each call. Only `status: 'active'` cohorts resolve.

**`modules/auth/auth-bridge.controller.ts`** — v1/v2 canonical strings; program fields covered by the HMAC; cohort resolved *before* the user is created so a bad slug leaves no orphan account; `program` and `redirectUrl` added to the response.

**A pre-existing bug fixed.** The bridge signed its JWT with a `userId` claim, but `authShared.ts` reads `decoded.id` and `auth.controller.ts` signs `{ id, jti }`. Every token the bridge had ever issued resolved to `User.findById(undefined)`, so every authenticated request returned *"Not authorized. User not found."* Found by running the flow end to end. `jti` was also added so logout and revocation work for bridged sessions.

**`apps/frontend/src/auth/cookieBridge.ts`** — comment only. The previous version contradicted `bootstrap/app.ts` and contained the original author reasoning aloud mid-file.

**`__tests__/auth-bridge.test.ts`** (new) — 25 tests. The bridge previously had none.

---

## 12. Invariants, decisions and known gaps

### Invariants — each has a test

1. **The bridge never changes a global `User.role`.** An admin signing in through Samagama is still an admin afterwards.
2. **The bridge never downgrades a `ProgramEnrollment`.** If csfaq promoted someone to `ta` or `mentor`, a routine login must not put them back to `student`. Upgrades are allowed; downgrades are not.
3. **An unknown cohort fails with 404**, never a default or nearest match. A learner in the wrong cohort is a problem nobody notices.
4. **Program fields are covered by the signature.**
5. **A user may be in several cohorts.** Enrolling in one never deactivates another.

### Deliberate decisions

**`enrollmentMode` is bypassed.** It governs *self*-enrollment from the public portal. A bridge call is an assertion from the upstream system of record, closer to an admin enrolling someone.

**`maxEnrollment` is not enforced here.** Samagama has already decided the person is on the programme; refusing their login over a csfaq-side cap would break access for a reason the user cannot act on.

**`enrolledBy` stays `null`.** It records the admin who enrolled someone, and this was not an admin action.

### Known gaps

- **No replay cache.** A captured request can be replayed inside its 60-second window. The operation is idempotent, so the impact is limited to refreshing a token the caller already had.
- **No rate limit on the endpoint.** It is unauthenticated. The HMAC makes forgery impractical, but an attacker can still force signature computations. `express-rate-limit` is already a dependency.
- **The slug regex prefilter** will not match every theoretically possible name whose slug collides (`x-y` vs `X Y`). It holds for the names in use. Inherited from `getBatchBySlug`.

---

## 13. Open questions

1. **Is `BRIDGE_ENABLED` currently `true` in production?** Not yet confirmed. §7.3 answers it in one command.
2. **Should the `HttpOnly: false` trade-off stand?** See §6.3.
3. **What happens when a programme ends?** Deactivate the enrollment, or keep it for history? Currently nothing changes it.
4. **Should Anveshan use this same bridge?** Its card on samagama.in says *"Separate login — not yet part of Samagama SSO"* — the identical problem. If so, this stops being a one-off and becomes the standard way products join Samagama.

---

## Known issue, not part of this integration

A Guru Vaani user arriving through this flow currently hits a full-screen csfaq onboarding gate titled **"Welcome to Summership"**, asking them to confirm when their *Internship* ends (`internshipEndDate`, `user.model.ts`).

The heading names the wrong programme and the question does not apply to an FDP participant. It is pre-existing and unrelated to this work, but it will be the first thing a Guru Vaani user sees. Being tracked separately — worth knowing before demoing.
