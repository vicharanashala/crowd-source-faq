# Yaksha FAQ Portal — Codebase Audit

Senior SDE review of the Yaksha FAQ Portal (crowd-source-faq / crowd-source-faq)
covering the backend API, frontend, database, and operations.

Audited at commit range: 5b1da8d..8e8e93d (HEAD).
Last commit: 8e8e93d "feat(scripts): tag all output [ALERT]/[INFO]/[OK]/[WARN]".

## Executive summary

The codebase is in good shape overall — naming is consistent, controllers
are reasonably sized, logging has been overhauled in v1.67. The major
risk areas are:

- **3 critical race conditions** in reputation/points flows (lost writes
  under concurrent requests, duplicate badges).
- **1 critical production config gap** — env validation is skipped in
  production, so a misconfigured prod deploy will boot and fail at
  runtime instead of refusing to start.
- **1 high-severity secret-overload** — JWT_SECRET is reused as the
  master key for PBKDF2 + HMAC, so a single leak compromises multiple
  subsystems.
- **Frontend lacks a single Error Boundary** — a render error in any
  page white-screens the app.
- The deprecated `pages/deprecated/HomePage.tsx` is still in the
  bundle (23k bytes of dead code).

Total findings: 3 critical, 4 high, 7 medium, 6 low/nit.

## Severity legend

| Severity | Meaning | Action SLA |
|----------|---------|------------|
| CRITICAL | Data corruption, auth bypass, prod outage, security leak | Same day |
| HIGH | Race conditions, secret overload, missing validation | Within a week |
| MEDIUM | Performance, observability, error handling | Within a sprint |
| LOW / NIT | Style, dead code, minor DX | When touched |

---

## CRITICAL

### C1. Race condition: `commentVoteController.toggleCommentUpvote` loses concurrent point increments

**File:** `backend/controllers/commentVoteController.ts:81-95`

```ts
const updatedCommentAuthor = await User.findByIdAndUpdate(
  commentAuthorId,
  { $inc: { points: 5, reputation: 5 } },
  { new: true },
);
if (updatedCommentAuthor) {
  updatedCommentAuthor.tier = calculateTier(updatedCommentAuthor.points);
  await updatedCommentAuthor.save();   // <-- race: overwrites with stale in-memory state
  ...
}
```

`findByIdAndUpdate` atomically increments `points` in MongoDB. The
returned document has the post-increment value. Then we mutate
`tier` in memory and call `save()`. But `save()` re-writes the
in-memory doc, which was loaded before any concurrent request's
`$inc` took effect. The concurrent `+5` is overwritten with the
stale snapshot. Net effect: a comment that receives 10 upvotes from
10 simultaneous users only awards 5 points (the first winner's
$inc sticks; the rest get clobbered by the trailing `save()`).

**Fix:** Don't `save()`. Use a single atomic update with a tier
recalculation pipeline, or split: `findByIdAndUpdate({ $inc })` for
points, then a separate `findByIdAndUpdate({ $set: { tier } })` after
re-reading points.

### C2. Race condition: badge award + check-then-act duplicates

**Files:**
- `backend/controllers/reputationController.ts:21-25` (`autoAwardBadges`)
- `backend/controllers/reputationController.ts:111-115` (`awardBadge`)

```ts
// autoAwardBadges
const already = (user[list] as any[]).some(b => b.badgeId.toString() === badge._id.toString());
if (!already) {
  (user[list] as any[]).push({ badgeId: badge._id.toString(), ... });
}
await user.save();
```

Two concurrent requests for the same user can both pass the `some()`
check, both push, and both save. Net effect: a user has the same
badge listed twice in `positiveBadges` / `negativeBadges`, which
breaks the badge uniqueness assumption the rest of the app relies on
for display and tier calculations.

**Fix:** Replace with an atomic `$addToSet` on a normalized subdoc
array, or add a unique compound index on
`{ userId, 'positiveBadges.badgeId' }` and use `updateOne` with
upsert semantics that the index will reject duplicates on.

### C3. Env validation is skipped in production

**File:** `backend/server.ts:329`

```ts
if (process.env.NODE_ENV !== 'production') {
  validateEnv();
  app.listen(PORT, async () => { ... });
}
```

`validateEnv()` is the only place that fails-fast on missing
`MONGODB_URI`, weak `JWT_SECRET` (<32 chars), missing
`ZOOM_WEBHOOK_SECRET_TOKEN` in non-dev, etc. In production, the
server silently boots with whatever env it was given. A misconfigured
prod deploy with `JWT_SECRET=changeme` will sign tokens with a guessable
secret.

**Fix:** Always call `validateEnv()`. Gate the `app.listen` (port
binding) on `NODE_ENV !== 'production'`, not the validation. i.e.

```ts
validateEnv();   // always
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, ...);
}
// else: serverless / Vercel handler only — no listen
```

---

## HIGH

### H1. `JWT_SECRET` is reused as the master key for multiple subsystems

**Files:**
- `backend/middleware/authShared.ts:39` — JWT HMAC signing
- `backend/utils/auth/crypto.ts:10` — PBKDF2 input for TOTP secret encryption
- `backend/utils/auth/rateLimit.ts:26` — JWT verification
- `backend/utils/zoom/zoomOAuth.ts:98` — HMAC verification of Zoom webhooks

A single secret derives JWT signing, TOTP AES key, and Zoom webhook
HMAC. One leak = all four subsystems compromised. This also makes key
rotation painful (rotating JWT_SECRET invalidates Zoom webhooks mid-flight).

**Fix:** Split into 4 env vars: `JWT_SECRET` (signing), `TOTP_MASTER_KEY`
(32 bytes), `RATE_LIMIT_SECRET`, `ZOOM_WEBHOOK_SECRET_TOKEN` (already
exists). Validate each independently in `validateEnv()`.

### H2. Frontend has no Error Boundary

**File:** `frontend/src/App.tsx` and per-page components

A render-time exception in any page (e.g., a malformed response that
violates a Zod schema in the client) will unmount the entire React
tree and leave the user with a blank page. There's no recovery
mechanism — only a hard refresh works.

**Fix:** Add a top-level `<ErrorBoundary>` inside `<AdminRoute>` and
`<AccountRoute>`. Each admin page should also wrap its content in a
local ErrorBoundary so one broken page doesn't take down the whole
admin shell. Pattern: log the error via the new `securityLog` /
`httpLog`, show a "Something went wrong — refresh" panel, and offer
a "Report issue" button that POSTs the stack to `/api/log`.

### H3. `User.findByIdAndUpdate` + `save()` anti-pattern is widespread

**Files (representative):**
- `backend/controllers/commentVoteController.ts:88`
- `backend/controllers/commentVoteController.ts:140, 145`
- `backend/controllers/reputationController.ts:29, 59, 115, 312`
- `backend/controllers/bookmarkController.ts:52`
- `backend/controllers/postLifecycleController.ts` (vote tally updates)

Same anti-pattern as C1: atomic `$inc` or `$set` followed by a full
document `save()`. Any in-memory mutation that piggybacks on the
save is race-prone. Even when no field is mutated in memory, the
`save()` is a redundant write (and a long one for User documents with
embedded `positiveBadges`).

**Fix:** Audit each save() site. If no in-memory mutation is needed,
drop the save() entirely. If tier/badge lists need updating, do a
second atomic update. Or use `findOneAndUpdate` with a pipeline:

```ts
await User.findOneAndUpdate(
  { _id: userId },
  [
    { $set: { points: { $add: ['$points', 5] } } },
    { $set: { tier: { $switch: { branches: [...] } } } },
  ],
  { new: true },
);
```

### H4. Deprecated `HomePage.tsx` is still in the bundle

**File:** `frontend/src/pages/deprecated/HomePage.tsx` (23,545 bytes)

Lives in the `pages/deprecated/` directory but is still imported
through the route tree. Tree-shaking won't drop it because the
`lazy(() => import(...))` references it. Adds ~25kB to the prod
bundle for no reason. Risk: someone un-deprecates it by accident.

**Fix:** Remove the file, remove its import, grep for the route
path, rebuild. If it's needed for fallback, move to
`pages/_archive/` and add a build-time check that excludes `_*` paths.

---

## MEDIUM

### M1. `getUserActivityChart` uses search count as a user-count proxy

**File:** `backend/controllers/adminController.ts:21-26` (and
inline comment at line 38)

The aggregator counts `searches` and labels it as `userCount`. The
code comment acknowledges this is a proxy. The admin dashboard's
"User Activity" chart is therefore misleading — it shows search
volume, not unique users. Not data-incorrect, just mislabeled.

**Fix:** Add a `userId` field to `SearchLog` (denormalized from the
request JWT or session). Migrate historical records if needed. Then
`{ $addToSet: '$userId' }` in the aggregation gives a true unique count.

### M2. Discord webhook has no retry, no rate-limit handling

**File:** `backend/utils/http/logger.ts:160-180` (notifyDiscord)

A failed Discord POST (network blip, 429 from Discord) is logged and
discarded. Subsequent ALERTs don't retry the failed one. Discord's
webhook rate limit is 30 req/min — burst of alerts (e.g., DB
disconnect cascade) can silently drop events.

**Fix:** Add a 5-element in-memory queue + `setTimeout` retry with
exponential backoff. Or write alerts to a `pendingDiscordAlerts`
Mongo collection and a separate worker drains it. The latter survives
restarts.

### M3. `requestLogger.ts` not using named `httpLog`

**File:** `backend/utils/http/requestLogger.ts:71, 98, 101, 104`

After the v1.67 logger overhaul, `requestLogger` still uses the bare
`logger` object instead of the new `httpLog`. Its log lines don't
carry the `[http]` category tag, breaking the "grep `[http]`" filter.

**Fix:** Replace `logger.info/warn/error(...)` with
`httpLog.info/warn/error(...)`. One-line change per call site.

### M4. Deprecated emoji constants in `requestLogger.statusColor`

**File:** `backend/utils/http/requestLogger.ts:48-54`

`statusColor()` returns emoji strings (red/orange/yellow/green
circles). The function is defined but never called — the file's
inline comment at line 94 says "no emojis — terminal colors only".
Dead code that contradicts the policy. If someone calls it later
the emojis will leak into the scrollback.

**Fix:** Delete the function.

### M5. `process.env` reads inside scheduled-job hot paths

**File:** `backend/controllers/escalationController.ts:30, 35`,
`autoAnswerController.ts`, `faqAuditController.ts`

The cron bodies read `process.env.UNANSWERED_ESCALATION_DAYS` etc.
at the top of `setInterval`. This is correct (env is read once at
startup) but the constant is `parseInt`d once — if you change the
env in dev, the cron doesn't pick it up. Operators expect env
hot-reload; this breaks that expectation silently.

**Fix:** Re-read `process.env` inside the cron body (cheap), or document
that env changes need a restart in CONTRIBUTING.md.

### M6. `requestLogger` captures and logs request body

**File:** `backend/utils/http/requestLogger.ts:71-80`

The arrival log includes `query: req.query` (entire querystring).
Combined with the auth header (which IS redacted via
`SANITIZED_KEYS`), this is mostly safe — but if a query param is
named `apiKey` it WILL be redacted; if it's named `q` it won't. Some
endpoints pass tokens via query string (the OAuth callback, share
links). Worth verifying per-endpoint.

**Fix:** Add a list of known token-bearing query keys
(`?token=`, `?jwt=`, `?code=`, `?state=`, `?key=`) to the redaction
set. Or add a generic regex: any key matching `/token|secret|key|jwt/i`.

### M7. `validateEnv()` exits via `process.exit(1)` synchronously

**File:** `backend/server.ts:323`

If `validateEnv` is called from inside an Express request handler
(it isn't today, but the function is exported and could be called
from anywhere), `process.exit(1)` would terminate the entire
process mid-request. Should throw a typed error instead, and let
the caller decide.

**Fix:** Return `{ ok: true } | { ok: false, errors: string[] }` and
let the caller choose whether to exit. Or throw an `EnvValidationError`
that's caught at the listen boundary.

---

## LOW / NIT

### L1. Many controllers still use bare `logger` instead of named loggers

**Files:** Every controller that hasn't been migrated in v1.67. The
named-logger migration covered server.ts, db.ts, authController.ts,
goldenTicketAdminController.ts, escalationController.ts, plus
middleware/authShared.ts. Not touched: supportRequestsController,
postMutationsController, commentController, documentController,
zoomController, faqController, adminController, aiConfigController,
reputationController, etc.

**Fix:** Sweep with a script: `grep -l 'logger\.(info|warn|error|alert)'` and
convert each site to the matching named logger.

### L2. `User.find({ isDeleted: false, isBanned: false })` lacks `.limit()`

**File:** `backend/controllers/reputationController.ts:186, 209, 257`

Three list endpoints that filter on user state but don't paginate or
limit. With 18 users today it's fine, but at 10k+ this becomes a
full collection scan. Either:
- Add `.limit(200)` and pagination, OR
- Confirm the route is admin-only + behind a count guard.

### L3. `requireFeatureOn` is async — used as Express middleware in spots

**File:** `backend/controllers/supportRequestsController.ts:108, 360`,
many others

`requireFeatureOn(req, res)` is `async` and returns
`Promise<boolean>`. When called as `if (!(await requireFeatureOn(req, res))) return;`
inside a controller body, that's fine. But search the codebase
for `(req, res, next) => requireFeatureOn(...)` (Express middleware
form) — if any exist, the promise is dropped silently and the
controller proceeds.

**Fix:** Audit call sites. Replace any middleware-form usage with
the proper controller-internal pattern.

### L4. `process.env.MONGODB_URI` cast as string with `!`

**File:** `backend/config/db.ts:14-22`, `backend/middleware/authShared.ts:38`,
etc.

`process.env.JWT_SECRET!` and similar use the non-null assertion. If
the env is unset, the error surfaces as a cryptic "secretOrPrivateKey
must have a value" deep in `jsonwebtoken`, not as a clean startup
failure. C3 (env validation in production) compounds this.

**Fix:** `validateEnv()` runs first; the `!` becomes safe. Add a
defensive `if (!process.env.JWT_SECRET) throw new Error(...)` at
each call site anyway.

### L5. Bare `console.log/error` in production code

**File:** `backend/utils/http/logger.ts:55, 60` and many others
where the existing `logger` is bypassed

The named logger goes through the formatter + Discord forwarder.
Bypassing it (`console.log(...)`) skips the formatting, the
category tag, and the Discord ALERT forwarding. Centralized in the
logger for a reason.

**Fix:** Replace remaining `console.*` calls with the appropriate
named logger.

### L6. `requestLogger`'s `meta` includes `query` (the full object) twice

**File:** `backend/utils/http/requestLogger.ts:78, 95`

`logger.info("--> ${url}", { ..., query: req.query, ... })` then
`logger.info("<-- ${url} ...", { method, path, ... })` — the arrival
log has `query: req.query` (object), the response log has `path`
(extracted string). Two shapes, two parsers downstream. The
arrival log's `query` should be a stringified form for consistency
with the response log.

**Fix:** Use `query: new URLSearchParams(req.query).toString()` in
the arrival log.

---

## Suggested fix priority

Order for the next sprint:

1. C1, C2, C3 — fix in this order, one commit each
2. H1 — split `JWT_SECRET` into per-purpose keys (needs a migration
   step to rotate the in-flight TOTP secrets, so schedule it)
3. H2 — add the Error Boundary (low-risk, high-DX)
4. H3, L1 — sweep the `findByIdAndUpdate` + `save()` pattern; same
   commit can include the named-logger migration for L1
5. M3, M4, L6 — requestLogger cleanup, one commit
6. H4 — remove deprecated HomePage
7. M1, M2, M5–M7 — defer to the next sprint

## Verification

After each fix, verify with:

```
npx tsc --noEmit 2>&1
cd frontend && npx tsc --noEmit
bash -n run.sh scripts/backend.sh scripts/frontend.sh
```

End-to-end smoke (the user verifies in browser per the project
convention; do not run visual checks):

```
pkill -f "tsx.*server" && cd backend && npx tsx server.ts
# log in, trigger a duplicate-badges scenario, verify the user
# only got the badge once
```
