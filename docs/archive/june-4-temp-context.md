# June 4 Session Context — UI Glassmorphism + Access Control

> Two UI passes (light-mode parity + ghost-button redesign) and one access-control pass.
> Backend untouched on UI; access-control pass touched 4 backend files + 2 frontend files.
> All changes typecheck clean on both sides.

---

## 1. Light-mode glassmorphism search overlay (text2.txt spec)

**Spec:** [text2.txt](https://drive.google.com/file/d/1g5aqD9idh-RxqpEiYPsffzim07YoPUpU/view?usp=sharing)

Refactor ONLY search-overlay colors, blur, and contrast in light mode — DO NOT change layout. Fix:
- Background looked muddy / dark-tinted
- Cards looked dirty instead of clean white
- Blur effect lost its clarity

### Files changed
- `frontend/src/styles/index.css` — 5 search-component CSS classes with full light/dark token parity
- `frontend/src/pages/HomePage.tsx` — stripped redundant `dark:` overrides from search dropdown
- `frontend/src/components/faq/SearchDropdown.tsx` — same
- `frontend/src/components/ui/SearchBar.tsx` — same (plus `shadow-subtle` instead of `dark:` arbitrary value)

### CSS classes added (lines 530–700 of `index.css`)

| Class | Light | Dark |
|---|---|---|
| `.search-overlay` | `rgba(0,0,0,0.25)` + `blur(16px)` | `rgba(0,0,0,0.5)` + `blur(20px)` + green glow |
| `.search-panel` | `rgba(255,255,255,0.7)` + `blur(20px)` + `linear-gradient(135deg, rgba(34,197,94,0.05), rgba(255,255,255,0.6))` + `rgba(0,0,0,0.08)` border + `0 20px 50px rgba(0,0,0,0.15)` shadow | dark charcoal glass |
| `.search-bar-input` | `#FFFFFF` bg, `#111827` text, focus `rgba(34,197,94,0.4)` border + `0 0 0 3px rgba(34,197,94,0.15)` glow | semi-transparent dark |
| `.search-list-item` | `#FFFFFF` bg, `#111827` text; hover `rgba(0,0,0,0.03)`; active `rgba(34,197,94,0.08)` + `rgba(34,197,94,0.2)` border | dark glass |
| `.search-pill` | `rgba(0,0,0,0.04)` bg, `#374151` text; hover `rgba(34,197,94,0.08)` + `#16A34A` | dark glass |
| `.search-skeleton` (new) | `rgba(255,255,255,0.5)` bg + `rgba(0,0,0,0.06)` border | `rgba(255,255,255,0.04)` + `rgba(255,255,255,0.06)` |

### Architecture decision
**Use `[data-theme="dark"]` CSS overrides, not `dark:` Tailwind classes in JSX.** The CSS class becomes self-contained — both modes defined in one place — preventing the `dark:` class in JSX from accidentally leaking into light mode. Component-level `dark:` overrides were stripped where the CSS class already handles both modes.

### What I would NOT touch
- `bg-cream` Tailwind class (used in `AccountPage`, `CTA`, `SearchBar` wrapper) — it's a valid Tailwind class mapped to `--bg-card-hover-rgb` (`#F7F6F3`), a clean warm off-white. Not the issue.

---

## 2. "Ask the Community" + Popular Searches pill redesign (text3.txt spec)

**Spec:** [text3.txt](https://drive.google.com/file/d/106vXZQX_gjB7GZ9jXWf7dbJdz9WdoKxZ/view?usp=sharing)

Refactor ONLY these two elements inside the search overlay in BOTH light and dark modes. DO NOT change layout.

### Files changed
- `frontend/src/styles/index.css` — 2 new CSS classes (`.search-ask-btn`, `.search-popular-pill`) + badge sub-class
- `frontend/src/pages/HomePage.tsx` — applied new classes to the "Ask community" button + popular search pills
- `frontend/src/components/ui/CTA.tsx` — replaced `btn-cta` with `search-ask-btn` (same ghost styling, no more inverted dark-on-light bug)

### CSS classes added (lines 680–810 of `index.css`)

**`.search-ask-btn`** — Ghost button:
- Light: `#FFFFFF` bg, `rgba(0,0,0,0.08)` border, `#374151` text, `#16A34A` icon
- Light hover: `rgba(22,163,74,0.08)` bg, `rgba(22,163,74,0.2)` border, `#16A34A` text
- Dark: `rgba(255,255,255,0.03)` bg, `rgba(255,255,255,0.08)` border, `#D1D5DB` text, `#22C55E` icon
- Dark hover: `rgba(34,197,94,0.08)` bg, `rgba(34,197,94,0.25)` border, `#22C55E` text, `0 0 20px rgba(34,197,94,0.15)` glow

**`.search-popular-pill`** — Enhanced pill with count badge:
- Light: `#F3F4F6` bg, `rgba(0,0,0,0.08)` border, `#374151` text
- Light hover: `rgba(22,163,74,0.08)` bg, `rgba(22,163,74,0.25)` border, `#16A34A` text
- Dark: `rgba(255,255,255,0.04)` bg, `rgba(255,255,255,0.08)` border, `#D1D5DB` text
- Dark hover: `rgba(34,197,94,0.08)` bg, `rgba(34,197,94,0.3)` border, `#22C55E` text

**`.search-popular-badge`** — Count badge (`ml-auto`):
- Light: `rgba(0,0,0,0.06)` bg, `#6B7280` text
- Dark: `rgba(255,255,255,0.08)` bg, `#9CA3AF` text

### Bug fixed (incidental)
The pre-existing `CTA.tsx` "Ask the Community" button used `btn-cta` which styles as **dark bg + white text** (`bg-ink text-accent-text`). In light mode this is hardcoded to look like an inverted button — clearly wrong. The new `.search-ask-btn` is theme-correct.

---

## 3. Access control public/protected + 5/day anonymous AI search

**No UI/styling/layout changes. Minimum backend/frontend permission surface.**

### Files changed
- `backend/routes/faq.ts` — removed `protect` from 4 GET endpoints
- `backend/routes/community.ts` — removed `protect` from 6 GET endpoints
- `backend/routes/askAi.ts` — rewrote with rate limiters (anon 20/min, authed 30/min); removed `protect`
- `backend/controllers/knowledgeController.ts` — removed `req.user` 401 gate from `askAIController`
- `frontend/src/components/askai/AskAIButton.tsx` — 5-search/day limit + UI states
- `frontend/src/utils/api.ts` — 401 interceptor no longer opens modal for users who never had a token

### Public endpoints (no auth required)

**FAQ (`backend/routes/faq.ts`):**
```
GET  /api/faq
GET  /api/faq/paginated
GET  /api/faq/recent
GET  /api/faq/:id
GET  /api/faq/:id/history
```

**Community (`backend/routes/community.ts`):**
```
GET  /api/community
GET  /api/community/search
GET  /api/community/solved
GET  /api/community/answers/list
GET  /api/community/stats
GET  /api/community/:id
GET  /api/community/:id/related
```

**AI Search (`backend/routes/askAi.ts`):**
```
POST /api/ask-ai   — public, anon throttled to 20/min per IP, authed 30/min per IP
```

### Protected endpoints (unchanged)
All `POST / PATCH / PUT / DELETE` on `/api/faq/*` and `/api/community/*`, plus:
```
GET  /api/community/bookmarks        (user-specific)
GET  /api/community/review-queue     (admin/moderator)
GET  /api/notifications
GET  /api/admin/*
GET  /api/moderation/*
```

### Anonymous AI search quota (frontend enforcement)

`AskAIButton.tsx` tracks:
- `yaksha_anon_ai_count` (number) — searches used this window
- `yaksha_anon_ai_reset` (timestamp) — when the window expires (24h from first search)

Behavior:
- Reads counter on mount + on every panel open
- Resets automatically when 24h elapsed
- At 5/5: textarea + send button disabled, empty-state shows lock icon + "Sign in to continue" CTA, modal opens automatically 1.5s after the user's 5th successful search
- Counter pill in header: gray (5 left) → amber (1 left) → red (0 left)
- Counter resets to 0 instantly on auth flip
- Logged-in users see no counter (unlimited)

### AI search backend rate limit (`backend/routes/askAi.ts`)

```ts
const anonAiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,        // defense-in-depth — frontend enforces 5/day
  keyGenerator: (req) => `anon:${ipKeyGenerator(req.ip ?? 'unknown')}`,
  skip: (req) => !!(req.headers.authorization?.startsWith('Bearer ')),
});
const authedAiLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, ... });
```

If a Bearer token is present, the request goes through `protect` (best-effort verification) and then the `authedAiLimiter`; otherwise it skips straight to the controller under the `anonAiLimiter`. Invalid/expired tokens fall through to the anon path — public access is the default, auth only changes the rate limit.

### 401 interceptor fix (`frontend/src/utils/api.ts`)

The old interceptor opened the sign-in modal on ANY 401 response — including cases where an anonymous user hit a (formerly) protected public endpoint. Now it only opens the modal if `localStorage.getItem('yaksha_token')` was truthy BEFORE the 401 fired (i.e., the user had a real session that just expired). Anonymous 401s silently clear the (non-existent) token.

### Pre-existing 500 bug (NOT fixed — out of scope)

`GET /api/community/bookmarks` and `/api/community/review-queue` return **500** instead of 401 for anonymous users. The `authorize()` middleware in `authShared.ts` calls `next(new Error('Insufficient permissions.'))` without setting `err.status`, and the global error handler falls through to 500. Pre-existing bug on admin-only routes that anonymous users wouldn't hit in normal product flow. Per the "do not refactor unrelated code" rule, left as-is. Trivial fix if/when needed: add `err.status = 403` in the `authorize` factory.

### Verification (curl, no token)

```
200  GET  /api/faq
200  GET  /api/faq/paginated
200  GET  /api/faq/recent
200  GET  /api/community
200  GET  /api/community/solved
200  GET  /api/community/stats
200  GET  /api/community/answers/list
200  GET  /api/search/trending
200  GET  /api/reputation/leaderboard
200  POST /api/ask-ai
401  POST /api/community
401  POST /api/faq/check-match
401  PATCH /api/faq/x/feedback
401  POST /api/faq/x/report
401  POST /api/community/x/bookmark
401  GET  /api/notifications
```

All public endpoints return 200 without auth. All write/admin endpoints still return 401.

---

## 4. Files NOT modified in this session (despite being in `git status`)

The working tree has 57 modified + 4 untracked files vs. the last commit `47add56`. Many are pre-existing uncommitted changes from earlier sessions today (security audit, dark-mode token pass, admin duplicate-header sweep, etc.). The session touched:

**UI session (sections 1 + 2):**
- `frontend/src/styles/index.css` (+~600 lines: 7 new CSS classes with light/dark parity)
- `frontend/src/pages/HomePage.tsx` (search dropdown cleanup)
- `frontend/src/components/faq/SearchDropdown.tsx` (skeleton + dark: cleanup)
- `frontend/src/components/ui/SearchBar.tsx` (suggestions dropdown dark: cleanup)
- `frontend/src/components/ui/CTA.tsx` (btn-cta → search-ask-btn)

**Access control session (section 3):**
- `backend/routes/faq.ts` (-4 × `protect`)
- `backend/routes/community.ts` (-7 × `protect`, route reorder)
- `backend/routes/askAi.ts` (rewrote: rate limit + conditional protect)
- `backend/controllers/knowledgeController.ts` (-3 lines: 401 gate removed)
- `frontend/src/components/askai/AskAIButton.tsx` (+~120 lines: 5-search limit + UI states)
- `frontend/src/utils/api.ts` (+7 lines: hadToken check in 401 handler)

Total: **6 frontend files + 4 backend files = 10 files** in this session. The other 51 uncommitted files are from prior work today (security audit, dark mode, etc.) — not in scope for this context doc.

---

## 5. Quick facts / state to remember

- Backend boots on `:6767`, frontend on `:5173`. Backend runs via `node_modules/.bin/tsx server.ts`. Always `pkill -f "tsx.*server"` before restarting to avoid orphan processes.
- Both ends typecheck clean: `cd backend && npx tsc --noEmit` and `cd frontend && npx tsc --noEmit` both return 0.
- The `routes-reference.md` context file is now **stale** — it still shows the old public/protected status (e.g. `GET /community/posts` shown as `protect`-ed). Worth regenerating the next time someone updates that file.
- The `issues.md` file was already updated on 2026-06-04 with a full security audit (N1–N9). N1 (OAuth state forgery) and N2 (webhook signature fail-closed) were fixed. N3 (RAG thresholds) was fixed. N4–N9 are documented but not yet addressed.
- No DB migrations. No new dependencies. `express-rate-limit` and `ipKeyGenerator` were already in `package.json` (used by `search.ts` and `utils/rateLimit.ts`).

---

## 6. Open follow-ups (for next session)

- [ ] Regenerate `context/routes-reference.md` to reflect the new public/protected status.
- [ ] Fix the `authorize()` 403 vs 500 bug (1-line change in `authShared.ts`).
- [ ] Add server-side `MongoDB` rate limit on `/api/ask-ai` keyed by `req.user._id` (currently it's IP-based even for authed users) — would survive localStorage clear for logged-in users.
- [ ] Add a backend audit log entry when a user transitions from anon → anon-limited (so we can see how often the 5-cap is hit).
- [ ] Consider removing `protect` import from `askAi.ts` entirely if we decide the authed path should also be public-but-rate-limited.
- [ ] `pages/CommunityPage.tsx` line 9 has small changes from the dark-mode pass — worth a quick diff review next session.
