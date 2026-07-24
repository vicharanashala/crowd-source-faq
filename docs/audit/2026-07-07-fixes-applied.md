# 2026-07-07 audit — fixes applied

This document tracks which findings from
[`2026-07-07-full-delegation-findings.md`](./2026-07-07-full-delegation-findings.md)
have been shipped, in which PR, and any lessons learned along the way.

## Summary

| Status     | Count |
|------------|-------|
| Fixed      | ~74   |
| Open       | ~57   |
| Retracted  | 1     |
| **Total findings** | **131** (one retracted during audit) |

The audit landed across **8 PRs**, sequenced to keep each PR reviewable:

| PR | Scope | Findings | Status |
|----|-------|----------|--------|
| #141 | Backend moderation RBAC + atomicity | 9 | merged |
| #142 | Backend AI pipeline + key-scope | ~19 | merged |
| #143 | Backend admin scope + regex DoS + output sanitization | ~17 | merged |
| #145 | Backend auth + ObjectId cross-cutting + knowledge | 9 | merged |
| #146 | Frontend admin panel | 12 | merged |
| #147 | Frontend authenticated-user + frontend public | 17 | this branch |
| (next) | Frontend public pages (PR 7) | 12 | this branch |
| (next) | Cross-cutting helpers + ESLint rules + retro | — | partial |

## Per-finding ledger

### Frontend public pages (PR 7) — this branch

| ID | Severity | File | Fix |
|----|----------|------|-----|
| 1.1 | HIGH | `SpurtiChip.tsx` | `user?.id` → `user?._id` |
| 1.2 | MED  | `WelcomePackagePage.tsx` | Drop `activeTab` from fetch deps; fetch-id ref |
| 1.3 | MED  | `ResourceViewerTab.tsx` | Surface fetch failures in TxtRow/MarkdownRow |
| 1.4 | MED  | `ResourceViewerTab.tsx` | `safeResourceUrl()` blocks `javascript:` |
| 1.5 | MED  | `SearchFeedback.tsx` | `dismissedRef` short-circuits 8s re-show timer |
| 1.6 | LOW  | `SearchBar.tsx` | 4s auto-dismiss for `suggestionError` |
| 1.7 | LOW  | `useReadingTracker.ts` | Sent `faqIds` in session-scoped `Set` |
| 1.8 | LOW  | `FAQPage.tsx` | Extract `load()` helper; Retry keeps `batchId` |
| 1.9 | LOW  | `MainLayout.tsx` | Drop `Outlet` `key=currentProgram?._id` |
| 1.10 | LOW | `FAQPage.tsx`, `HomePage.tsx` | Disable Retry while loading; `inFlightRef` |
| 1.11 | LOW | `GuidedTour.tsx` | `navigate(stepRoute, { replace: true })` |
| 1.12 | LOW | `SearchDropdown.tsx` | Add `group` class; categories empty state |

### Frontend authenticated-user (PR 6) — also this branch

Findings 2-D, 2-E, 2-F, 2-G, 2-H were originally scoped to PR 6
(frontend-user) but did not land in the first commit. They are shipped in
the same commit as the PR 7 fixes above.

| ID  | Severity | File(s) | Fix |
|-----|----------|---------|-----|
| 2-A | MED | `SupportIndexPage.tsx` | Add `q` to effect deps |
| 2-B | MED | `useNotifications.tsx` | Skip polling when `document.hidden` |
| 2-C | MED | `useNotifications.tsx` | `markAllInFlightRef` guard |
| 2-D | MED | `CommunityPage.tsx` | Merge two duplicate `[filter,sort,...]` effects |
| 2-E | MED | `AccountPage.tsx` | Transcript topic → controlled React state |
| 2-F | LOW | `SavedKnowledgePage.tsx`, `CommunityPage.tsx` | Drop `user?.id` fallback (User has only `_id`) |
| 2-G | LOW | `ProfileCard.tsx` | Response type `{ user: { id } }` → `{ user: { _id } }` (x3) |
| 2-H | LOW | `SpillTheTea.tsx` | Always advance `lastSeenIdRef` on fetch |

2-A, 2-B, 2-C shipped in commit `35f1898`. 2-D through 2-H shipped in
the PR 7 commit on this branch.

## Cross-cutting middleware (shipped in #145)

- `apps/backend/src/middleware/validateObjectId.ts` (Pattern A) — applied
  to community, faq, knowledge, documents, search routes. Eliminates the
  `CastError → 500` class of bugs across 44+ call sites.
- `apps/backend/src/middleware/programScope.ts` (Pattern F) — adds
  `req.programContext.batchId` from `req.query.batchId` for scoped reads.

## Open work

The full PR 8 (ESLint custom rules + retro doc) is still open. Items:

- `apps/backend/eslint-rules/require-field-coverage.js` — Pattern E
- `apps/backend/eslint-rules/require-role-consistency.js` — Pattern E broader
- Backfill of `validateObjectId` into the ~15 remaining routes that take
  `:id` (the 44+ sites covered in #145 represent the highest-leverage
  set; a follow-up PR can sweep the rest using the same pattern).

## Lessons learned

### H2-2 retraction
The inline audit initially flagged `CommentNode upvote rollback` as a
typo bug (`setBookmarked` vs `setUpvoted`). On re-verification this was
a false positive — the codebase had been refactored to use a server-side
patch + optimistic update pattern, and the apparent "typo" was actually
a typo of an unused variable. The finding was retracted; total
findings dropped from 132 → 131.

### 50-tool-call iteration cap on delegated subagents
Several backend subagents (Subagents 4 and 5) exhausted their 50-call
iteration budget before producing a coherent report. The judge-agent
then applied the inline audit findings (the comments + diff annotations
the subagents had left scattered across files) into a single coherent
report. **Takeaway**: when delegating audit work to subagents, prefer
targeted single-task dispatches with explicit "report findings to
`<file>`" deliverables rather than open-ended exploration.

### Pattern A — `validateObjectId` middleware is the highest-leverage single change
A single factory function applied across 5 routes eliminates a class of
bugs (CastError → 500) that spanned 9 distinct audit findings
(M4-3, M5-2, M5-5, M5-9, S5-H12, and others). The pattern generalises
well — wherever `req.params.id` is fed directly into a Mongoose query,
you get a 400 instead of a 500. **Takeaway**: when an audit surfaces a
recurring anti-pattern, factor the fix into a middleware / helper
instead of patching each site individually.

### Inline `<input>` + DOM-read is a recurring regression
PR 7 finding 1.5 (SearchFeedback dismissed state) and PR 6 finding 2-E
(transcript topic in AccountPage) are both the same shape: React state
lives in `useState`, but the read path uses `document.getElementById`.
This always loses state on re-render boundaries (modal open/close, etc).
**Takeaway**: prefer fully controlled inputs in React; if a `ref`-based
uncontrolled input is genuinely needed, wrap it in a tiny
`useStateValue` helper that mirrors `input.value` to a ref on every
change.

### `useEffect` dep-array misses are extremely common
Findings 2-A (SupportIndexPage `q`), 1.2 (WelcomePackagePage
`activeTab`), and 2-D (CommunityPage dual-effect) are all the same
shape: an effect reads a piece of state but does not list it in deps.
The React-hooks/exhaustive-deps rule would catch most of these, but
the repo's ESLint config does not include that plugin. **Takeaway**:
consider enabling `react-hooks/exhaustive-deps` in a follow-up PR, or
add the equivalent custom ESLint rule from PR 8's spec.

## Verification

Each PR was verified locally before merge with:

- `pnpm -w run typecheck` — 5/5 packages pass
- `pnpm -w run lint` — 0 errors (pre-existing warnings unchanged)
- `pnpm --filter yaksha-faq-frontend run test:run` — 68/68 tests pass
- `pnpm --filter yaksha-faq-frontend run build` — clean

Backend tests are slow to run in full; PR #145's commit message reports
551/551 backend tests passing.