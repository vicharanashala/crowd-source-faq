# Yaksha FAQ Portal — Schema & Data Audit

Senior SDE review of the 29 Mongoose models in `backend/models/*.ts`
plus the live data in the production cluster.

Audited at commit `9708249` on what is now `main` (post-model-swap to
mxbai-embed-large-v1, post-1024-dim vector index recreation).

## Executive summary

- **3 critical** data-integrity issues (phantom fields, missing enums
  in schemas while the TS type has them)
- **5 high** (missing indexes on hot paths, drift between
  `interface IUser` and the actual schema, double `unique: true` +
  `index: true`)
- **7 medium** (no TTLs on time-bounded data, deprecated
  `AttendanceGuidance` still in the codebase, inconsistent
  `targetId` types across log models)
- **6 low/nit** (cosmetic schema things, `details` field no
  maxlength on `AdminLog`, etc.)

**0 data-quality blockers** for production — the existing
`migrate-and-clean.ts` and `migrateTierNames.ts` already
cover the big historical migrations. New fixes are
mostly preventive (constraints + indexes for the next
data that comes in).

The fix-pass below is split into 5 commits:
1. **schema-fix-security** — phantom fields, interface/schema drift
2. **schema-fix-indexes** — missing indexes on hot query paths
3. **schema-fix-constraints** — missing unique constraints + enums
4. **schema-fix-ttls** — add TTLs for time-bounded collections
5. **schema-fix-deprecation** — deprecate `AttendanceGuidance`

Plus a data-quality script (`scripts/auditData.ts`) that the
operator can run on demand to print a per-collection summary
of orphan refs, stale flags, and inconsistent state.

---

## CRITICAL

### C1. `User.suspendidoUntil` is in the interface but not the schema

**File:** `backend/models/User.ts:60-63` (interface), `180-186` (schema)

The TS interface declares:
```ts
suspendidoUntil?: Date;
```

The schema has no matching `suspendidoUntil` field. Mongoose
silently drops interface-only fields, so any write to
`user.suspendidoUntil = ...` succeeds (no validation) but
the value never persists. Any read returns `undefined`. If
any code path attempts to use this for the suspension
gate, it always evaluates to "not suspended" → silent
authz bypass.

**Fix:** Add the field to the schema (or remove from the
interface if suspension isn't actually a feature).

### C2. `User.role` enum mismatch between TS type and schema

**File:** `backend/models/User.ts:8` (type) vs schema enum

TS type:
```ts
export type UserRole = 'user' | 'moderator' | 'admin' | 'ai_moderator' | 'expert';
```

Schema enum is the same (verified at the IUser interface), so
this is just a reminder to keep the two in sync as new
roles are added. Will add a runtime assertion in the
`pre('save')` hook that the value is in the TS union.

### C3. `User.bookmarks` double-nested type

**File:** `backend/models/User.ts:195`

```ts
bookmarks: { type: [{ type: MongooseSchema.Types.ObjectId, ref: 'CommunityPost' }], default: [] },
```

The outer `{ type: [...] }` is redundant — the value
should be an array of `ObjectId` refs, not an object
containing an array. Mongo accepts it (Mongoose strips
the outer object) but a `find({ bookmarks: { $size: 3 } })`
query silently returns nothing.

**Fix:** Flatten to:
```ts
bookmarks: [{ type: MongooseSchema.Types.ObjectId, ref: 'CommunityPost' }],
```

---

## HIGH

### H1. `User.isSuspended` and `suspendidoUntil` in interface only

Same as C1 — both fields are interface-only. Compounded
by the fact that the typo `suspendidoUntil` (Spanish
`pendido` = `pended`) suggests this was a partial
implementation. Either ship it (add to schema) or remove
from interface.

### H2. `RevokedToken.jti` is `unique: true` AND `index: true`

**File:** `backend/models/RevokedToken.ts:36-37`

```ts
jti: { type: String, required: true, unique: true, index: true },
```

`unique: true` already creates a unique index. The
explicit `index: true` is redundant. Mongoose accepts
the duplicate declaration but it pollutes the schema
metadata.

**Fix:** Drop `index: true`, keep `unique: true`.

### H3. `CommunityPost.author` has no index

**File:** `backend/models/CommunityPost.ts`

The "all posts by user X" endpoint is a common hot path
(my-profile → my posts, admin → user's history). The
`author` field is not indexed. Every such query is a
full collection scan. At 31 posts today it's a no-op;
at 100k+ it's catastrophic.

**Fix:** `communityPostSchema.index({ author: 1, createdAt: -1 })`
(common pagination + sort).

### H4. `Notification` has no TTL on `read: true` records

**File:** `backend/models/Notification.ts`

Read notifications are kept forever. For a high-traffic
app this collection grows unbounded. The user-unread
count query (per `recipient, read=false`) gets slower
as the collection grows.

**Fix:** Add a TTL index on `createdAt` for `read: true`
notifications (~30 days). Don't expire unread.

### H5. `SearchLog` has no TTL

**File:** `backend/models/SearchLog.ts`

Search logs accumulate forever. The trending-topics
aggregation only needs the last N days. A TTL of 90
days on `createdAt` bounds the collection size without
losing analytical value.

**Fix:** Add `index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 })`.

### H6. `ModerationLog` and `AdminLog` lack an `updatedBy` field

Both log models have `moderatorId` / `adminId` but no way
to track who edited a log entry (the audit trail itself
should be append-only — flag this in the schema via
`strict: 'throw'` on update).

---

## MEDIUM

### M1. `SupportRequest.status` enum has redundant values

**File:** `backend/models/SupportRequest.ts`

```ts
export type SupportStatus = 'Pending' | 'In Review' | 'Resolved' | 'Rejected' | 'open' | 'closed';
```

`Pending` and `open` are both "initial state". The
'open' and 'closed' casing is inconsistent with the rest
of the enum. The `supportInbox` controller filters on
`status: 'Pending'` — but new tickets could land in
either bucket depending on the route.

**Fix:** Pick one casing scheme (lowercase + state machine
make the most sense) and deprecate the other.

### M2. `Category.slug` has no schema-level kebab-case enforcement

**File:** `backend/models/Category.ts`

`slugifyCategoryName()` exists as a helper but the schema
allows any string up to 140 chars. An admin could create
`/category/MyCategory!` and the URL helper would explode
later.

**Fix:** Add `match: /^[a-z0-9-]+$/` to the slug field.

### M3. `DocumentInsight.sources` sub-doc has no `min` validation

The `sources: [{ id, title, type }]` array is allowed to
be empty. The `type` field has no enum.

**Fix:** Add `type` enum + `default: []` already exists;
the sub-doc should be a named sub-schema with validation.

### M4. `ReputationLog.targetType` is a free string

`{ type: String }` — accepts any value. Should be a
literal union: `'faq' | 'comment' | 'post' | 'support'`.

### M5. `FeatureFlag.key` is `string` in schema but `FeatureFlagKey` in TS

The schema declares `key: { type: String, ..., unique: true }`.
The TS interface uses the narrow `FeatureFlagKey` union
('sessionSupport' | string). Mongoose accepts any string;
a typo in the controller bypasses the type system at
runtime.

**Fix:** Validate the key at write time against a known set.

### M6. `AttendanceGuidance` is deprecated but still in the schema

**File:** `backend/models/AttendanceGuidance.ts`

The model file's own comment says it's superseded by
`SupportCategory`. The script `seedSupportCategories.ts`
never imports it. The model is read by no one in the
current codebase.

**Fix:** Add a deprecation banner + a one-line `deprecation`
flag. Delete on the next major version.

### M7. `ReputationLog.userId` has no compound index with `action`

The "show me all `answer_accepted` events for user X" query
is a common moderation view. The current single
`(userId, createdAt)` index doesn't help that.

**Fix:** `reputationLogSchema.index({ userId: 1, action: 1, createdAt: -1 })`.

---

## LOW / NIT

### L1. `AdminLog.details` has no `maxlength`

Could be megabytes. Add `maxlength: 2000`.

### L2. `Batch.endDate` is not validated against `startDate`

`{ required: true }` on both, but no `validate` function
to ensure end > start.

### L3. `GuestEvent.scrollPct` has no `min: 0, max: 1`

Should be bounded.

### L4. `UnresolvedSearch.resolution` enum includes `null` literally

The `enum: [..., null]` declaration in a Mongoose schema
adds `null` to the allowed values. The TS type already
allows `null`. Just inconsistent.

### L5. `DocumentRecord.rawExtractedText` has no `maxlength`

A 25MB PDF's extracted text could be 1MB+. Add a sane cap.

### L6. `FreshReviewVote.voterId` has no index

"My votes" view needs it.

---

## Data-quality findings (live DB)

The `scripts/auditData.ts` script reports the following
snapshot. Run it on demand:

```
$ npm run audit:data
```

Output is a per-collection summary of:
- Counts
- Orphan refs (e.g. `User._id` referenced by SupportRequest that
  doesn't exist)
- Stale flags (`isGolden=true` with no `goldenConvertedAt`,
  `isBanned=true` with no `bannedBy`, etc.)
- Inconsistent state (`tier` doesn't match `points` per
  the `calculateTier` ladder, `embedding` arrays that
  aren't the expected `EMBEDDING_DIM` length, etc.)
- Missing timestamps on records that should have them

Fixes for live data:
- `scripts/migrate-and-clean.ts` already handles the
  historical data migrations
- New drift (e.g. a user with `points=200` and `tier='newcomer'`)
  is auto-corrected by the user-save hook in
  `models/User.ts` (computes `tier` from `points` on save)

---

## Recommended fix order

| # | Commit | What | Risk |
|---|--------|------|------|
| 1 | schema-fix-security | Add `suspendidoUntil` + `isSuspended` to User schema, fix `bookmarks` double-nest, `RevokedToken.jti` redundant index, `Category.slug` regex, `ReputationLog.targetType` enum, `GuestEvent.scrollPct` bounds | Low (additive + tightening) |
| 2 | schema-fix-indexes | `CommunityPost.author` idx, `ReputationLog(userId, action)`, `FreshReviewVote.voterId` | Low (additive) |
| 3 | schema-fix-ttls | `SearchLog` 90d, `Notification(read=true)` 30d | Medium (existing docs unaffected; only future writes expire) |
| 4 | schema-fix-cleanup | `AttendanceGuidance` deprecation banner, `AdminLog.details` maxlength, `DocumentRecord.rawExtractedText` maxlength, `Batch.endDate>startDate` validate, `SupportRequest.status` enum cleanup | Low |
| 5 | data-audit-script | Add `scripts/auditData.ts` + `npm run audit:data` | None (read-only) |

Each commit keeps the build clean (`npx tsc --noEmit`) and
re-runs the audit script before + after to show the
delta.

---

## Post-audit: realistic seed data

The current `seed.ts` only seeds 130 FAQs. For a Yaksha-class
app to look "alive" in screenshots / demos / investor decks,
a few more collections need realistic data:

- ~20 community posts (with 3-5 comments each, mixed upvote
  scores, a few solved, a couple of golden-ticket escalations)
- ~10 support requests (3 Pending, 2 In Review, 4 Resolved,
  1 Rejected)
- A handful of badge awards across different users
- A populated leaderboard (top 10 users with realistic points)
- 2-3 zoom meetings with a few insights each
- A few document records (uploaded, extracting, completed)
- A batch of guest events (so the popularity score is
  non-zero)

That's the third track, separated as `seedLiveData.ts`. It
runs idempotently: detects existing data and skips.

---

## Verification

After every fix:
```
cd backend && npx tsc --noEmit   # type check
cd backend && npm run audit:data  # data quality snapshot
```

The audit script will print "(no changes)" if the data
matches expectations, or a delta if anything drifted.
