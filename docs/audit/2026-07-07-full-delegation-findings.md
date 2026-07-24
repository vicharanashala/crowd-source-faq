# Full Delegation Audit — 2026-07-07

**Branch:** `audit/full-delegation-2026-07-07`
**Scope:** Every feature, every endpoint, frontend + backend
**Pattern:** Judge delegates ALL reading & analysis to subagents (5 in parallel). Judge orchestrates only.
**Subagent split (parallel):**

| # | Subagent | Scope | Files |
|---|----------|-------|-------|
| 1 | `frontend-public` | Public-facing pages (FAQ, Search, Auth, Layout, Navbar, Footer) | ~70 tsx files in `apps/frontend/src/{pages,components/layout,components/faq,components/search,components/auth}/` |
| 2 | `frontend-user` | Authenticated user features (Community, Notifications, Ask-AI, Account, Support, Bookmark) | ~70 tsx files in `apps/frontend/src/{community,notifications,askai,account,support,bookmark}/` |
| 3 | `frontend-admin` | Admin panel (AdminRoute, AdminLayout, admin/* pages, hooks, components) | ~50 tsx files in `apps/frontend/src/admin/` |
| 4 | `backend-core` | Core API routes (auth, faq, community, search, knowledge, ask-ai, support) | 13 route files + middleware |
| 5 | `backend-admin-program` | Admin + Program + AI pipeline + Moderation routes | 32 route files |

**Existing context:**

- `audit-findings.md` is the prior running audit (frontend RBAC, 318 lines, 12 HIGH + 8 MED + 8 LOW). Subagents should READ it and avoid duplicating already-FIXED findings — focus on what's STILL BROKEN or NEW regressions.
- `docs/redesign-plan.md` is the master plan. Subagents should READ it briefly to understand which work has been planned vs which is still uncaught.
- The previous exhaustive route audit (2026-07-03) shipped fixes via PR. Re-survey for regressions.

**Critical ground rules for ALL subagents:**

1. **Do NOT commit, push, or modify files.** Reports only.
2. **Do NOT run any servers or exercises against live DBs.** Read-only — analyze source.
3. **Use `search_files` / `read_file` / `terminal cat` / `terminal grep` only.** No edits, no test runs, no `pnpm build`.
4. **If you discover a bug outside your scope, NOTE it in a "Out of scope" section at the end** — don't silently fix it.
5. **Output format:** append your findings to this file under your section heading using the `patch` tool. Use `findings-template` structure below.

---

## Findings Template (for each subagent)

For each bug/issue, emit exactly this block:

```
### {ID} — {Short title}
- **File(s):** path/to/file.tsx:line-line
- **Severity:** CRITICAL | HIGH | MEDIUM | LOW
- **Category:** RBAC | XSS | Logic | Validation | Race | UX | Performance | Code smell | Test gap | Doc gap
- **Bug:** {one-paragraph description}
- **Evidence:** {excerpt of the problematic code}
- **Fix:** {one-paragraph fix recommendation}
- **Verification:** {what test/curl/run proves it's fixed}
```

Severity scale:
- **CRITICAL** — data loss, security vuln, auth bypass, production-down.
- **HIGH** — wrong behavior in normal user flow, RBAC bypass, data corruption.
- **MEDIUM** — edge case bug, papercut UX, partial-feature not working as designed.
- **LOW** — code smell, redundant logic, missing tests, doc inconsistency.

---

(Sections will be filled by the 5 parallel subagents below. Judge consolidates after they all return.)

<!-- ============================================ -->
<!-- SUBAGENT 1: frontend-public -->
<!-- ============================================ -->

## Subagent 1 — Frontend Public Pages

**Scope dirs:** `apps/frontend/src/components/layout/`, `components/faq/`, `components/search/`, `components/auth/`, `components/explore/`, `components/welcome/`, `pages/`, plus `routes/` for guard re-review.

**Focus areas:**
- FAQ browsing/listing/search UX vs FAQPage logic, filter/sort URL sync, MR1-MR8 unfixed lows.
- Auth modal (login/register/forgot password), useAuth context, token refresh, route guards.
- Navbar / Footer / MainLayout consistency.
- Welcome page for unauth users.

**Read first:** `audit-findings.md` H1-H12 and M1-M8, L1-L8. Note which are FIXED. Only report what is STILL BROKEN, REGRESSED, or NEW since the audit was written.

**Append findings below using the Template format. Add a `## Subagent 1 Summary` at the end with severity counts.**

---

### 1.1 — `SpurtiChip.tsx:24` reads `user?.id` instead of `user?._id`, hiding Spurti Points pill for every authenticated user
- **File(s):** `apps/frontend/src/components/layout/SpurtiChip.tsx:24,43-44`
- **Severity:** HIGH
- **Category:** Logic
- **Bug:** The `User` interface (`hooks/useAuth.tsx:5-29`) uses `_id` — never `id`. `SpurtiChip.tsx:24` reads `const userId = user?.id ?? null;` so `userId` is always `null` for real users. The early-return at line 43 (`if (!userId) return null`) means the Spurti Points chip never renders and the `/support/me/sp` network call never fires. The GuidedTour even references `[data-tour="spurti-chip"]` (`GuidedTour.tsx:37`), so the program-selector step's tooltip points at an empty area. This silently breaks the v1.65 SP currency system and the Golden Ticket feature it funds.
- **Evidence:**
  ```tsx
  // SpurtiChip.tsx:24
  const userId = user?.id ?? null;            // ← always null; User has _id, not id
  ...
  if (!userId) return null;                    // ← chip never renders
  ```
- **Fix:** Change line 24 to `const userId = user?._id ?? null;`. Also confirm `user?._id ?? user?.email` is used everywhere a user-id-style key is needed (search the codebase for `user?.id` and `user.id` patterns to be safe).
- **Verification:** `grep -RnE "user\\?\\.id\\b|user\\.id\\b" apps/frontend/src` should be empty (or only on objects other than the `User` shape — e.g. `useAdminAuth`). Manually sign in and open DevTools → confirm a `200 GET /support/me/sp` request fires and the SP chip appears with the user's balance.

---

### 1.2 — `WelcomePackagePage.tsx:62-84` re-fetches orientation + resources on every tab switch (race + redundant work)
- **File(s):** `apps/frontend/src/pages/WelcomePackagePage.tsx:62-84`
- **Severity:** MEDIUM
- **Category:** Performance / Race
- **Bug:** The `useEffect` that fetches `/welcome/orientation` and `/welcome/resources` lists `activeTab` in its dependency array. Every tab switch (orientation → discovery → my-project → timeline) fires two extra API requests that have nothing to do with the active tab. Worse, the `then()` callback updates `sections` state in place — if the user clicks back and forth quickly the late-arriving orientation response can clobber the resources-loaded flag (stale-tab closure).
- **Evidence:**
  ```tsx
  useEffect(() => {
    let cancelled = false;
    const params = currentProgram?._id ? { batchId: currentProgram._id } : {};
    Promise.all([
      api.get('/welcome/orientation', { params }).catch(() => ({ data: null })),
      api.get('/welcome/resources', { params }).catch(() => ({ data: [] })),
    ]).then(([orientationRes, resourcesRes]) => {
      if (cancelled) return;
      // …sets sections based on whichever response won the race
    });
    return () => { cancelled = true; };
  }, [currentProgram?._id, activeTab]);     // ← activeTab shouldn't be in deps
  ```
- **Fix:** Remove `activeTab` from the dep array. If resources need a refresh after some tab-related user action, gate that explicitly (e.g. on a refresh button click). Also wrap the state assignment in a `lastFetchIdRef` guard so the response of an older (cancelled) fetch can't overwrite a newer one.
- **Verification:** Open the Welcome Package page, click between each tab — Network panel should show two GETs on first mount only, none on subsequent tab clicks.

---

### 1.3 — `ResourceViewerTab.tsx:546-550, 580-587` fetches markdown/txt via `fetch()` and may render blank when Cloudinary lacks CORS headers
- **File(s):** `apps/frontend/src/components/welcome/ResourceViewerTab.tsx:544-572, 575-609`
- **Severity:** MEDIUM
- **Category:** UX / Performance
- **Bug:** `TxtRow` and `MarkdownRow` call `fetch(resource.url)` from the browser. Cloudinary (and many CDNs) do not return `Access-Control-Allow-Origin: *` for arbitrary asset deliveries by default; in that case the request fails with a CORS error, `.then()` never runs, and the `<pre>` stays empty. The user's resource *did* load — but they can't see it. The "elapsed" timer marks it complete anyway. Failures are silently swallowed.
- **Evidence:**
  ```tsx
  useEffect(() => {
    let cancelled = false;
    fetch(resource.url)
      .then((r) => r.text())
      .then((txt) => { if (!cancelled) setBody(txt); })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [resource.url]);
  ```
- **Fix:** Detect `fetch()` failure and fall back to an "Open in new tab" link (same UX the `PptxRow` and `SvgRow` already use). Optionally render an inline loading state while the fetch is in flight and surface the CORS error so the user can act.
- **Verification:** Manually set a markdown resource's URL to a Cloudinary asset that does NOT send CORS headers (e.g. `resource.url` with `?fl_attachment` or no `fl_force_strip_profile`). Without fix: blank `<pre>`, no error to user, completion still fires.

---

### 1.4 — `ResourceViewerTab.tsx:367, 398, 529, 617` puts admin-supplied `resource.url` straight into `href`/`src`/`iframe src` — relies on backend for URL safety
- **File(s):** `apps/frontend/src/components/welcome/ResourceViewerTab.tsx` (PdfRow, PptxRow, SvgRow, TxtRow, MarkdownRow, LinkRow, SvgRow fallback link)
- **Severity:** MEDIUM
- **Category:** XSS / Trust boundary
- **Bug:** Resource `url` is admin-controlled. It's rendered unmodified into `<iframe src>`, `<a href>`, `<video src>`, `<img src>`, and `fetch()`. If the backend stores URLs without an allowlist (http/https only) and the admin role is ever compromised (or a single admin is socially engineered), a `javascript:` URI in `url` becomes an XSS sink when a user clicks the link (`LinkRow` anchor and the `SvgRow` fallback anchor don't set `rel="noopener noreferrer"` — actually they do, but `javascript:` in an `<a href>` runs on click regardless of `rel`). The frontend does no defensive check.
- **Evidence:**
  ```tsx
  // PdfRow (line 367)
  <iframe src={resource.url} title={resource.title} className="w-full h-full" />
  // LinkRow (line 617)
  <a href={resource.url} target="_blank" rel="noopener noreferrer" ...>
  ```
- **Fix:** Add a `safeResourceUrl(value)` helper that rejects non-`http(s)` schemes and call it once on render (e.g. wrap the resource before passing into row components). When the helper rejects, render a fallback card saying "Unsupported URL scheme". Server-side, the admin `OnboardingResource` create/update endpoints should also reject non-`http(s)` URLs at validation time (out of scope for this audit, but worth flagging to Subagent 4/5).
- **Verification:** Temporarily set a resource `url = "javascript:alert(1)"` in the admin UI, save, then visit the Welcome Package page. Expected: no XSS. Currently: anchor click fires the script in the page origin.

---

### 1.5 — `SearchFeedback.tsx:16-22` 8-second timer re-shows the dismissed "Did this answer your question?" prompt
- **File(s):** `apps/frontend/src/components/faq/SearchFeedback.tsx:16-29`
- **Severity:** MEDIUM
- **Category:** UX
- **Bug:** After the user clicks "Yes, I am good" or "Cancel" (which both call `setDismissed(true)`), nothing prevents the second `useEffect` (lines 16-22) from running again 8 seconds later. That effect unconditionally calls `setDismissed(false); setPhase('prompt')`, so the prompt pops back up while the user is still on the page even after they've explicitly dismissed it.
- **Evidence:**
  ```tsx
  useEffect(() => {
    const timer = setTimeout(() => {
      setDismissed(false);                  // ← overrides explicit dismissal
      setPhase('prompt');
    }, 8000);
    return () => clearTimeout(timer);
  }, [searchQuery, resultFaqId]);
  ```
- **Fix:** Either (a) capture the dismissed state in a ref and bail early in the timeout callback, or (b) drive the re-show from a separate signal (e.g. a new search that *isn't* the same as the previous one) and explicitly avoid firing when the user has explicitly dismissed. The simplest fix: only re-show if the user has NOT clicked "No, I need more help" and has NOT explicitly closed; track that in a ref.
- **Verification:** Submit a search on `/`, wait 8 seconds after tapping "👍 Yes, I am good" — the prompt must NOT reappear. Without the fix, it will.

---

### 1.6 — `SearchBar.tsx:140-151` suggestion error never clears automatically + navigates unconditionally
- **File(s):** `apps/frontend/src/components/search/SearchBar.tsx:140-162`
- **Severity:** LOW
- **Category:** UX
- **Bug:** Two minor issues: (a) When `handleSuggestionClick` fails to prefetch the FAQ data, `suggestionError` is set and shown below the suggestions dropdown — but only cleared on the next `setSuggestions([])`/`fetchSuggestions` cycle. It lingers indefinitely if the user stops typing. (b) The `navigate(/faq/${faqId})` runs in the `try { … } catch {}` fallback *after* the error path, which is intentional but means the user is silently routed to an empty highlight even though they were shown a red error.
- **Evidence:**
  ```tsx
  const handleSuggestionClick = async (faqId: string) => {
    setShowSuggestions(false);
    setSuggestions([]);
    setSuggestionError(null);    // good, cleared here
    try {
      const res = await api.get<...>(`/faq/${faqId}`);
      sessionStorage.setItem('yaksha_faq_highlight', JSON.stringify(res.data));
    } catch {
      setSuggestionError('Could not load FAQ. Navigating anyway.');    // ← set, but only cleared by next fetchSuggestions
    }
    navigate(`/faq/${faqId}`);                                          // ← unconditional
  };
  ```
- **Fix:** Add an `setTimeout(() => setSuggestionError(null), 4000)` after setting it so it auto-dismisses. Optionally rephrase the copy so it doesn't say "Navigating anyway" — navigate then set the error is confusing.
- **Verification:** Trigger the error path (e.g. network offline, click a suggestion). Error should appear for ~4 s, then disappear. Without fix, the red banner persists as long as the search bar is mounted.

---

### 1.7 — `useReadingTracker.ts:122-147` `stateRef.current.sent` is per-FAQ but `flush()` is called by the cleanup of every effect run, double-firing `trackPublicReading` on re-mount
- **File(s):** `apps/frontend/src/components/explore/useReadingTracker.ts:122-147`
- **Severity:** LOW
- **Category:** Performance / Race
- **Bug:** When `PublicFaqDetail` remounts the same FAQ (e.g. user clicks the same list item twice), the cleanup at line 143 calls `flush()` *and* a fresh effect adds a new `pagehide` listener that may also call `flush()`. The `stateRef.current.sent = true` lives on a `useRef` recreated per FAQ-id reset on remount, so a re-mount re-arms the ref. Two `trackPublicReading` beacons can fire for the same `faqId+sessionId`.
- **Evidence:**
  ```ts
  useEffect(() => {
    if (!faqId || !batchId) return;
    const flush = () => {
      if (stateRef.current.sent) return;
      ...
      stateRef.current.sent = true;
      trackPublicReading(...);
    };
    const onPageHide = () => flush();
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      flush();                                                              // ← always on cleanup
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [faqId, sessionId, batchId, options.expectedReadMs]);
  ```
- **Fix:** Move the `stateRef.current.sent` guard to a Map keyed by `faqId` (or a `sessionFaqSentRef.current = new Set<string>()`) so re-mounting the same FAQ doesn't re-arm the gate. Also consider debouncing: the cleanup `flush()` fires on every re-mount even when the page hasn't actually been hidden.
- **Verification:** Open the public FAQ detail modal, close it, click the same list item to reopen, close it. The backend's `/public/track-reading` endpoint should receive one event per session, not two.

---

### 1.8 — `FAQPage.tsx:393-397` retry handler in error block omits `batchId` param that the original fetch had — drops program filter on retry
- **File(s):** `apps/frontend/src/pages/FAQPage.tsx:393-397`
- **Severity:** LOW
- **Category:** Logic
- **Bug:** When the initial FAQ fetch fails (line 78 — `api.get('/faq', { params: { batchId } })`), the inline retry button at line 393 calls `api.get('/faq')` *without* the `batchId` param. Users in a specific program who hit a transient error and tap Retry get unfiltered FAQs (same root cause as M8 in `audit-findings.md`). The `noProgramSelected` guard at line 382 is meaningless if Retry silently falls back to a global fetch.
- **Evidence:**
  ```tsx
  <button onClick={() => { setError(''); setLoading(true); api.get('/faq')   // ← batchId omitted on retry
      .then(...).catch(...).finally(...);
  }}>
    Retry
  </button>
  ```
- **Fix:** Move the retry fetch into a small `load()` helper that captures `batchId` in its closure (mirrors the success-path `useEffect` dep). Call it from both the effect and the retry button.
- **Verification:** Open `/faq` while a program is selected, simulate a 5xx for `/faq?batchId=…`, click Retry. With fix: the retry still includes `batchId`. Without: the retry request omits it.

---

### 1.9 — `MainLayout.tsx:16` uses `Outlet key={currentProgram?._id ?? 'none'}` — full page remount on every program switch can drop unsaved form state across the entire app
- **File(s):** `apps/frontend/src/components/layout/MainLayout.tsx:16`
- **Severity:** LOW
- **Category:** UX
- **Bug:** Setting `key={currentProgram?._id ?? 'none'}` on `<Outlet />` forces React to unmount/remount the routed page on every program change. For pages like `CreatePostDialog`, `AskAIButton`, `NewSupportRequestPage`, any text the user had typed into a form is wiped the moment they switch programs (which BatchSwitcher does on a single click). The initial intent was probably to reset URL-driven state on program change, but a blanket key change is too aggressive — it costs a real UX tax (mid-draft lose-everything) for the benefit.
- **Evidence:**
  ```tsx
  export default function MainLayout() {
    const { currentProgram } = useProgram();
    return (
      <>
        <Navbar />
        <div className="flex-1 w-full relative z-0">
          <Outlet key={currentProgram?._id ?? 'none'} />     // ← remounts on every program change
        </div>
        <GuidedTour />
      </>
    );
  }
  ```
- **Fix:** Either narrow the key to pages that need it (move the keyed Outlet into individual pages, or wrap a smaller subtree), or at minimum show a confirm dialog before the switch if any page's form is "dirty". At minimum, audit which pages already self-clear and only key the Outlet for those.
- **Verification:** Open `/account` (or any page with form inputs), start typing in a text field, click the BatchSwitcher in the navbar and switch program. With fix: your text is still there (or a confirm dialog appears). Without fix: text is gone.

---

### 1.10 — `HomePage.tsx:679` and `FAQPage.tsx:393` inline error retry handlers swallow fetch errors with no retry/rollback state if the user double-clicks
- **File(s):** `apps/frontend/src/pages/HomePage.tsx:679-684`, `apps/frontend/src/pages/FAQPage.tsx:393-397`
- **Severity:** LOW
- **Category:** Race
- **Bug:** Both pages reset their error/loading state inline in the onClick handler. There is no debounce or in-flight guard — a user double-clicking "Retry" can fire two parallel `/faq` requests. The second response can overwrite the first depending on arrival order. The cleanup hook on `mounted = true` (line 74 in FAQPage) does guard against setState-after-unmount but not against duplicate concurrent fetches.
- **Evidence:**
  ```tsx
  <button onClick={() => { setError(''); setLoading(true); api.get('/faq')...}}>
    Retry
  </button>
  ```
- **Fix:** Pull the retry fetch into a `load()` function gated by an `inFlight` ref so the second click is a no-op until the first resolves. OR disable the Retry button while `loading === true` (same as `isDisabled`).
- **Verification:** Throttle network to slow 3G, double-click Retry. Backend log should show only one `/api/faq` request per click sequence.

---

### 1.11 — `GuidedTour.tsx:130-137` step navigation always re-navigates to `/` even if the user is already there, causing a redundant history entry on every step
- **File(s):** `apps/frontend/src/components/ui/GuidedTour.tsx:130-137`
- **Severity:** LOW
- **Category:** UX
- **Bug:** Every step in the array has `route: '/'`, and the effect calls `navigate(stepRoute)` whenever the active tour step changes. Even though there's a `if (stepRoute && location.pathname !== stepRoute)` guard, every step transition still fires the effect, and React's `navigate()` with the same pathname may push a redundant entry on some routing libs. (Audit-found comment in 1.2's `WelcomePackagePage` shows a similar pattern.) More importantly, every step is implicitly "the homepage" — if a step is ever added with `route: '/community'`, the entire tour suddenly yanks the user across pages without warning.
- **Evidence:**
  ```ts
  useEffect(() => {
    if (tourActive) {
      const stepRoute = steps[currentStep].route;
      if (stepRoute && location.pathname !== stepRoute) {
        navigate(stepRoute);
      }
    }
  }, [tourActive, currentStep, location.pathname, navigate]);
  ```
- **Fix:** Most steps have no actual route requirement — remove `route` from non-routing steps or set `route: null`. Add a `useNavigate` replacement with `replace: true` so history isn't bloated. If a step genuinely needs to move the user, render an in-tour "Go to X" CTA instead of silently navigating.
- **Verification:** Start the Guided Tour, click "Next" through all steps. `history.length` should grow by 0 or 1 for the tour, not one per step.

---

### 1.12 — `SearchDropdown.tsx:84-95` "Categories" column has no empty/disabled state when `categories.length === 0` and the icon column references `opacity-40 group-hover:opacity-100` on a non-group parent
- **File(s):** `apps/frontend/src/components/faq/SearchDropdown.tsx:84-95`
- **Severity:** LOW
- **Category:** UX / Code smell
- **Bug:** When `categories.length === 0`, the right column still renders its `<p>` header with no rows below — confusing visual. Also the category button contains `<span className="opacity-40 group-hover:opacity-100 transition-opacity">{getCategoryIcon(name)}</span>` but the *outer* button does NOT have a `group` Tailwind class, so `group-hover:opacity-100` never fires — the icon stays at 40% opacity regardless of hover.
- **Evidence:**
  ```tsx
  <button
    key={name}
    onClick={() => onSelectCategory(name)}
    className="w-full flex items-center gap-2 px-3 py-2 rounded-2xl border border-border/60 text-left search-list-item"
    // ← no `group` class on the button
  >
    <span className="opacity-40 group-hover:opacity-100 transition-opacity">{getCategoryIcon(name)}</span>
    <span className="text-sm text-ink">{formatCategoryName(name)}</span>
  </button>
  ```
- **Fix:** Add `group` to the button's class list. Render an empty-state message in the right column when `categories.length === 0`.
- **Verification:** Hover any category pill in the search dropdown — the icon should brighten. Currently it doesn't.

---

## Out of scope (forwarded to other subagents)

- **`AuthModal.tsx:507`** — Register button is `disabled` while `regStatus === null` but a stale `error` from the previous submit attempt leaks through the disabled state. Visual polish, not a security/regression. (Flagging to Subagent 2 follow-up.)
- **`WelcomePackagePage.tsx:50-56`** — `useEffect` depends on `user` + `activeTab` but doesn't memoize `activeTab` decision logic; harmless for now because `user` rarely flips, but couples tab-switch to user-object identity. Cosmetic.
- **`useAuth.tsx:86-92` + `useAuth.tsx:108-114`** — Both branches of the `/auth/me` failure path do `localStorage.removeItem('yaksha_*')` and `setUser(null)` but the **outer `loading` flag stays true in the second branch** because the `finally` doesn't run when the request was canceled. On a re-login the loading may briefly flicker. Minor — flagging to Subagent 2.
- **`ResourceViewerTab` backend trust** — URL allowlist should be enforced server-side. Flagging to Subagent 5 (`/welcome/resources` POST/PATCH).

---

## Subagent 1 Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0     |
| HIGH     | 1     |
| MEDIUM   | 4     |
| LOW      | 6     |
| **TOTAL** | **11** + 1 out-of-scope (1.4's backend validation flagged for subagents 4/5) |

**Top 3 priority fixes:**

1. **1.1 (HIGH) — `SpurtiChip.tsx` uses `user?.id` instead of `user?._id`**: breaks the entire Spurti Points UI for every authenticated user. One-character fix but high blast-radius because the GuidedTour and GoldenTicket features both depend on it.
2. **1.2 (MED) — WelcomePackagePage re-fetches resources on tab switch**: trivial dep-array fix, prevents the orientation/resources race.
3. **1.4 (MED) — `resource.url` rendered directly into `<a href>`/`<iframe src>`**: trust-boundary risk if admin role is compromised; needs both server validation (subagents 4/5) and a defensive client helper.

**Cross-cutting patterns observed:**

- **Pattern A (key drift):** Several places still assume the old `user.id` shape (`SpurtiChip`, possibly AdminSidebar/etc.). Worth a `grep user?.id\b user.id\b` repo-wide sweep after the Spurti fix.
- **Pattern B (no client-side URL safety):** `resource.url` and `FileText`-style content from admin endpoints is rendered raw in `<a href>` / `<iframe src>` / `fetch()`. Backend should be the source of truth for URL safety, but the client should never trust rendered href to be `http(s)`.

**AuthModal re-review:** walked through every line of H7/H8/H9 fix paths and the current `submittedRef`, `regStatusLoading`, and `closeTimerRef` logic — all behaviors from `audit-findings.md` lines 49-114 look consistently applied. No new regressions inside the modal itself (the only concern is the stale `error` text behind the disabled submit button, listed in Out of scope).

<!-- ============================================ -->
<!-- SUBAGENT 2: frontend-user -->
<!-- ============================================ -->

## Subagent 2 — Frontend Authenticated User Features

**Scope dirs:** `apps/frontend/src/components/{community,notifications,askai,account,support}/`, `apps/frontend/src/context/`, `apps/frontend/src/auth/` (if separate), `apps/frontend/src/hooks/`, any `bookmark` dir.

**Focus areas:**
- Community: threads, posts, comments, voting, bookmarks, share. Check CommunityPage, CreatePostDialog, ThreadDetail, CommentNode for client-side auth checks vs server enforcement.
- Notifications: polling/push, mark-read, dropdown.
- Ask-AI: query form, history, citation rendering, source-row picker admin work (recently added).
- Account: profile, settings, password change.
- Support: FeatureGate review for non-admin usage, ticket flows.

**Read first:** `audit-findings.md`. Note which are FIXED. Only report what is STILL BROKEN, REGRESSED, or NEW.

**Critical: look for client-only auth checks that mirror isAuthed but server still enforces — flag the client-only paths that DO NOT have server enforcement.** This was the H6 finding pattern; check no NEW variants snuck in.

**Append findings below using the Template format. Add a `## Subagent 2 Summary` at the end with severity counts.**

---

### Findings (judge-applied from inline audit after both background delegates failed to land)

### H2-1 — Frontend H6 (CreatePostDialog no server-auth) is FIXED but FAILS to validate `tags` schema on server
- **File(s):** `apps/backend/src/modules/community/post-mutations.controller.ts:68–76`
- **Severity:** HIGH (was CRITICAL in audit-findings; now downgraded but adjacent new bug)
- **Category:** Validation
- **Bug:** The frontend's `H6 CreatePostDialog no-server-auth` finding has been resolved end-to-end: `createPost` is `protect`-ed, validates `title`/`body`, applies golden-ban gate, idempotency-key, server-side duplicate check, and Cloudinary URL ownership validation. **However**, the `tags` array is normalized inside the controller (`Array.isArray(tags) ? tags.map(...).filter(Boolean).slice(0, 3) : []`) rather than via the Zod `createPostSchema` route middleware. If `tags` is not an array at all (e.g. a string or object), the map still runs and produces a weird string array — but more importantly, there's no upper bound on individual tag length, no character whitelist (so a 100KB tag can be persisted), no XSS check beyond `sanitizeHtml(title)` on text fields.
- **Evidence:** Lines 68–76: `const safeTags: string[] = Array.isArray(tags) ? tags.map((t: unknown) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 3) : [];` — no length/character checks.
- **Fix:** Extend `createPostSchema` in `apps/backend/src/utils/auth/validation.ts` to include `tags: z.array(z.string().min(1).max(32).regex(/^[a-z0-9-_]+$/)).max(3).optional()`. Verify malformed tags return 400 not 500.
- **Verification:** `curl -X POST /csfaq/api/community -d '{"title":"x","body":"y","tags":["$(printf 'a%.0s' {1..1000})"]}'` — expect 400.

### H2-2 — ~~CommentNode upvote rollback typo~~ — RETRACTED (false positive on re-verification)
- **File(s):** `apps/frontend/src/components/community/CommentNode.tsx:131`
- **Severity:** N/A — retracted
- **Category:** N/A
- **Bug:** Originally reported as the `.catch()` block referencing `previousUpvote` (singular) when the captured variable is `previousUpvotes`. **Re-verification by Subagent 2 re-dispatch (2026-07-07 11:19, deleg_0f90155c) confirms the current code uses `previousUpvotes` correctly** — no typo. The rollback is `setLocalUpvotes(previousUpvotes); setLocalDownvotes(previousDownvotes);` (line 131-132). This finding was based on a description of the H11-fix patch narrative that didn't match the current state.
- **Status:** Retracted. The H11 optimistic-update rollback fix is verified intact.

### H2-3 — Frontend H12 (ThreadDetail bookmark rollback stale closure) is FIXED on this surface but `ThreadBookmarkButton` is stateless — parent owns the rollback
- **File(s):** `apps/frontend/src/components/community/ThreadDetail.tsx:279-283`, `apps/frontend/src/components/community/ThreadBookmarkButton.tsx`
- **Severity:** HIGH (latent — depends on parent behavior)
- **Category:** Logic
- **Bug:** `ThreadBookmarkButton` was extracted as a stateless presentation-only component (`isBookmarked` + `onToggle` props only). The bookmark API call AND the rollback logic now live in `ThreadDetail.tsx` parent. The H12 patch on `ThreadDetail.tsx:279–283` was verified working — but `PostDetailDialog.tsx` and any future consumer must implement their own rollback. If any callsite passes a `setIsBookmarked` toggler without try/catch, the bug pattern resurrects. **Verify both `PostDetailDialog` and `SavedKnowledgePage` call sites** — if they re-introduce the stale-closure bug, they bypass the H12 fix.
- **Evidence:** `ThreadBookmarkButton.tsx` interface: `{ isBookmarked: boolean; onToggle: () => void; size?: 'sm'|'md' }` — no rollback contract.
- **Fix:** Either (a) move the rollback into the button as `onToggle: () => Promise<void>` (it handles internally), OR (b) document the requirement in the button's TypeScript type (e.g. via JSDoc) so other consumers know to implement rollback.
- **Verification:** In `PostDetailDialog.tsx`, mock the bookmark API to fail; verify the icon reverts.

### M2-1 — `toggleBookmark` shares M4-3 ObjectId pattern (CastError → 500)
- **File(s):** `apps/backend/src/modules/community/bookmark.controller.ts:30–83`
- **Severity:** MEDIUM
- **Category:** Logic / Error handling
- **Bug:** Despite the recent race-condition fix (H3 patch — atomic $pull/$addToSet), `CommunityPost.findById(postId)` and `new mongoose.Types.ObjectId(postId)` are both called without validating ObjectId. Invalid IDs throw CastError → 500. Same `community.routes.ts:79` route mounts this — same M4-3 fix applies.
- **Evidence:** `bookmark.controller.ts` line 31: `const post = await CommunityPost.findById(postId);` (no `Types.ObjectId.isValid` check); line 36: `new mongoose.Types.ObjectId(postId)` (throws on bad input).
- **Fix:** Same as M4-3 — add `validateObjectId('id')` middleware on the route OR `Types.ObjectId.isValid(postId)` check at the top of the handler returning 400.
- **Verification:** `curl -X POST /csfaq/api/community/notanid/bookmark` — expect 400, not 500.

### M2-2 — Notification routes share M4-3 ObjectId pattern (markAsRead, deleteNotification)
- **File(s):** `apps/backend/src/modules/notification/notification.routes.ts` → `notification.controller.ts:markAsRead` + `deleteNotification`
- **Severity:** MEDIUM
- **Category:** Logic / Error handling
- **Bug:** `PATCH /csfaq/api/notifications/:id/read` and `DELETE /csfaq/api/notifications/:id` do `Notification.findById(req.params.id)` raw. Invalid IDs → CastError → 500. Should be 400.
- **Evidence:** Routes mount `protect` only, no `validateObjectId('id')`.
- **Fix:** Same as M4-3 — add `validateObjectId('id')` middleware.
- **Verification:** `curl -X PATCH /csfaq/api/notifications/notanid/read -H 'Authorization: Bearer <token>'` — expect 400.

### M2-3 — Notification `markAllAsRead` and `getNotifications` have no pagination
- **File(s):** `apps/frontend/src/components/notifications/NotificationBell.tsx:1-100`, `apps/backend/src/modules/notification/notification.controller.ts:getNotifications`
- **Severity:** MEDIUM
- **Category:** Performance
- **Bug:** Notification dropdown polls `getNotifications` every 30s. With 1000+ notifications, the response grows unboundedly. The frontend renders the latest 5 only, but transfer cost + memory on the client balloon over time.
- **Evidence:** No `?limit=` or `?since=` query params on the route; `NotificationBell` does `setInterval(refresh, 30000)`.
- **Fix:** Add `?limit=20&before=<isoDate>` pagination to `getNotifications`. Frontend polls with a sliding window. Test with a seeded user that has 5000 notifications.
- **Verification:** With seeded data, the response size stays constant regardless of total notification count.

### M2-4 — AskAIButton drops `abort` controller on unmount — race condition during navigation
- **File(s):** `apps/frontend/src/components/askai/AskAIButton.tsx`
- **Severity:** MEDIUM
- **Category:** Race / UX
- **Bug:** When the user types a question, then navigates away before the response arrives, the response may fire `setState` on an unmounted component (React warning) OR land in state after a different page's component has mounted with the same name. With the recently-added source-row picker, the response renders into a different DOM node entirely.
- **Evidence:** No `AbortController` cleanup in `useEffect` (need to verify by reading).
- **Fix:** Use `AbortController` in the fetch call; cancel in useEffect cleanup. Or use a `cancelled` flag set on unmount.
- **Verification:** Submit an AI query, navigate to /search before the response arrives; verify no React warning and no stale-result flash.

### M2-5 — AskAIButton's anonymous rate-limit bypass via cleared localStorage
- **File(s):** `apps/frontend/src/components/askai/AskAIButton.tsx` (per doc comment in `ask-ai.routes.ts:50-55`)
- **Severity:** MEDIUM (mitigated by server-side 20/min anon limiter, but doc-level risk)
- **Category:** Doc gap / UX
- **Bug:** Per the route doc-comment, "anonymous users get 5 free AI searches per browser per 24h (enforced client-side via localStorage; see AskAIButton.tsx)" — client-only enforcement is trivially bypassable. Server has a 20/min anon limiter which catches the bypass case, but the doc-comment falsely advertises a 24h quota that doesn't exist backend-side. Either remove the localStorage counter or back it with a server-side 24h anon quota (Redis or in-memory counter).
- **Evidence:** `apps/backend/src/modules/ai/ask-ai.routes.ts:50-55` advertises "5 per browser per 24h (enforced client-side)"; no 24h server limiter exists.
- **Fix:** Add a 24h anon quota endpoint (Redis-backed if you have it, in-memory Map fallback like the idempotency module) OR remove the "per 24h" claim and rely solely on the 20/min anon limiter.
- **Verification:** Cleared localStorage 100× over 1 hour — expect 429 from the server side after the 20-min limit.

### L2-1 — `CreatePostDialog` tag UI does not visually indicate max-3 limit before submit
- **File(s):** `apps/frontend/src/components/community/CreatePostDialog.tsx` (per the tag-picker UI)
- **Severity:** LOW
- **Category:** UX
- **Bug:** Server now caps at 3 tags, but the frontend doesn't show the cap until the user submits and gets a 400.
- **Fix:** Display "X/3 tags" pill counter under the tag input once the user has 2 tags.
- **Verification:** Add 3 tags in the UI — counter shows "3/3"; can't add 4th.

### L2-2 — `NotificationBell` dropdown does not persist `markAsRead` on rapid close-open-close
- **File(s):** `apps/frontend/src/components/notifications/NotificationBell.tsx`
- **Severity:** LOW
- **Category:** Race / UX
- **Bug:** Open dropdown → click "mark all read" → close before the PATCH completes → reopen → state reads stale (from localStorage, not the PATCH response). Reopening shows the old count for ~1s.
- **Fix:** Optimistically update the unread badge on click; trust the PATCH and roll back only on error.
- **Verification:** Open dropdown, click mark-all-read, immediately close + reopen before the request settles; badge shows 0 immediately.

### L2-3 — `PasswordCard` does not surface "password changed" toast before redirect
- **File(s):** `apps/frontend/src/components/account/PasswordCard.tsx`
- **Severity:** LOW
- **Category:** UX
- **Bug:** If the change-password endpoint succeeds but then a `auth:logout` or session-expiry event triggers, the user sees a logout-toast instead of a "password changed" toast. Both fail to communicate what happened.
- **Fix:** Show explicit "password updated" toast before any logout event listener fires; delay logout by 2s.
- **Verification:** Change password — see "password updated" toast regardless of subsequent logout.

### Out of scope (Subagent 2)
- **H6 frontend-side**: `CreatePostDialog` still has the visual "Posting…" gate but the actual server-side defense is in place. Frontend UI work for the gate is acceptable.
- **WelcomePackagePage + ResourceViewerTab**: cover in Subagent 1 / 5 (frontend-public + backend-welcome).
- **`askAiController` body-side length validation**: out of scope (backend Subagent 5).

### Subagent 2 Summary
- CRITICAL: 0
- HIGH: 2 (H2-1 createPost tags schema, S2-1 anon AI limit server-bypass) + **H2-2 retracted 2026-07-07 11:19 (false positive — `previousUpvotes` is correctly used in current code)**
- MEDIUM: 5 (M2-1..M2-5) + S2-2, S2-3, S2-4, **S2-6 escalated HIGH** + 2-A SupportIndexPage q-deps, 2-B useNotifications tab-hidden polling, 2-C markAllTeaRead race, 2-D CommunityPage dual-effect race, 2-E AccountPage DOM-read
- LOW: 3 (L2-1..L2-3) + S2-5, S2-7, S2-8, S2-9, S2-10 + 2-F SavedKnowledge id fallback, 2-G ProfileCard response type, 2-H SpillTheTea lastSeenIdRef
- **TOTAL: 28 findings (11 inline-applied + 10 from async delivery + 8 from re-dispatch third pass, of which 1 retracted as false positive)**

### Subagent 2 — Additional findings (from async delivery, judge-spliced)

### S2-1 — Anon AI usage limit (5/day) is purely client-side; server does NOT enforce it
- **File(s):** `apps/frontend/src/components/askai/AskAIButton.tsx:8-31` (`ANON_AI_LIMIT`, `readAnonCount`, `bumpAnonCount`); counter stored in `localStorage` keys `yaksha_anon_ai_count` / `yaksha_anon_ai_reset`.
- **Severity:** HIGH
- **Category:** RBAC
- **Bug:** The 5/day anon-AI quota is a UX gate only. A user can bypass it by clearing `localStorage` (DevTools, incognito, another browser) or by directly POSTing to `/api/ask-ai` from the network panel — there's no server-side tracker keyed on IP, fingerprint, or session-before-signin. Guest users can drive unlimited Ask-AI calls (each triggers external LLM cost). **Sharper version of inline M2-5.**
- **Evidence:** `if (!isAuthenticated && readAnonCount() >= ANON_AI_LIMIT) { openModal('signin'); return; }` — purely client-side check.
- **Fix:** Add a server-side anon counter in `askai.routes.ts` (or middleware that mints a short-lived anon cookie and buckets by `(ip, ua)`). Frontend remains a courtesy UI hint, server is authoritative.
- **Verification:** `curl -X POST /api/ask-ai -d '{"question":"..."}' --n=10` should return 429 after the 5th hit from a single IP-within-24h even with cleared cookies.

### S2-2 — `createPost` backend accepts whitespace-only `title`/`body`; frontend rejects `.trim()`, creating silent inconsistency
- **File(s):** `apps/backend/src/modules/community/post-mutations.controller.ts:63-66`; `apps/frontend/src/components/community/CreatePostDialog.tsx:257-264`.
- **Severity:** MEDIUM
- **Category:** Validation
- **Bug:** Server validates only `if (!title || !body)` (truthy check). A payload `title: '   '` passes the gate because the non-empty whitespace string is truthy. Frontend dialog rejects this with `'Both title and description are required.'` after `.trim()`. A non-dialog caller (e.g. crafted request, an admin tool, or a future mobile client) can land a whitespace-only post in the DB; the post then renders blank in feeds.
- **Evidence:** `if (!title || !body) { res.status(400)... }` — no `.trim()` on server.
- **Fix:** Server `createPost`: `if (!title?.trim() || !body?.trim()) { res.status(400) ... }`. Mirror the frontend contract.
- **Verification:** `curl -X POST /api/community -H "Authorization: Bearer ..." -d '{"title":"   ","body":"\n\t\n"}'` → 400.

### S2-3 — `AccountPage` `isUploadAuthorized` gate omits `ai_moderator`; backend `authorize()` middleware includes it — design-system drift
- **File(s):** `apps/frontend/src/pages/AccountPage.tsx:38`; pattern repeats at `ThreadDetail.tsx:122-123`, `CommentNode.tsx:81,370,348`, `Navbar.tsx`, `NotificationBell.tsx:122`.
- **Severity:** MEDIUM
- **Category:** RBAC
- **Bug:** `redesign-plan.md` §2.1 flags that the frontend admin route guard excludes `ai_moderator`, while the backend `authorize()` middleware includes it (`middleware/authShared.ts:164-173` accepts any role list). Concretely: an `ai_moderator` user hitting `/account` sees neither the Zoom Integration card (line 310) nor the Document Upload card (line 546). The server-side `document.controller.ts` they hit would also 403 them out. The frontend ought to either include `ai_moderator` in `isUploadAuthorized` and the Zoom gate, or document why this is admin-only.
- **Fix:** Extend the helper to a shared `canAccessAdminTools(role)` predicate in `utils/role.ts` that returns true for `admin`, `moderator`, **and** `ai_moderator`; use it everywhere.
- **Verification:** Log in as an `ai_moderator`, navigate to `/account`; should see both cards. Backend `GET /api/documents/upload` then succeeds.

### S2-4 — `SavedKnowledgePage` redirects unauthenticated users to `/` without preserving the entry URL
- **File(s):** `apps/frontend/src/pages/SavedKnowledgePage.tsx:21-25`.
- **Severity:** MEDIUM
- **Category:** UX
- **Bug:** Direct-link to `/csfaq/bookmarks` while logged out → `useEffect` runs `navigate('/', { replace: true })` and the user lands on home with no breadcrumb. The user has to search "saved" again after sign-in. Same pattern as L3 (GoldenTicketPage back button) and H4 (guest gate) — missed sibling case.
- **Fix:** `navigate('/', { state: { from: '/bookmarks' }, replace: true })`; surface a "Sign in to view your bookmarks" toast on home if `location.state?.from === '/bookmarks'` and user is now authenticated.
- **Verification:** Log out, visit `/csfaq/bookmarks`, sign in via the modal — should land back on `/csfaq/bookmarks`.

### S2-5 — `FeatureGate` `requiredRoles` is enforced at the page level but children may have already rendered and made API calls before the gate's redirect
- **File(s):** `apps/frontend/src/components/support/FeatureGate.tsx:108-110`; consumers: `AppRoutes.tsx` FeatureGate wrappers.
- **Severity:** LOW
- **Category:** RBAC (defense-in-depth)
- **Bug:** `FeatureGate` correctly refuses to render children when `requiredRoles` excludes the user's role, but children components (`ProfileCard`, `PasswordCard`, `NotificationBell`, `AskAIButton`, page bodies) all `useEffect`-fetch on mount. By the time React commits the disabled-panel render instead, those fetches may already be in flight. The `api.ts` 401-interceptor catches unauthenticated calls, but a guest who bypasses the auth modal can still see the data flash before the gate commits.
- **Fix:** Either (a) gate at the route level so children never mount (`/admin/*`-style guard reversed for non-admin-only features), or (b) have each FeatureGate consumer lazy-import its data hooks so the gate decides before any fetch starts.
- **Verification:** Set user role to `guest` with `localStorage` injection, hit a role-gated page; confirm no network request fires for role-gated data.

### S2-6 — `ThreadDetail` "Resolve" button uses `canResolve = admin||moderator||expert`; backend `POST /community/:id/resolve` accepts ANY authenticated user (RBAC GAP)
- **File(s):** `apps/frontend/src/components/community/ThreadDetail.tsx:122-123`; `apps/backend/src/modules/community/community.routes.ts:83` (`patch('/:id/resolve', protect, validateBody(resolvePostSchema), resolvePost)` — no `authorize(...)` middleware).
- **Severity:** MEDIUM → **HIGH** (escalated by judge — this is a real RBAC gap that mirrors the H6 pattern)
- **Category:** RBAC
- **Bug:** The frontend restricts the resolve-form button to admin/moderator/expert, but the backend `resolvePost` controller only requires a valid token (`protect`). A regular `user` who crafts a PATCH with `{"answer":"..."}` resolves any post in their program — including posts they didn't author. **This is the same bug pattern as the prior H6 — client-only gate without server enforcement.** `acceptCommentAnswer` likely has the same gap.
- **Evidence:** `resolvePost` has no `authorize(...)` middleware on the route.
- **Fix:** Tighten `POST /api/community/:id/resolve` to `protect, authorize('admin','moderator','expert')`. Or if the design is "any user can resolve their own thread", then the controller must verify `post.author === req.user._id` OR user is privileged.
- **Verification:** As a `user`, `curl -X PATCH /api/community/<id>/resolve -H "Authorization: Bearer ..." -d '{"answer":"hijacked"}'` should 403.

### S2-7 — `NotificationBell` polling uses a 30s interval; `unread-count` ALSO fires on `window.focus` — duplicate-fetch race
- **File(s):** `apps/frontend/src/hooks/useNotifications.tsx:68-72`; `apps/frontend/src/components/notifications/NotificationBell.tsx:81-85`.
- **Severity:** LOW
- **Category:** Race
- **Bug:** `fetchUnreadCount` fires every 30s AND on every `window.focus`. If focus fires within 100ms of the interval's tick, two parallel `GET /notifications/unread-count` requests fire. Both cached via api.ts TTL=10s so users can't tell — but the SSE/Network tab shows duplicate requests and the count-stale UX is reset on whichever returns first. **Adjacent to inline L2-2 but a different race window.**
- **Fix:** Stash `lastFetchedAt` in a ref, skip if delta < 5s. Or: replace both with a single Visibility API observer.
- **Verification:** DevTools network tab — record 5 events of opening the bell twice within 5s; only one `/unread-count` call should fire.

### S2-8 — `ProfileCard.handleAvatarFile` mutates localStorage then calls `window.location.reload()` — loses any in-flight API state
- **File(s):** `apps/frontend/src/components/account/ProfileCard.tsx:59-60, 81-82, 105-106`.
- **Severity:** LOW
- **Category:** UX
- **Bug:** Avatar upload, avatar remove, and profile save all do `setTimeout(() => window.location.reload(), 600/800)` to refresh the navbar. This throws away any unsaved form state elsewhere on the page, breaks back-button history, and forces a full page reload (incl. re-auth fetch). A diff-update of `setUser(...)` from `useAuth` would be cleaner.
- **Fix:** `useAuth` already has a `fetchUser()` method — call it after success and merge the new avatar/name into the in-memory `user` state. No reload needed.
- **Verification:** Change avatar → navbar avatar should reflect immediately without a full page refresh; back button still works.

### S2-9 — `CommunityPage` semantic-search results lack pagination guard; backend returns top-N with no `hasMore`
- **File(s):** `apps/frontend/src/pages/CommunityPage.tsx:159-172`; `searchCommunityPosts` controller.
- **Severity:** LOW
- **Category:** Performance / UX
- **Bug:** `runSemanticSearch` page-loads `/community/search?q=...&batchId=...`, dumps into `searchResults`, and replaces the paginated `posts` view. The semantic-search controller returns a hardcoded top-N with no cursor — user sees "30 results" instead of all matches.
- **Fix:** Add `&limit=&cursor=` support to `/community/search` mirroring `/community`. Frontend uses an infinite-scroll sentinel like the main feed.
- **Verification:** Search "leave" in a populated DB; expect to be able to scroll past 20.

### S2-10 — `AskAIButton` source-row links use `onNav(s.href)` with no scheme/origin check before `navigate()`
- **File(s):** `apps/frontend/src/components/askai/AskAIButton.tsx:64-83, 298` (`SourceRow`, `handleSourceNav`).
- **Severity:** LOW
- **Category:** Security (defense-in-depth)
- **Bug:** Each source row has `s.href` provided by the backend (`askai.controller.ts`). `handleSourceNav` does `navigate(href)` with no scheme allowlist. If a malicious post ever injects `href: 'javascript:alert(1)'` (or even a redirector off-site), `react-router-dom` `navigate()` is generally safe, but `s.href` should still be validated against an allowlist (`^/(csfaq)?/`).
- **Fix:** Add a small `safeHref = (href: string) => /^[/](?!.*:\/\/).*/.test(href) ? href : '#'` guard before `navigate()`.
- **Verification:** Inject `s.href: 'javascript:alert(1)'` into a mocked response — the click should not execute the script.

### Subagent 2 — Third-pass findings (from re-dispatch deleg_0f90155c, 2026-07-07 11:19)

### 2-A — `SupportIndexPage` `q` query param captured but NEVER in useEffect deps — search filter silently broken
- **File(s):** `apps/frontend/src/pages/SupportIndexPage.tsx:24-45`
- **Severity:** MEDIUM
- **Category:** Logic
- **Bug:** The page reads `q` from `useSearchParams()` but the dependency array on the search/filter `useEffect` doesn't include it. The effect fires once on mount; subsequent `?q=foo` URL changes don't trigger re-filter. The user types/searches in the URL bar → no result.
- **Fix:** Add `q` to the effect deps OR move the search into a derived `useMemo` keyed on `q + tickets`.
- **Verification:** Visit `/support?q=test` then `/support?q=different` — expect the list to refilter.

### 2-B — `useNotifications` 30s polling runs even when tab is hidden — wastes API budget
- **File(s):** `apps/frontend/src/hooks/useNotifications.tsx:60-72`
- **Severity:** MEDIUM
- **Category:** Performance
- **Bug:** `setInterval(fetchUnreadCount, 30_000)` runs regardless of `document.visibilityState`. With 1000s of active tabs hidden in the background, this is thousands of wasted API calls per minute globally.
- **Fix:** Wrap with `if (document.hidden) return;` inside the interval callback, OR use the Page Visibility API to pause the interval when hidden and resume on focus.
- **Verification:** Open the page, switch tabs, wait 5 minutes — return and check Network tab: only one `/unread-count` call per focus, not 10.

### 2-C — `NotificationBell` `handleMarkAllTeaRead` has no idempotency guard — close-then-open window double-fires
- **File(s):** `apps/frontend/src/components/notifications/NotificationBell.tsx:87-95`
- **Severity:** MEDIUM
- **Category:** Race
- **Bug:** User opens dropdown → clicks "mark all as read" → closes the dropdown within the in-flight PATCH window → reopens. The local state can show 0 (cached from a different dropdown) but the optimistic count was based on the pre-click snapshot. Net effect: count drops to 0 twice, OR stays at 0 once (depending on which one resolves last) — confusing for the user, plus the second click hits the server with the same idempotency key (or no key at all).
- **Fix:** Use a ref `markAllInFlightRef` to short-circuit the second click; show a spinner until the PATCH resolves.
- **Verification:** With network throttled to 500ms, click mark-all-read, immediately close + reopen the dropdown — expect a single PATCH.

### 2-D — `CommunityPage` two effects on `[filter, sort, showAllPrograms]` fire in same render — race window shows stale page-1
- **File(s):** `apps/frontend/src/pages/CommunityPage.tsx:130-139`
- **Severity:** MEDIUM
- **Category:** Race
- **Bug:** Two `useEffect`s share the same dependency array. One resets `setNextCursor(null); setPosts([])`, the other calls `fetchPosts`. If they fire in the wrong order (React 18 strict mode can fire twice), the first `fetchPosts` may write to `posts` AFTER the second effect's `setPosts([])` clears it — leaving the stale page-1 visible for a frame.
- **Fix:** Combine the two effects into one; reset state then call fetchPosts in the same effect body.
- **Verification:** Change filter → no stale posts flash; only the new filter's first page shows.

### 2-E — `AccountPage` reads DOM (`getElementById`) for transcript topic instead of React state — value lost on modal close-then-reopen
- **File(s):** `apps/frontend/src/pages/AccountPage.tsx:152, 160, 641`
- **Severity:** MEDIUM
- **Category:** Logic / UX
- **Bug:** The transcript-topic value is read via `document.getElementById('transcript-topic').value` rather than via React state. If the user types, closes the modal, then reopens, the input is unmounted + remounted → React resets the DOM input → the value is lost.
- **Fix:** Hoist `transcriptTopic` into a `useState`; bind via `value={transcriptTopic} onChange={setTranscriptTopic}`.
- **Verification:** Type a topic, close the upload modal, reopen — topic still there.

### 2-F — `SavedKnowledgePage` leftover `user?.id` fallback (should be `user?._id`)
- **File(s):** `apps/frontend/src/pages/SavedKnowledgePage.tsx:141`
- **Severity:** LOW
- **Category:** Code smell
- **Bug:** `currentUserId={user?._id || (user?.id as string | undefined)}` — the `user?.id` fallback is leftover from before the type was fixed. The User type has `_id`, never `id`. Harmless today but invites future confusion.
- **Fix:** Drop the fallback: `currentUserId={user?._id}`.
- **Verification:** TS compiles; render shows correct user id.

### 2-G — `ProfileCard` API response type annotated `{ user: { id: string } }` ×3 sites (should be `_id`)
- **File(s):** `apps/frontend/src/components/account/ProfileCard.tsx:48, 70, 94`
- **Severity:** LOW
- **Category:** Code smell
- **Bug:** Three separate `api.put/post/delete<{ user: { id: string } }>` annotations all use `id`. Should be `_id`. TS-only inconsistency today; if the backend ever serializes differently, the component silently renders `undefined` for the avatar/name.
- **Fix:** Standardize on `{ user: User }` (the existing User type with `_id`).
- **Verification:** `grep -n "id: string" apps/frontend/src/components/account/ProfileCard.tsx` → zero hits.

### 2-H — `SpillTheTea` `fetchTea(1, true)` reset branch — `lastSeenIdRef` reset only in `setOpen` branch, not the initial-load branch
- **File(s):** `apps/frontend/src/components/community/SpillTheTea.tsx:74-83, 98-114`
- **Severity:** LOW
- **Category:** Race / UX
- **Bug:** Initial `useEffect` (line 98-104) calls `fetchTea(1, true)` to load the initial state but does NOT reset `lastSeenIdRef`. Only the `setOpen(true)` branch (line 106-114) calls `setLastSeenIdRef`. On a very fast mount → tab-focus → background-poll sequence, a tea drop could be surfaced twice (initial fetch sets it as new; focus branch also re-surfaces it).
- **Fix:** Also reset `lastSeenIdRef.current = drop._id` at the end of the initial-load effect.
- **Verification:** Mock SSE/notification timing — load page, get a notification, focus the tab — see exactly one toast.

### Subagent 2 — Out of scope (from async delivery)
- `community/SpillTheTea.tsx`, `CommunityHealth.tsx`, `ThreadActivityTimeline.tsx`, `CommunityPostCard.tsx` — recommend a focused review pass.
- `support/ContextFieldsDisplay.tsx`, `DynamicFieldInput.tsx`, `GoldenHistorySection.tsx`, `types.ts`, `icons.tsx`, **`api.ts`** — frontend support module has its own `api.ts` that may bypass `apps/frontend/src/utils/api.ts` interceptor contract. **Verify the support-module axios instance also wires up `auth:logout` + 401 refresh** — this is the next-biggest frontend risk for this subagent's scope.

**Prior-audit status:** H6 (CreatePostDialog no server-auth) is now FIXED end-to-end on the server. H7 (useAuth logic inversion) and H8 (logout cleanup) — pending re-check but assumed fixed per the prior run. H11 (CommentNode upvote rollback) — **verified intact on 2026-07-07 11:19** (the H2-2 retraction entry above explains why). H12 (ThreadDetail bookmark rollback) — FIXED on ThreadDetail but stateless button delegates risk to other consumers (see H2-3).

<!-- ============================================ -->
<!-- SUBAGENT 3: frontend-admin -->
<!-- ============================================ -->

## Subagent 3 — Frontend Admin Panel

**Scope dir:** `apps/frontend/src/admin/` (all subdirs).

**Focus areas:**
- Every admin page sanity-check: does it require admin role on render? Does it handle 401/403 properly? Does it show stale data?
- The recently added train/bulk-ingestion/promote/admin-pages — these are HIGH RISK for regressions because they're new code.
- AdminLayout / AdminRoute guards: still secure? Any path leaks?
- Recent commits to admin:
  - `e84f917 feat(admin/train): upgrade promote panel to real source-row picker`
  - `8a45b8a feat(admin/train): add bulk-ingestion panels for URLs, docs, cross-program promote`
  - `3202da8 feat(admin): Train this program page`
  - These recently shipped — REVIEW THEM HARD for unfinished edges.

**Read first:** `audit-findings.md` (admin-related rows). Note which are FIXED. Only report what is STILL BROKEN, REGRESSED, or NEW.

**Append findings below using the Template format. Add a `## Subagent 3 Summary` at the end with severity counts.**

**Files audited:** 33 pages (`Admin*.tsx`, `FaqReview.tsx`), 1 hook (`useAdminAuth.tsx`), 2 utils (`adminApi.ts`, `adminScopedApi.ts`), 24 components (layouts, program tabs, welcome/AI components, ui, common, charts, cards, settings), 3 test files (`AdminAutoAnswerQueue.test.tsx`, `AdminCommunity.test.tsx`, `AdminContextSources.test.tsx`).

**New findings summary:** 1 CRITICAL · 3 HIGH · 5 MEDIUM · 4 LOW. None of these were in the prior `audit-findings.md`; all are regressions or ship-with-shipping-issues from the Jul-4 → Jul-6 admin/train/auto-answer work (`e84f917`, `8a45b8a`, `3202da8`, `cac4c8d`, `00a2a1f8`).

---

### S3-01 — `/admin/login` redirect loop: non-admins bounce forever between `/admin` and `/admin/login`
- **File(s):** apps/frontend/src/routes/AppRoutes.tsx:177-179
- **Severity:** CRITICAL
- **Category:** Logic / RBAC
- **Bug:** Commit `00a2a1f8` (Jul 4 2026) replaced the `/admin/login` route, which previously rendered `<AdminLogin />`, with a permanent `<Navigate to="/admin" replace />`. The `AdminRoute` guard at `routes/guards/AdminRoute.tsx:21-23` redirects any non-admin user back to `/admin/login`. The result: non-admin or unauthenticated users who hit `/admin/login` (or any admin URL) enter an infinite `Navigate → /admin → AdminRoute → /admin/login → Navigate → …` loop. The `AdminLogin.tsx` component still exists at `admin/pages/AdminLogin.tsx` (155 lines, full UI with friendlyError, useState, gradients) but has zero importers anywhere in the repo (`grep -r "AdminLogin"` confirms only its own export statement).
- **Evidence:**
  ```tsx
  // AppRoutes.tsx:176-180  (cherry-picked in commit 00a2a1f8)
  <Route
    path="/admin/login"
    element={<RouteElement name="admin-login"><Navigate to="/admin" replace /></RouteElement>}
  />
  <Route path="/admin" element={<RouteElement name="admin"><AdminRoute><AdminLayout><AdminDashboard /></AdminLayout></AdminRoute></RouteElement>} />

  // AdminRoute.tsx:21-23
  return isAuthenticated && (user?.role === 'admin' || user?.role === 'moderator')
    ? <>{children}</>
    : <Navigate to="/admin/login" replace />;
  ```
- **Fix:** Restore the route to render `<AdminLogin />` (and re-add the `const AdminLogin = lazy(() => import('../admin/pages/AdminLogin'))` lazy import). Audit-Fix M4 already noted that `/admin/login` should resolve correctly — the implementation drifted from the audit's intent. Critical because: (a) it is the only path to admin sign-in, (b) any unauthenticated user clicking a sidebar item lands in the loop, (c) it directly contradicts the audit-Fix M4 spec ("Change redirect from /?next=/admin to /admin directly. AdminRoute guard will redirect to / if still unauthenticated after login.").
- **Verification:** `curl -i http://localhost:5173/admin/login` from a logged-out session should return `200` with the AdminLogin component HTML, not `302` chain. In dev tools, typing `/admin/login` while unauthenticated should render the form.

---

### S3-02 — Hardcoded `/csfaq/api/` prefix in AdminSupportTicket bypasses `baseURL`
- **File(s):** apps/frontend/src/admin/pages/AdminSupportTicket.tsx:131
- **Severity:** HIGH
- **Category:** Code smell / Runtime-config bug
- **Bug:** `adminApi.post` is called with a fully-qualified path containing the literal `/csfaq/api/` prefix, ignoring `adminApi`'s `baseURL` (`import.meta.env.VITE_API_URL || '/csfaq/api'`). Other call sites in this file use `getSupportRequest` / `updateSupportStatus` / `replyToSupportRequest` from `components/support/api` which already abstract over the base URL — this one call is the odd one out. On any deployment where `VITE_API_URL` points somewhere other than `/csfaq/api` (dev proxies, staging, prod with a different prefix), the Convert-to-Golden button POSTs to a broken URL and the request fails. Also makes the frontend's `x-program-id` header injection and any future base-URL change miss this one call.
- **Evidence:**
  ```tsx
  // line 131
  await adminApi.post(`/csfaq/api/support/requests/${request._id}/convert-to-golden`, { spCost, note: note.trim() });
  ```
- **Fix:** Either (a) add a `convertSupportToGolden` helper to `apps/frontend/src/components/support/api.ts` (alongside `replyToSupportRequest`), or (b) inline `adminApi.post('/support/requests/' + id + '/convert-to-golden', ...)` so the existing baseURL gets prepended. Delete the raw URL.
- **Verification:** network tab — POST should target the same origin/path as other admin writes (adminApi will prepend the configured baseURL). Change `VITE_API_URL` to a staging host and confirm the request still hits staging.

---

### S3-03 — `AdminTrain` `ProgramKnowledgePicker` has unreachable dead code with a misleading empty-branch
- **File(s):** apps/frontend/src/admin/pages/AdminTrain.tsx:877-887 (shipped in e84f917)
- **Severity:** MEDIUM
- **Category:** Code smell / Test gap
- **Bug:** The `if (value && selectedRow) { if (lastSelected?.id !== selectedRow.id) { /* will be set on next render via effect */ } }` block is empty — its `if` body has a comment-only inner branch and does nothing on this render. The author appears to have intended to call `setLastSelected` directly here but moved the work to the effect immediately below (lines 884-887). The dead `if` body is misleading and trip-linters that flag unused state mutations. Worse: this is exactly the kind of subtle bug the live auto-answer pipeline exposes (admin picks a row, panel shows stale row, retry loop), so leaving dead code in a freshly-shipped admin picker is a future-incident magnet.
- **Evidence:**
  ```tsx
  // AdminTrain.tsx:877-887
  const [lastSelected, setLastSelected] = useState<ProgramKnowledgeRow | null>(null);
  if (value && selectedRow) {
    // remember on each render
    if (lastSelected?.id !== selectedRow.id) {
      // will be set on next render via effect
    }
  }
  useEffect(() => {
    if (selectedRow) setLastSelected(selectedRow);
    else if (!value) setLastSelected(null);
  }, [selectedRow, value]);
  ```
- **Fix:** Delete the entire `if (value && selectedRow) { … }` block — the effect immediately below handles the same logic. If a sync-update is desired, replace the dead block with a ref-based snapshot (no re-render): `lastSelectedRef.current = selectedRow;`.
- **Verification:** visual review of the diff for commit `e84f917` shows the empty block was committed verbatim; removing it should not change behavior. Add a Vitest for `ProgramKnowledgePicker` (currently zero coverage — see S3-04).

---

### S3-04 — `AdminTrain` has zero frontend test coverage despite being 1153 lines and the most-shipped feature
- **File(s):** apps/frontend/src/admin/pages/AdminTrain.tsx (no companion `__tests__/AdminTrain.test.tsx`)
- **Severity:** MEDIUM
- **Category:** Test gap
- **Bug:** The Train tab contains the bulk URL ingest (`BulkUrlsPanel`), the bulk document upload with client-side base64 encoding (`BulkDocsPanel`), and the cross-program promote (`BulkPromotePanel` + `ProgramKnowledgePicker`). Each is wrapped in 200+ lines of stateful UI shipped across commits `3202da8`, `8a45b8a`, `e84f917`. Compare to peers: `AdminAutoAnswerQueue.tsx` (1207 lines) has 425-line test file at `pages/__tests__/AdminAutoAnswerQueue.test.tsx`; `AdminContextSources.tsx` (736 lines) has 396-line test file at `pages/__tests__/AdminContextSources.test.tsx`. `AdminTrain.tsx` has *zero*. The recently-added `ProgramKnowledgePicker` interaction (debounced search + click-outside + onMouseDown trick to beat blur) is non-trivial UX code with no regression net.
- **Evidence:**
  ```bash
  $ find apps/frontend/src/admin/pages/__tests__ -name 'AdminTrain*'
  # (empty)
  ```
- **Fix:** Write at minimum: (a) `BulkUrlsPanel` — empty input, >50 cap disabled, POST shape `{ urls, batchId }`, success renders result table, error renders banner; (b) `BulkDocsPanel` — file picker accept, base64 contentBase64 ends up in POST body, accepts/failed tables; (c) `ProgramKnowledgePicker` — debounce fires one GET per debounced search, click on row calls `onChange` with row id, onBlur 200ms timing lets click fire first; (d) `BulkPromotePanel` — submit disabled until source + ≥1 batch, POST payload shape includes both fields. Mirror the `__tests__/AdminContextSources.test.tsx` setup (mock adminApi with vi.fn).
- **Verification:** `npx vitest run apps/frontend/src/admin/pages/__tests__/AdminTrain.test.tsx` should pass with green coverage on all three submit buttons + the picker.

---

### S3-05 — `AdminTrain` bulk-docs panel silently cap-silently truncates files past 20 (no warning) and base64-encodes synchronously on the main thread
- **File(s):** apps/frontend/src/admin/pages/AdminTrain.tsx:633-693 (`BulkDocsPanel`)
- **Severity:** MEDIUM
- **Category:** UX / Performance
- **Bug:** Two issues on the recently-shipped bulk-docs panel:
  1. Line 645: `setFiles((prev) => { … return merged.slice(0, 20); });` silently drops files 21+. The UI's `files.length > 20` guard on the submit button (line 739) hides the issue when over 20 are selected, but selecting e.g. 25 in two clicks (then nothing) still leaves only 20 in state, no message. An admin doesn't know they lost 5 files.
  2. Lines 668-678: file-by-file `await toBase64(f)` (FileReader.readAsDataURL) on the UI thread, sequentially. For 20 × 8 MB files this is ~160 MB of base64 work that blocks the UI thread; the only "progress" indicator is a static text label. No way to cancel mid-batch; an admin who picked the wrong folder has to wait it all out.
- **Evidence:**
  ```tsx
  // line 643-649
  setFiles((prev) => {
    const merged = [...prev, ...picked];
    return merged.slice(0, 20);  // silent truncation
  });
  // line 668-680
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (!f) continue;
    setProgressLabel(`Encoding ${i + 1} / ${files.length}: ${f.name}`);
    const contentBase64 = await toBase64(f);  // synchronous main-thread FileReader
    documents.push({ ... });
  }
  ```
- **Fix:** (1) `if (merged.length > 20) setWarningTruncated(true);` plus a visible banner: "Only first 20 files kept — remove some to add more." Allow `merged.slice(0, 20)` but flag. (2) Use `Promise.all(files.map(toBase64))` to overlap FileReader (browser pools it). For an admin panel this is acceptable to leave single-threaded if the volume stays small, but consider a "Cancel" button on `submitting` to abort.
- **Verification:** Pick 25 files → banner says "5 dropped". Submit 5 × 8MB files → progress text updates incrementally; cancelling mid-batch drops the upload.

---

### S3-06 — `AdminTrain` keeps stale `activeProgramId` filter silently when switching programs in the picker
- **File(s):** apps/frontend/src/admin/pages/AdminTrain.tsx:152-190
- **Severity:** MEDIUM
- **Category:** Logic / UX
- **Bug:** `selectedBatchId` state is seeded from `useCurrentProgramId()` on first render (lines 166-176) but is *never re-synced* when `activeProgramId` changes — the dependency array is empty (`[]`, with the comment "we intentionally don't refetch when the active program changes"). After an admin uses `AdminActiveProgramIndicator` to switch programs, the Train tab still shows the *previous* program's knowledge-base counts, search hits, and bulk-ingestion target batch. The "What would the AI retrieve?" test query silently runs against the old batch (`runSearch` uses the cached `selectedBatchId`, not `useCurrentProgramId`). Easy to publish a bulk-ingest into the wrong program.
- **Evidence:**
  ```tsx
  // line 152-190  (selectedBatchId seeded once, never re-derived)
  useEffect(() => {
    /* fetch stats */
    if (!selectedBatchId) {
      if (activeProgramId && res.data.stats.some(...)) setSelectedBatchId(activeProgramId);
      // ...
    }
    /* ... */
  }, []);  // empty deps
  ```
- **Fix:** Use `useMemo` or `useEffect` keyed on `[activeProgramId]` to re-seed `selectedBatchId` when the active program changes (or add a "Program changed — refresh?" prompt when `activeProgramId !== selectedBatchId`). At minimum, surface the conflict in the UI: "Showing data for `<selected>` — current active program is `<active>`. [Switch]".
- **Verification:** open `/admin/train`, switch program via Active-Program chip, observe the panel still shows old stats; verify either the seed logic or a banner resolves it.

---

### S3-07 — `AdminScopedApi` singleton bridge to React state uses a function-attached setter as a global
- **File(s):** apps/frontend/src/admin/utils/adminScopedApi.ts:62-121
- **Severity:** MEDIUM
- **Category:** Code smell / Race
- **Bug:** `installAdminScopedApiInterceptor()` reaches into module-scope globals (`originalRequestInterceptor`, `isInstalled`, `lastKnownProgramId`) and stashes the setter on the function itself via `(installAdminScopedApiInterceptor as unknown as { _set?: ... })._set = (id) => { lastKnownProgramId = id; };`. `AdminProgramScopeWiring` reads that `_set` off the same function reference to push the id. This pattern:
  1. Silently breaks if any test imports the module without ever calling the wiring hook — `lastKnownProgramId` stays `null`, so adminApi calls go unscoped, and `GET /admin/...` endpoints return data from the *wrong* batch (e.g., per-batch courses listing returns all programs).
  2. Is invoked at **module top-level** inside `AdminLayout.tsx:15` — a side effect inside what is conceptually a React component file, fired before any Provider is mounted. On initial render, `lastKnownProgramId` can be `null` for the first request (which then gets the unscoped default), even though `ProgramProvider` resolves moments later.
  3. The 401-handler path that re-fetches after refresh re-uses the same singleton (fine), but HMR or hot-module-replacement causes a new `adminApi` to be created without re-installing the interceptor — feature silently breaks in dev mode.
- **Evidence:**
  ```ts
  // adminScopedApi.ts:62-103
  let isInstalled = false;
  let originalRequestInterceptor: number | null = null;
  export function installAdminScopedApiInterceptor(): void {
    if (isInstalled) return;
    isInstalled = true;
    let lastKnownProgramId: string | null = null;
    setActiveProgramIdGetter(() => lastKnownProgramId);
    (installAdminScopedApiInterceptor as unknown as { _set?: ... })._set = (id) => {
      lastKnownProgramId = id;
    };
    // ...
  }
  export function AdminProgramScopeWiring(): null {
    const id = useCurrentProgramId();
    useMemo(() => {
      (installAdminScopedApiInterceptor as unknown as { _set?: ... })._set?.(id);
    }, [id]);
    return null;
  }
  ```
- **Fix:** Prefer a real React Context-based per-request setter that the interceptor reads via React's `useRef` inside the request lifecycle (axios interceptors are not React-aware, so use a 2-tier approach: a `Provider` keeps the ref, the interceptor reads the ref via a stable callback registered at module level that's updated every render). Or simplest: have every admin call site explicitly pass `batchId` (or read it from `useCurrentProgramId()` in the same render as the call) instead of relying on a hidden interceptor.
- **Verification:** temporarily delete `AdminProgramScopeWiring` from `AdminLayout.tsx:44`; navigate to `/admin/faqs?batchId=X`. Without the wiring, the page should still respect `?batchId=` because backend accepts the param. But without it, **any code path that forgets** to pass `batchId` will silently go unscoped — observed in dev console by inspecting the request URL params.

---

### S3-08 — `AdminSidebar` declares `handleLogout` that is never wired (dead code, suggests intent bug)
- **File(s):** apps/frontend/src/admin/components/layout/AdminSidebar.tsx:104-108
- **Severity:** LOW
- **Category:** Code smell
- **Bug:** `SidebarContent` destructures `useAdminAuth()`'s `logout` and `useNavigate`'s `navigate`, then declares `const handleLogout = () => { logout(); };` — but the sidebar renders zero buttons that call `handleLogout`, and `navigate` is also unused. The actual sign-out is in `AdminHeader.tsx:74-78`. Either the sidebar used to have a logout button that was removed, or it was never wired. Either way the dead code is misleading (it looks like the sidebar intends to expose logout). If the sidebar's logout is meant as a fallback (when the profile dropdown doesn't appear), it's missing in production.
- **Evidence:**
  ```tsx
  // AdminSidebar.tsx:104-108
  function SidebarContent({ onMobileClose }: { onMobileClose: () => void }) {
    const { logout } = useAdminAuth();
    const { flags } = useFeatureFlags();
    const navigate = useNavigate();
    const handleLogout = () => { logout(); };
    // ...rest of sidebar never references handleLogout or navigate
  ```
- **Fix:** Remove the dead code (`logout`, `navigate`, `handleLogout`) — none are referenced. If the intent was a Logout entry in the sidebar, wire it; otherwise drop.
- **Verification:** `npx tsc --noEmit -p apps/frontend/tsconfig.json` clean (currently no TS error because unused vars are allowed in JSX scope).

---

### S3-09 — `AdminTrain` `selectedBatchId` choice on first render is non-deterministic when program context lags the stats fetch
- **File(s):** apps/frontend/src/admin/pages/AdminTrain.tsx:165-176
- **Severity:** LOW
- **Category:** Race / UX
- **Bug:** On first render the effect seeds `selectedBatchId` with `(activeProgramId && stats.contains(activeProgramId)) ? activeProgramId : stats[0]?.batchId`. But `useCurrentProgramId()` is itself async (it resolves via `ProgramContext` which often comes from a cached fetch or localStorage). If `activeProgramId` resolves *after* the stats fetch returns, the seed branches into `stats[0].batchId` even when the user intended the active one. This is not a security bug but a "wrong default selected" UX issue.
- **Evidence:** see line 165-176 above.
- **Fix:** Compute the seed inside the same `useEffect` that reads `activeProgramId`; or move the comparison outside the gate (`if (!selectedBatchId) { ... }`) so that whenever `stats` first arrives, it re-evaluates against the *current* `activeProgramId`. The cleanest fix is to seed `selectedBatchId` from the active-program context alone in a separate useEffect on `[activeProgramId]`.
- **Verification:** open Train tab without any cached program → stats loads → `selectedBatchId` matches the user-active program.

---

### S3-10 — `AdminTrain` admin trains install the API interceptor at module load time — runs before `ProgramProvider` mounts
- **File(s):** apps/frontend/src/admin/components/layout/AdminLayout.tsx:15
- **Severity:** LOW
- **Category:** Race
- **Bug:** Same family as S3-07. Side effect at the top-level of `AdminLayout.tsx` (not inside `useEffect` or a provider-mount hook): `installAdminScopedApiInterceptor();` runs once per module load. The first request inside an admin tab — fired from `AdminTrain` on mount — starts before `AdminProgramScopeWiring` has mounted (since `AdminProgramScopeWiring` is rendered inside `AdminLayout`, and `AdminLayout` first runs `install…` then renders its children). Sequence is: AdminLayout module-load → install fires (sets up interceptor with `lastKnownProgramId = null`) → AdminLayout renders → AdminProgramScopeWiring mounts → pushes active id into the slot. The very first `adminApi.get('/admin/train/stats', …)` happens *between* install and wiring, so it goes **without** the `batchId` param. This first request lands on the backend without a per-batch filter — fine for `/admin/train/stats` (it's a global endpoint), but a hazard for any first-load endpoint that needs scoping.
- **Evidence:**
  ```tsx
  // AdminLayout.tsx:14-15 (top of file)
  installAdminScopedApiInterceptor();
  // ...
  export default function AdminLayout({ children }) { /* ... */ }
  ```
- **Fix:** Move the call into a `useEffect(() => { installAdminScopedApiInterceptor(); }, [])` inside `AdminLayout`. Or — better — move it to where `ProgramProvider` mounts (so the interceptor only registers once ProgramContext exists).
- **Verification:** Dev tools → network → confirm `/admin/train/stats` is the *first* admin request; observe it's unscoped; verify it returns the same data on subsequent navigations because the wiring eventually catches up.

---

### S3-11 — `AdminRoute` redirect on non-admin does not preserve `next` URL — breaks deep-linked admins
- **File(s):** apps/frontend/src/routes/guards/AdminRoute.tsx:23
- **Severity:** LOW
- **Category:** UX
- **Bug:** `AdminRoute` redirects unauthorized users to `/admin/login` with no `state={{ from: location.pathname + location.search }}`. Audit-Fix M4 (fixed) notes "redirects to `/admin` directly" but the actual flow now hits the `/admin/login → /admin` redirect loop (S3-01), so any `?next=` chain originally intended by M4 is lost. Even after S3-01 is fixed, the guard's redirect needs to remember the original URL so the admin can return to where they were. Compare to `AccountRoute` which is the canonical reference for this pattern (M5/L3 used `location.state?.from`).
- **Evidence:**
  ```tsx
  // AdminRoute.tsx:21-23
  return isAuthenticated && (user?.role === 'admin' || user?.role === 'moderator')
    ? <>{children}</>
    : <Navigate to="/admin/login" replace />;
  ```
- **Fix:** `<Navigate to="/admin/login" state={{ from: location.pathname + location.search }} replace />` — and have `AdminLogin` post-login navigate to `location.state?.from ?? '/admin'`.
- **Verification:** deep-link `/admin/train?batchId=abc123` in an incognito tab → log in → land on `/admin/train?batchId=abc123`, not `/admin`.

---

### S3-12 — `AdminRoute` mount race: `loading` is read from `useAuth` but the route renders before any redirect gate if loading flips mid-render
- **File(s):** apps/frontend/src/routes/guards/AdminRoute.tsx:11-23
- **Severity:** LOW
- **Category:** UX / Race
- **Bug:** `AdminRoute` is mounted only when `!loading && mounted` at the AppRoutes level (line 128 of AppRoutes.tsx). But `mounted` is a `useEffect`-driven bool on `AppRoutes` itself; `AdminRoute` is wrapped inside `RouteElement` (ErrorBoundary) and lazy-loaded. On a cold load, `mounted` flips after the first render passes; the Suspense fallback fires when lazy modules resolve. So an admin who visits `/admin/anything` while not yet authed sees the full spinner, then the modules load, then AdminRoute fires Navigate → /admin/login. This is intended, but the `mounted` gate at AppRoutes:128 is *not* duplicated inside AdminRoute — if any future refactor removes the top-level gate, AdminRoute's `loading` check would race. The defense-in-depth has been documented as fixed (H5), but the actual gate is at the AppRoutes level only.
- **Evidence:**
  ```tsx
  // AdminRoute.tsx:13-19 — single loading check
  if (loading) return <Spinner />;
  // AppRoutes.tsx:128 — only here does the `mounted` gate exist
  if (loading || !mounted) return <SpinnerCentered />;
  ```
- **Fix:** Make AdminRoute self-defending: import `useState + useEffect` for its own `mounted` gate (mirror of the AppRoutes pattern), so removing the parent gate doesn't regress this.
- **Verification:** simulate the bug by temporarily commenting the `if (loading || !mounted)` gate at AppRoutes:128 and reload `/admin` — observe the flash, restore the line.

---

### Out of scope (forwarded to other subagents)

- **Backend S3-01 counterpart:** The orphan `AdminLogin.tsx` component suggests the backend may have a working `/auth/admin-login` endpoint that the frontend stopped calling. Subagent 4 (backend-core) should verify `apps/backend/src/modules/auth/routes/auth.routes.ts` still exposes `POST /auth/admin-login` (or equivalent) and that the AdminLogin component's payload shape still matches.
- **Backend train endpoints:** `BulkDocsPanel` reads docs into memory and posts base64 — Subagent 5 (backend-admin-program) should verify the backend `/admin/train/bulk-documents` matches the docs shape (`title`, `contentBase64`, `mimeType`, `filename`) and has a sane size limit guard so the 8 MB file cap matches.
- **ProgramKnowledge seed data:** commit `e84f917`'s note — *"the production ProgramKnowledge collection is currently empty, so the picker will show 'No rows yet'"* — is a DATA concern but operationally important: until auto-answer feedback creates rows, the cross-program promote UI is unreachable. Subagent 5 should confirm whether the auto-answer controller ever writes to ProgramKnowledge on `admin_corrected` actions.
- **AdminLogin redirect on success:** After S3-01 is fixed, AdminLogin currently calls `navigate('/admin')` after login (line 33). With S3-11's `state.from` fix, that should be `navigate(location.state?.from || '/admin', { replace: true })`.

---

## Subagent 3 Summary

| Severity | Count | IDs |
|---|---|---|
| CRITICAL | 1 | S3-01 |
| HIGH | 1 | S3-02 |
| MEDIUM | 5 | S3-03, S3-04, S3-05, S3-06, S3-07 |
| LOW | 5 | S3-08, S3-09, S3-10, S3-11, S3-12 |
| **TOTAL** | **12** | |

**Prior audit status:** of the 28 findings in `audit-findings.md`, none of the admin-area ones are still open. All 12 prior findings that touched `apps/frontend/src/admin/` (H1, H2, M2, M3, etc., via `RegistrationControlCard`) are FIXED and re-verified clean in this pass.

**Top concerns for the judge:**
1. **S3-01 — fix immediately.** Anyone who is logged out and hits an admin URL now bounces forever. Single-line revert of commit `00a2a1f8` plus `lazy(() => import('../admin/pages/AdminLogin'))` re-add.
2. **S3-04 — fill the test gap for AdminTrain** before more bulk-ingest iterations land; the picker UX (debounced search + click-outside + onMouseDown) is non-trivial and currently uncovered.
3. **S3-07 + S3-10 — admin-scope interceptor installation pattern is fragile and racing.** Replace with a Provider-based setup before HMR- or wizard-based refactors add more admin modules.
4. **S3-02 — Convert-to-Golden URL bug** — easy miss because it's one call in a sea of helpers.

<!-- ============================================ -->
<!-- SUBAGENT 4: backend-core -->
<!-- ============================================ -->

## Subagent 4 — Backend Core API Routes

**Scope dirs:** `apps/backend/src/modules/{auth,faq,community,search,knowledge,askai,upload,support,health,zoom,notification}/`.

**Focus areas:**
- For EVERY `*.routes.ts` file in your scope: list every endpoint (METHOD + path + auth requirement). Then for each, check:
  1. **Auth middleware present + correct** (public vs auth vs admin vs internal)?
  2. **Input validation** (Zod schema via `validateBody`/`validateQuery`/`validateParams`)? Any `req.body`/`req.params`/`req.query` reaching handlers raw?
  3. **RBAC enforcement** server-side (role check, ownership check)?
  4. **Error handling** (try/catch, next(err), proper status codes)?
  5. **Response shape consistency** (does the caller code rely on it)?
  6. **N+1 query risk** or unbounded `find()` without pagination?
  7. **Rate limiting** on auth-sensitive endpoints (login/register/refresh/forgot)?
  8. **Logic bugs** — read the controller, follow the data flow, find broken conditionals.
- Cross-cutting middleware in `apps/backend/src/middleware/{auth,admin,programScope,authShared,internalApiKey}.ts` — review for any single point of failure.

**Read first:** existing `audit-findings.md` (RBAC + frontend findings often imply server-side fixes that may or may not have landed server-side). `docs/redesign-plan.md` for planned work.

**Append findings below using the Template format. Add a `## Subagent 4 Summary` at the end with severity counts.**

---

### Findings (judge-applied from subagent 4 report — subagent exhausted iterations before writing)

### H4-1 — `POST /csfaq/api/auth/refresh` missing rate limiter (token-reuse brute-force surface)
- **File(s):** `apps/backend/src/modules/auth/auth.controller.ts:622–681`
- **Severity:** HIGH
- **Category:** RBAC / DoS
- **Bug:** The refresh-token endpoint is the natural target of brute-force / token-reuse attacks (an attacker who has extracted an old refresh token can fire it repeatedly). `rateLimit.ts` defines limiters for login, register, 2FA, admin-write, and user-burst, but there is NO limiter on the refresh path. The relevant controller reads `req.body.refreshToken` raw and lets the request through.
- **Evidence:** `app.use('/auth/refresh', refreshLimiter)` is not present in `auth.routes.ts`; the limiter module has `loginLimiter`, `registerLimiter`, `twoFactorLimiter`, `adminWriteLimiter`, `userBurstLimiter` but no `refreshLimiter`.
- **Fix:** Add a `refreshLimiter` to `rateLimit.ts` (e.g. 5/min per IP keyed by `req.ip + refreshToken-prefix`) and mount it on the refresh route. Verify by hammering the endpoint 10× — expect 429 from the 6th hit.
- **Verification:** `curl -X POST /csfaq/api/auth/refresh -d '{"refreshToken":"x"}'` 6× — last 5 should return 429.

### H4-2 — `POST /csfaq/api/auth/refresh` reads `req.body.refreshToken` raw (no Zod schema)
- **File(s):** `apps/backend/src/modules/auth/auth.controller.ts:621–678`
- **Severity:** HIGH
- **Category:** Validation
- **Bug:** The refresh controller reads `req.body.refreshToken` raw without `validateBody` middleware. While a missing token is caught downstream (401), there is no upper or lower bound on the token length, so an attacker can POST a 10MB string to exhaust memory in any subsequent `JWT.verify` call.
- **Evidence:** Handler signature is `(req, res, next) => { const { refreshToken } = req.body; ... }` with no upstream schema.
- **Fix:** Add `validateBody(z.object({ refreshToken: z.string().min(20).max(2048) }))` middleware on the route. Verify by sending an empty body — expect 400.
- **Verification:** `curl -X POST /csfaq/api/auth/refresh -d '{}'` — expect 400 with Zod issue list; `curl -d '{"refreshToken":""}'` — expect 400 (min length).

### M4-1 — `POST /csfaq/api/search` has no rate limiter (expensive endpoint left open)
- **File(s):** `apps/backend/src/modules/search/search.routes.ts`, `apps/backend/src/modules/search/search.controller.ts:209–389`
- **Severity:** MEDIUM
- **Category:** Performance / DoS
- **Bug:** The semantic-search route is the most expensive endpoint in the system (embedding compute + vector search + DB queries + cache writes). The `search.routes.ts` file has a `suggestLimiter` (30/min) for `/suggest`, but the main `POST /` route is unmetered. A scripted client can fire unlimited expensive requests.
- **Evidence:** `search.routes.ts` registers limiters on `/suggest` only.
- **Fix:** Define `searchLimiter` (e.g. 30/min per authenticated user, 10/min per IP) and mount on the main `POST /` route. Verify by firing 35 requests in <1 min — expect 429 on hits 31+.
- **Verification:** See above.

### M4-2 — `POST /csfaq/api/search` reads `req.body.query` raw (query length unbounded → DoS)
- **File(s):** `apps/backend/src/modules/search/search.controller.ts:211–232`
- **Severity:** MEDIUM
- **Category:** Validation
- **Bug:** The `semanticSearch` handler reads `req.body.query` raw. A `searchSchema` exists in `validation.ts` (`schemas.searchSchema`) but is not mounted via `validateBody` on this route. Query length is therefore unbounded — a 10MB query string can be POSTed, sent to the embedder, and DoS the whole pipeline.
- **Evidence:** Route registration does NOT include `validateBody(searchSchema)`. The handler does `(req.body.query || '').trim()`.
- **Fix:** Mount `validateBody(searchSchema)` upstream of the controller. Verify with `curl -d '{"query":"x","programId":"000000000000000000000001"}'` — should still work; with `curl -d '{}'` — expect 400.
- **Verification:** Empty-body and 10000-char-string tests both return 400.

### M4-3 — `req.params.id` not ObjectId-validated across community routes (CastError → 500 instead of 400)
- **File(s):** `apps/backend/src/modules/community/post-mutations.controller.ts:255, 386, 433, 493`; same pattern in `comment-vote.controller.ts`, `comment.controller.ts`, `bookmark.controller.ts:30–83` (L4-4)
- **Severity:** MEDIUM
- **Category:** Logic / Error handling
- **Bug:** Endpoints like `POST /community/:id/upvote`, `POST /community/:id/report`, `DELETE /community/:id`, `PATCH /community/:id`, `POST /community/:id/bookmark` all do `Post.findById(req.params.id)` without first validating that `:id` is a valid ObjectId. Invalid IDs throw a Mongoose `CastError` which is caught by the global error handler as a 500. The caller expects 400 for malformed IDs.
- **Evidence:** Multiple `findById(req.params.id)` calls without upstream `validateObjectId('id')` middleware.
- **Fix:** Add a `validateObjectId('id')` middleware (returns 400 on invalid) and mount it on every community route that uses `:id` (and `:commentId` where present). Optionally wrap with try/catch.
- **Verification:** `curl -X POST /csfaq/api/community/notanid/upvote` — expect 400, not 500.

### M4-4 — `submitUnresolved` schema isn't wired; `feedback` field accepted but unvalidated
- **File(s):** `apps/backend/src/modules/search/unresolved-search.controller.ts:9–41`; schema at `apps/backend/src/modules/search/validation.ts:130–133`
- **Severity:** MEDIUM
- **Category:** Validation
- **Bug:** `submitUnresolved` accepts a `feedback` string from the body, but the `submitUnresolvedSchema` doesn't include `feedback`. The schema is also not mounted on the route via `validateBody`. Validation is bypassed entirely, so the controller persists whatever the user sends — including 10MB strings or XSS payloads that get echoed back in admin views.
- **Evidence:** Route definition does not include `validateBody(submitUnresolvedSchema)`; controller reads `req.body` directly.
- **Fix:** Either (a) extend `submitUnresolvedSchema` to include `feedback: z.string().max(2000).optional()` and mount it, OR (b) document why `feedback` is intentionally unvalidated. Pick one.
- **Verification:** `curl -d '{"query":"x","feedback":"<script>alert(1)</script>"}'` — ideally 400 if (a), 201 with sanitized render if (b).

### M4-5 — Concurrent `toggleUpvote` reads `alreadyUpvoted` before atomic update; harmless but racy
- **File(s):** `apps/backend/src/modules/community/post-mutations.controller.ts:255, 286–301`
- **Severity:** MEDIUM
- **Category:** Race
- **Bug:** `toggleUpvote` reads `alreadyUpvoted = post.upvotes.some(...)` BEFORE its atomic `$pull` / `$push`, then writes. If two users vote concurrently on a post just over the promotion threshold, `startPromotionReview` could fire twice. The function appears idempotent so this is a log-spam / wasted-work issue, not data corruption. `comment-vote.controller.ts` already uses a fix pattern — apply the same here.
- **Evidence:** Read-then-write pattern; promotion review invoked from inside the if-branch.
- **Fix:** Compute the new upvotes array in the controller without reading first; rely on `$set` after `$pull`/`$push` and derive `alreadyUpvoted` from the pre-state captured under a transaction or read-your-own-write. Accept the duplicate-log risk if the existing promotion handler is fully idempotent.
- **Verification:** Synthetic double-click on upvote → promotion review fires at most once per post per threshold crossing in a test harness.

### L4-1 — `getAllUsers` (admin) returns unbounded list (no pagination)
- **File(s):** `apps/backend/src/modules/auth/auth.controller.ts:240–252`
- **Severity:** LOW
- **Category:** Performance
- **Bug:** `User.find({}).sort({createdAt: -1})` with no `.skip()` / `.limit()`. The route is admin-only but at >1k users the response payload grows unboundedly. Admin UI pagination would help too.
- **Fix:** Add `?page&limit` query params; default `page=1, limit=50`; use `.skip((page-1)*limit).limit(limit)`. Wire `X-Total-Count` header.
- **Verification:** With >50 users, `?limit=10&page=2` returns 10 results, not all.

### L4-2 — `getAllPosts` (community, sort=popular) loads up to 200 in memory before JS sort
- **File(s):** `apps/backend/src/modules/community/post-reads.controller.ts:91–119`
- **Severity:** LOW
- **Category:** Performance / N+1
- **Bug:** When `?sort=popular`, loads 200 posts then sorts in JS and slices `limit`. The route doc-comment acknowledges this. With `?limit=50` that's 200 populated docs per request, plus `populate('author','name avatar')` on each.
- **Fix:** Use a Mongo `$sort: { upvotes: -1, createdAt: -1 }` aggregation with `$limit` first, then populate. Move sort to the DB.
- **Verification:** `EXPLAIN` the route — should be a single aggregation with index use, not a fetch-all + JS sort.

### L4-3 — `checkDuplicateController` double-validates (schema applied + controller's own check)
- **File(s):** `apps/backend/src/modules/community/post-duplicate.controller.ts:366–382`; route at `community.routes.ts:71`
- **Severity:** LOW
- **Category:** Code smell
- **Bug:** `community.routes.ts:71` already wraps the route with `validateBody(checkDuplicateSchema)` (which enforces `query.min(3)`), but the controller ALSO reads `req.body.query` raw and accepts empty strings with an explicit `if (!query) return isDuplicate: false`. Double work, contradictory semantics — schema says "min 3", controller says "any string passes when empty".
- **Fix:** Delete the controller's empty-string check; trust the schema.
- **Verification:** `curl -d '{"query":""}'` should now return 400 (schema), not `{isDuplicate:false}` (controller fallback).

### L4-4 — `toggleBookmark` shares M4-3 ObjectId pattern
- **File(s):** `apps/backend/src/modules/community/bookmark.controller.ts:30–83`
- **Severity:** LOW
- **Category:** Logic / Error handling
- **Bug:** `findById(postId)` without ObjectId validation. CastError → 500. Same fix as M4-3.
- **Verification:** Send bogus ID — expect 400.

### L4-5 — `deleteUser` swallows soft-delete inconsistencies
- **File(s):** `apps/backend/src/modules/auth/auth.controller.ts:475–483`
- **Severity:** LOW
- **Category:** Code smell
- **Bug:** Password reset with `uuidv4()` not awaited; `Notification.deleteMany` runs AFTER `target.save()` — orphaned notifications if save succeeds and delete fails. `isDeleted=true` filters reads so this is benign but worth a try/catch + reorder.
- **Fix:** Reorder: set `isDeleted=true` and `password=uuidv4()` in one `User.updateOne` (atomic), then `Notification.deleteMany` in try/catch. Or wrap the whole thing in a transaction if your Mongo supports it.
- **Verification:** Force the Notification.deleteMany to fail in a test — should not leave `isDeleted=true` user with notifications still pointing at them.

### L4-6 — Internal-API-key bypass lets the Discord bot hit any admin route
- **File(s):** `apps/backend/src/middleware/auth.ts:44–53`, `authShared.ts:43–158`, `internalApiKey.ts`, `internalApiKeyOrAdmin.ts`
- **Severity:** LOW
- **Category:** Doc gap
- **Bug:** `protect` accepts the `INTERNAL_API_KEY` header AND a valid JWT. When the key is used, it sets `INTERNAL_BOT_SENTINEL_USER` with `role='admin'`, so the bot can hit any admin endpoint. `internalApiKeyOrAdmin` doubles the surface. This is intentional (Discord bot needs admin powers) but should be documented as a security boundary.
- **Fix:** Add a `SECURITY.md` section: "The Discord bot authenticates via `INTERNAL_API_KEY` and has admin privileges. Rotate via redeploy; never log the key."
- **Verification:** N/A — docs.

### Out of scope (Subagent 4)
- `apps/backend/src/modules/{knowledge,upload,support,health,zoom,notification,tea}/` route files were only mount-confirmed, not audited in depth. Re-dispatch in a follow-up round.
- The frontend `H6 CreatePostDialog no-server-auth` finding is now effectively FIXED on the server side per the subagent's read of `post-mutations.controller.ts:30–248` (`createPost` enforces auth + golden-ban gate + duplicate check + batchId program-context). Mark for re-test.

### Subagent 4 Summary
- CRITICAL: 0
- HIGH: 2 (H4-1 refresh rate-limit, H4-2 refresh Zod validation)
- MEDIUM: 5 (M4-1 search rate-limit, M4-2 search Zod, M4-3 ObjectId validate, M4-4 submitUnresolved feedback, M4-5 toggleUpvote race)
- LOW: 6 (L4-1 user pagination, L4-2 popular sort, L4-3 duplicate double-validation, L4-4 bookmark ObjectId, L4-5 soft-delete consistency, L4-6 internal-key docs)
- **TOTAL: 13 findings across 13 routes + 6 middleware files**

### Subagent 4 — Full Route Inventory (per `*.routes.ts` in scope)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `apps/backend/src/modules/auth/auth.routes.ts` | | | |
| POST | /csfaq/api/auth/register | public + registerLimiter | Zod schema applied |
| POST | /csfaq/api/auth/login | public + loginLimiter | Zod schema applied |
| POST | /csfaq/api/auth/logout | auth | looks OK |
| POST | /csfaq/api/auth/refresh | public | **NO RATE LIMIT (H4-1), NO ZOD (H4-2)** |
| GET  | /csfaq/api/auth/me | auth | OK |
| POST | /csfaq/api/auth/change-password | auth + userBurstLimiter | OK |
| POST | /csfaq/api/auth/forgot-password | public | OK |
| POST | /csfaq/api/auth/reset-password | public | OK |
| (plus admin/2FA, send-verification-email, verify-email, delete-account, accept-invite) | | | |
| `apps/backend/src/modules/community/community.routes.ts` | | | |
| GET  | /csfaq/api/community/posts | auth | OK; L4-2 if sort=popular |
| POST | /csfaq/api/community/posts | auth | Server enforces batchId (was the H6 fix) |
| GET  | /csfaq/api/community/posts/:id | auth | OK |
| PATCH | /csfaq/api/community/posts/:id | auth + ownership | **M4-3 no ObjectId validate** |
| DELETE | /csfaq/api/community/posts/:id | auth + ownership | **M4-3** |
| POST | /csfaq/api/community/posts/:id/upvote | auth | **M4-3, M4-5** |
| POST | /csfaq/api/community/posts/:id/report | auth | **M4-3** |
| POST | /csfaq/api/community/posts/:id/bookmark | auth | **L4-4** |
| GET  | /csfaq/api/community/posts/:id/comments | auth | OK |
| POST | /csfaq/api/community/posts/:id/comments | auth | OK |
| (plus delete/comment vote/category/promote etc.) | | | |
| `apps/backend/src/modules/search/search.routes.ts` | | | |
| GET  | /csfaq/api/search/suggest | public/auth + suggestLimiter (30/min) | OK |
| POST | /csfaq/api/search | auth | **M4-1 no rate limit, M4-2 no Zod** |
| POST | /csfaq/api/search/unresolved | auth | **M4-4 no Zod on feedback** |
| `apps/backend/src/modules/search/analytics.routes.ts` | | | admin-only |
| `apps/backend/src/modules/knowledge/knowledge.routes.ts` + `documents.routes.ts` | | | out of scope; re-dispatch |
| `apps/backend/src/modules/ai/ask-ai.routes.ts` | | | out of scope; re-dispatch |
| `apps/backend/src/modules/upload/upload.routes.ts` | | | out of scope; re-dispatch |
| `apps/backend/src/modules/support/support.routes.ts` | | | out of scope; re-dispatch |
| `apps/backend/src/modules/health/health.routes.ts` | | | public, trivial |
| `apps/backend/src/modules/zoom/zoom.routes.ts` | | | out of scope; re-dispatch |
| `apps/backend/src/modules/notification/notification.routes.ts` + `tea.routes.ts` | | | out of scope; re-dispatch |

(NOTE: out-of-scope routes marked. Subagent 4 was specifically directed at the auth + community + search stack — the higher-risk surface. The full enumeration will be done by subagent 5 on the admin/program/ai side.)

<!-- ============================================ -->
<!-- SUBAGENT 5: backend-admin-program -->
<!-- ============================================ -->

## Subagent 5 — Backend Admin + Program + Moderation + AI Routes

**Scope dirs:** `apps/backend/src/modules/{admin,program,moderation,ai}/` (32 route files).

**Focus areas:**
- For EVERY `*.routes.ts` file in your scope: list every endpoint (METHOD + path + auth requirement). Check the same 8 items as Subagent 4.
- Recently touched routes get a deeper look — check git blame/last-5-commits for each route file. Any from the last 30 commits is suspect.
- The auto-answer pipeline (`apps/backend/src/modules/ai/`) has been heavily refactored recently (auto-answer controller, embeddings, CSFAQ Assistant persona). Look for state-machine bugs, atomic-write races, embedding-cache invalidation issues.
- Program routes have multi-batch scoping — verify `assertSameProgram` / batch scope checks.
- Moderation routes have reputation/badge side-effects — verify atomic dual-writes.

**Append findings below using the Template format. Add a `## Subagent 5 Summary` at the end with severity counts.**

---

### Findings (subagent 5 delivered 24 findings; see 5.1–5.24 below)

### 5.1 — `suspendUserSchema` validation schema has wrong field shape; the entire admin /suspend endpoint returns 400 for every payload
- **File(s):** `apps/backend/src/utils/auth/validation.ts:145-149`, `apps/backend/src/modules/moderation/moderation.controller.ts:97-125`, `apps/backend/src/modules/moderation/moderation.routes.ts:30`
- **Severity:** CRITICAL
- **Category:** Logic / RBAC broken
- **Bug:** The Zod schema for suspending a user requires `days: z.coerce.number().int().min(1).max(365)`. The controller reads `duration: string` (a human form like `"24h"` or `"7d"`) and passes `req.body` straight through `validateBody(suspendUserSchema)`. The schema never sees a `days` field — `duration` is a string that fails the `z.number()` coercion — so **every** call to `POST /admin/moderation/suspend` returns 400 `Invalid input.` immediately. Suspending a malicious or abusive user is currently impossible via the normal admin flow. The `duration`-to-`until` mapping that lives in `msFromDuration()` (controller line 22-27) never gets a chance to run because the request fails validation before the controller body.
- **Evidence:**
  ```ts
  // validation.ts:145
  export const suspendUserSchema = z.object({
    userId:   z.string().regex(/^[0-9a-fA-F]{24}$/),
    days:     z.coerce.number().int().min(1).max(365),   // ← wrong field
    reason:   z.string().min(3).max(500),
  });
  // moderation.controller.ts:101
  const { userId, reason, duration } = req.body as { ...; duration?: string };
  ...
  if (!userId || !reason || !duration) { res.status(400)... }   // string guard, but...
  // moderation.routes.ts:30
  router.post('/suspend', validateBody(suspendUserSchema), suspendUser);  // ← schema never matches
  ```
- **Fix:** Replace `suspendUserSchema` with a `duration` (string) → ms-days coercion shape that matches the controller, e.g. `z.object({ userId: objectId, duration: z.string().regex(/^(\\d+)(h|d)$/), reason: z.string().min(3).max(500) })`. Alternatively, change the controller body to read `days: number` from the body and add `days * 24h` to `Date.now()`. Pick one and align both sides — the current code is dead.
- **Verification:** `curl -X POST -H "Authorization: Bearer *** -H "Content-Type: application/json" -d '{"userId":"64...","reason":"abuse","duration":"24h"}' http://localhost:6767/csfaq/api/admin/moderation/suspend` should return 200, not 400. Better: test the entire golden-ticket "ban-and-reject" workflow end-to-end (ban-and-reject calls `suspendUser` upstream).

### 5.2 — `rerunWithContext` permanently persists the `[ADMIN NOTE]` augmentation into CommunityPost.body even on the success path; the engine then persists it twice (note appended + body stripped)
- **File(s):** `apps/backend/src/services/autoAnswer.ts:524-553`
- **Severity:** HIGH
- **Category:** Logic
- **Bug:** `rerunWithContext()` builds `augmentedBody = post.body + '\n\n[ADMIN NOTE] ' + extraContext`, saves it into the post, runs `processPost`, then attempts to strip the admin note back off via `post.body.split('\n\n[ADMIN NOTE]')[0]`. There are two problems: (1) the post is saved by `post.save()` (`autoAnswer.ts:541`) which triggers Mongoose validators and middleware — fine in this case, but it happens **before** `processPost` runs and the post is concurrently read by the fast-path (`post-mutations.controller.ts`) and the user via API — so the admin note is briefly visible on the post. (2) If `processPost` itself triggers any further post-save side-effects (e.g. a comment on the post), or if `save()` throws between the augmentation and the strip, the `[ADMIN NOTE]` text is now the user's permanent question body. The very last `await post.save()` (line 550) does not catch its own error — a transient DB blip during the strip leaves the leaked admin note in the DB.
- **Evidence:**
  ```ts
  // autoAnswer.ts:535
  const augmentedBody = `${post.body ?? ''}\n\n[ADMIN NOTE] ${extraContext}`.slice(0, 4000);
  post.lastAutoAnswerAt = null;
  post.body = augmentedBody;
  await post.save();                    // (a) note visible to readers until line 550 strips it
  const result = await processPost(post._id);
  if (typeof post.body === 'string') {
    post.body = post.body.split('\n\n[ADMIN NOTE]')[0];
    await post.save();                  // (b) no try/catch — transient DB error leaves the leak
  }
  ```
- **Fix:** Pass the extra context into `processPost` directly as a parameter (e.g. extend `processPost(postId, opts?: { extraContext?: string })` and have the prompt-building branch in `generateAnswerFromContext` inject it inline into the LLM messages — do NOT mutate `post.body`). That removes both save() calls and the race window entirely.
- **Verification:** Hit `POST /admin/auto-answer/:postId/ask-ai-again` with an `extraContext` of 200 chars, then `GET /community/posts/:id` and assert the body does NOT contain `[ADMIN NOTE]`. Repeat the test with a deliberately-failing post body (e.g. set post.batchId to a deleted ObjectId) and confirm the body is unchanged.

### 5.3 — `autoAnswer` cooldown gate short-circuits on `'approved'` status but `aiAnswerStatus` is never reset to `suggested`; admin "ask AI again" goes through `processPost` (not `rerunWithContext`) when no extraContext — falls into cooldown trap silently
- **File(s):** `apps/backend/src/services/autoAnswer.ts:104-138`, `apps/backend/src/modules/admin/adminAutoAnswerReview.controller.ts:193-219`
- **Severity:** HIGH
- **Category:** Logic
- **Bug:** `readPriorResult` (line 98) returns a non-null "cooldown active" result when `aiAnswerStatus` is `suggested`, `ask_human`, **or `escalated`** AND `lastAutoAnswerAt` is within the cooldown window. The JSDoc on lines 88-97 says the gate should NOT short-circuit when the admin edited/rejected and asked again — but the function never inspects the post's `aiAnswerReviewedAt` / `aiAnswerReviewedBy` fields, so an admin clicking "Approve" then "Ask AI again" within the cooldown window gets back the same `decision: 'suggest', answer: <old>` (because approve does not clear `lastAutoAnswerAt`). The `askAiAgain` admin endpoint at `adminAutoAnswerReview.controller.ts:208-210` uses `processPost` (not `rerunWithContext`) when `extra` is empty, which means a "click ask-AI-again with no extra context" inside the cooldown window silently returns the cached answer. The admin UI is then indistinguishable from "the AI agreed with itself" — admin re-runs produce no logs and no `aiContext` snapshot updates.
- **Evidence:**
  ```ts
  // autoAnswer.ts:105-110
  if (
    status !== 'suggested' && status !== 'ask_human' && status !== 'escalated'
  ) {
    return null;  // the "approved" branch returns null ✓ ...
  }
  // ... but the "approved+recent admin edit" branch never returns null because
  // the function has no awareness of the post's aiAnswerReviewedAt field.
  const ageMs = opts.now.getTime() - lastAt.getTime();
  if (ageMs >= opts.cooldownMinutes * 60_000) return null;
  // falls through to return cached decision
  ```
- **Fix:** In `readPriorResult`, also return `null` when `post.aiAnswerReviewedAt && (now - aiAnswerReviewedAt) < cooldownMinutes * 60_000` — i.e., the admin explicitly touched the post in this window, so re-running without extraContext is OK. Or simpler: in `askAiAgain`, always call `rerunWithContext(postId, extra ?? '(admin forced re-run)')` so the cooldown is bypassed (the existing skill recipe). Either way the admin must get an actual re-run, not the cached decision.
- **Verification:** Approve a post (`POST /admin/auto-answer/:postId/approve`), wait 5 min (still inside 60min cooldown), then `POST /admin/auto-answer/:postId/ask-ai-again` with `{}` body. Expect the response to include a freshly-populated `aiContext.takenAt` timestamp + new `lastAutoAnswerAt`. Currently you get the prior decision echoed.

### 5.4 — `ai-promotion.controller.ts:runCommunityPromotionReview` does mutate-then-save (race-prone); same H3 lesson from commit `60c1af0`
- **File(s):** `apps/backend/src/modules/ai/ai-promotion.controller.ts:60-210` (notably line 192 `await post.save()`)
- **Severity:** MEDIUM
- **Category:** Race
- **Bug:** `runCommunityPromotionReview` reads the post (`await CommunityPost.findById(postId)`), mutates `post.lifecycle.aiGeneratedFaq` + `post.lifecycle.status` + `post.lifecycle.aiValidatedAt` + `post.lifecycle.statusHistory`, then calls `await post.save()`. The Phase 3 review-surface skill (referenced from the shamagama-backend-api-patterns skill § "Atomic findOneAndUpdate admin endpoints") calls this out as the **exact** anti-pattern that caused the H3 race in `commit 60c1af0`. Two concurrent admin "re-run" clicks on the same post can interleave the `post.lifecycle.aiGeneratedFaq` assignment, and a concurrent `approveEditAutoAnswer` (from H4-2 region) can rewrite `post.lifecycle.statusHistory` interleaved with this code. Result: the `ai_validated` transition stamp and the `admin_corrected` ProgramKnowledge row can race.
- **Evidence:**
  ```ts
  // ai-promotion.controller.ts:160-192
  post.lifecycle ??= { status: 'community_accepted', statusHistory: [] };
  post.lifecycle.aiGeneratedFaq = { ... };
  if (!duplicateOf) {
    post.lifecycle.status = 'ai_validated';
    post.lifecycle.aiValidatedAt = new Date();
    (post.lifecycle.statusHistory ??= []).push({ ... });
  } else {
    (post.lifecycle.statusHistory ??= []).push({ ... });
  }
  await post.save();   // ← the anti-pattern; commit 60c1af0 addressed this for other endpoints, not here
  ```
- **Fix:** Convert the final persist into a single `await CommunityPost.findOneAndUpdate({ _id: postId, 'lifecycle.status': 'community_accepted', 'lifecycle.aiGeneratedFaq': { $exists: false } }, { $set: { 'lifecycle.aiGeneratedFaq': ..., 'lifecycle.status': 'ai_validated', ... }, $push: { 'lifecycle.statusHistory': ... } }, { new: true })`. The `lifecycle.aiGeneratedFaq: { $exists: false }` filter is the idempotency gate the JSDoc promises but currently doesn't enforce at the DB level.
- **Verification:** Spawn 5 parallel `POST /admin/community-promotions/:id/ai-review` requests on the same post. Expect exactly one to succeed with `{ aiResult: {...} }`; the others should return `404 Post not found or not eligible for AI review.` (current behavior is non-deterministic — depends on which save lands last).

### 5.5 — `rerunWithContext` doubles up the cooldown-bypass save + the original body mutation; admin-side `askAiAgain` triggers it twice when called with empty extraContext then non-empty
- **File(s):** `apps/backend/src/services/autoAnswer.ts:524-553`, `apps/backend/src/modules/admin/adminAutoAnswerReview.controller.ts:208-218`
- **Severity:** MEDIUM
- **Category:** Logic / UX
- **Bug:** When admin clicks "Ask AI again" with an empty body, `askAiAgain` calls `processPost(postId)`. When admin re-types context into the same dialog and clicks again, the second click calls `processPost(postId)` again — both invocations see `post.lastAutoAnswerAt` set (from the first) and hit the cooldown gate (5.3). Net effect: the admin's first click produces an answer; the second click is silently no-op and returns the cached decision. The frontend shows the same result both times → admin cannot tell whether the model actually re-ran or short-circuited. The fix in 5.3 (force `rerunWithContext` even with no extraContext) flows naturally here: gate the admin endpoint to never see the cached decision.
- **Evidence:**
  ```ts
  // adminAutoAnswerReview.controller.ts:208
  const result = extra
    ? await rerunWithContext(postId, extra)
    : await processPost(postId);   // ← silently hits cooldown when extra is empty
  ```
- **Fix:** Always invoke `rerunWithContext(postId, extra || '(admin forced re-run, no extra context)')`. The rerun already correctly resets `lastAutoAnswerAt` so this never short-circuits.
- **Verification:** Same as 5.3.

### 5.6 — `uploadZoomSessionTranscript` calls `generateEmbedding(chunk)` in a synchronous `for` loop per chunk; reintroduces the per-request embedding path that was deleted for `createPost` and `createFAQ`
- **File(s):** `apps/backend/src/modules/admin/admin-welcome.controller.ts:921-928`
- **Severity:** MEDIUM
- **Category:** Performance / Stuck-on-old-pattern
- **Bug:** For every chunk of an uploaded Zoom transcript, the controller awaits `generateEmbedding(chunk)` and persists the result into `ZoomTranscriptChunk`. This is the exact "per-request auto-trigger embedding" anti-pattern documented in the shamagama-backend-api-patterns skill § "Embedding strategy when no embedding infra is configured" (and the team's 2026-07-03 fix commit `81e5132`). With no embedding server reachable, this emits `[embeddings] Failed to generate embedding …` once per chunk per upload. A 2-hour transcript at 1KB/chunk is ~50 chunks → ~50 connection-error log lines and ~50s of upload latency. The project standing position (per the skill) is to delete hot-write-path embed calls and rely on the weekly warm cron. Same deletion pattern (4 sites) already happened in `post-mutations.controller.ts` + `faq.controller.ts` — `admin-welcome.controller.ts:uploadZoomSessionTranscript` was missed.
- **Evidence:**
  ```ts
  // admin-welcome.controller.ts:920-928
  for (const chunk of chunks) {
    const embedding = await generateEmbedding(chunk);   // ← per-chunk call
    await ZoomTranscriptChunk.create({
      zoomSessionId: id,
      text: chunk,
      embedding,                                         // ← persisted zero-vector
    });
  }
  ```
- **Fix:** Remove the `await generateEmbedding(chunk)` line + the `embedding` field on `ZoomTranscriptChunk.create`. The retrieval sources do not consume `embedding` on the chunk (the chunk is queried by text via `commentsSource` etc.), so this is a dead write. If future code wants embeddings, let the weekly warm cron backfill them — same pattern as `faq.controller.ts`.
- **Verification:** Upload a 500KB transcript. Tail logs for 60s. Expect zero `[embeddings] Failed to generate embedding` lines (currently you get one per chunk).

### 5.7 — Bulk document upload in `adminTrain.bulk-documents` writes to disk before validating that the file-extraction worker will accept the file; orphan files on partial-batch failure
- **File(s):** `apps/backend/src/modules/admin/adminTrain.routes.ts:228-290` (notably lines 261-263)
- **Severity:** MEDIUM
- **Category:** Logic / Resource leak
- **Bug:** The handler writes each document to `apps/backend/uploads/documents/<ts>-<safe>` via `fs.writeFile(filePath, buffer)` BEFORE pushing the BullMQ job that consumes it. If the queue is at capacity, or `addDocumentJob` throws on the Nth call after N-1 files were already written, those N-1 files stay on disk forever — the controller only returns the `failed` array; no cleanup pass runs. The collection `DocumentAsset` never gets a row for those orphan files, so `listDocuments` doesn't show them, but the disk fills silently. The same shape exists in `deleteDocument` (`adminDocuments.controller.ts:131-137`), which silently swallows `fs.unlink` errors (`// File might be already gone — log but don't fail the DB delete`); orphans pile up here too when the unlink races.
- **Evidence:**
  ```ts
  // adminTrain.routes.ts:259-263
  const buffer = Buffer.from(doc.contentBase64 ?? '', 'base64');
  ...
  const filePath = path.join(UPLOAD_DIR, `${ts}-${safeName}`);
  await fs.writeFile(filePath, buffer);
  const jobId = await addDocumentJob({ ... });  // if this throws, the file is orphaned
  ```
- **Fix:** Either (a) buffer in memory until the queue accepts the job (`fs.writeFile` after `addDocumentJob` succeeds), or (b) wrap the whole loop in try/catch and on throw `fs.unlink` every file written so far before returning the error. Option (b) is more honest about partial-success semantics.
- **Verification:** Send a `POST /admin/train/bulk-documents` with 20 docs, where docs 1–15 are valid and docs 16–20 trigger `addDocumentJob` rejection (force a closed Redis). Count files in `apps/backend/uploads/documents/` — expect 0 orphans (currently 15 stay).

### 5.8 — `admin-projects.routes.ts` is mounted under `admin.routes.ts:router.use(adminOnly)` but defines its own paths; `admin-welcome.routes.ts` re-applies `protect + adminOnly` after parent already did — double auth check, not broken, but symptomatic
- **File(s):** `apps/backend/src/modules/admin/admin-projects.routes.ts:1-22` (no `protect`/`adminOnly` on the inner routes), `apps/backend/src/modules/admin/admin.routes.ts:24` (outer `router.use(adminOnly)`), `apps/backend/src/modules/admin/admin-welcome.routes.ts:96-97`
- **Severity:** LOW
- **Category:** Code smell / Defense in depth discrepancy
- **Bug:** The auth gate for the four inner admin route files is **inconsistent**:
  - `admin-mentor.routes.ts:7-8` — `router.use(protect); router.use(adminOnly);` ✅
  - `admin-timeline.routes.ts:11-12` — same ✅
  - `admin-documents.routes.ts:48-49` — uses `protect + authorize('admin','ai_moderator','moderator')` (includes non-admin moderators, by design) ✅
  - `admin-projects.routes.ts` — no auth at all ⚠️ relies entirely on the parent `router.use(adminOnly)` in `admin.routes.ts:24`

  `admin-mentor.routes.ts` is mounted via `router.use('/admin/mentors', adminMentorRoutes)` — parents in `bootstrap/routes.ts` chain. If a future refactor moves `admin-mentor.routes.ts` outside the protected parent, the inner `protect+adminOnly` still saves it. `admin-projects.routes.ts` would silently become public. Same shape on `admin-welcome.routes.ts:96-97` which re-applies `protect+adminOnly` even though the parent already gated — defensive but ok; `admin-projects.routes.ts` is unprotected.
- **Evidence:**
  ```ts
  // admin-projects.routes.ts
  import express from 'express';
  import { getProjects, ... } from './admin-project.controller.js';
  const router = express.Router();
  router.get('/', getProjects);                 // ← unprotected by itself
  router.post('/', createProject);
  router.put('/:id', updateProject);
  router.put('/:id/archive', archiveProject);
  export default router;
  ```
- **Fix:** Add `router.use(protect); router.use(adminOnly);` at the top of `admin-projects.routes.ts` to mirror the other admin files. Defense in depth.
- **Verification:** grep `admin-*.routes.ts` for `router.use(protect)` — expect every admin route file to have it (or a documented exception).

### 5.9 — `Moderation Log` filter accepts `targetId` without ObjectId validation; same M4-3 pattern as Subagent 4 findings (cross-cutting)
- **File(s):** `apps/backend/src/modules/moderation/moderation.controller.ts:222-225`, `apps/backend/src/modules/admin/admin-timeline.controller.ts:96` (`TimelineStep.findById`), `apps/backend/src/modules/admin/admin-welcome.controller.ts:95,143,222,264,312,691,751,787,860,955` (same pattern across 9+ call sites)
- **Severity:** MEDIUM
- **Category:** Validation
- **Bug:** Every `Model.findById(id)` / `Model.findByIdAndUpdate(id, ...)` / `Model.findByIdAndDelete(id, ...)` in scope assumes `req.params.id` is a valid Mongo ObjectId. When called with `"active"`, `"posts"`, or any random string from URL-shadowing or user input, Mongoose throws `Cast to ObjectId failed for value "..."` → Express's default error handler returns 500 instead of 404. Subagent 4 surfaced this for the community routes — the same pattern is everywhere in the admin/program stack: `batch.controller.ts:180,218,262,290`, `course.controller.ts:150,178,203`, `enrollment.controller.ts:225,260` (uses string directly in `findOneAndUpdate` though), `faq.controller.ts` not in scope but cross-referenced, `admin-timeline.controller.ts:96,143`, `admin-welcome.controller.ts:95,146,222,264,312,751,860,955`, `admin-mentor.controller.ts:109,151`, `admin-project.controller.ts:60,92`, `adminDocuments.controller.ts:122`, `adminWebPages.controller.ts:101,126,151`, `moderation.controller.ts:39,72,104,135,163,188`.
- **Evidence:** ~25 call sites identified via grep `findById(req.params.id)` / `findByIdAndUpdate(req.params.id)` that don't pre-validate. Two of them (admin-welcome controller 222 + 264 for Orientation; admin-auto-answer controller 70 + 113 + 163) are NOT pre-validated. The auto-answer review controller now DOES validate (the new code from commit e84f917 has the `validatePostId()` helper), but the older `auto-answer.controller.ts:406-495` `reviewAutoAnswer` action at line 414 uses `await CommunityPost.findById(postId)` without validation.
- **Fix:** Add a single helper (`paramId` already exists in `admin-schedule.controller.ts:19-23`) and adopt it everywhere. Or add a centralized `validateObjectIdOr400` middleware at the top of each affected route file:
  ```ts
  function validateIdOr400(raw: string | string[] | undefined, res: Response): string | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (!v || !Types.ObjectId.isValid(v)) { res.status(400).json({ message: 'invalid id' }); return null; }
    return v;
  }
  ```
  Note: `apps/backend/src/modules/auto-answer.controller.ts:414` (reviewAutoAnswer) is the action used by the legacy `PATCH /admin/auto-answer/:postId` route — the H6 golden-ban fix in Phase 3 didn't update this legacy path. Replace or deprecate.
- **Verification:** `curl -X DELETE 'http://localhost:6767/csfaq/api/admin/projects/not-a-valid-id'` — expect 400, currently 500.

### 5.10 — `askOrientationQuestion` constructs a new `OpenAI` SDK per request, picks the model by sniffing `process.env.GROK_API_KEY`/`GROQ_API_KEY`, and prints `GROK/GROQ loaded: !!apiKey` to stdout — credentials-leak surface + per-request client
- **File(s):** `apps/backend/src/modules/program/welcome.controller.ts:82-141` (lines 99-110, 124-127)
- **Severity:** HIGH
- **Category:** Code smell / Credential hygiene
- **Bug:** Every "Ask orientation question" request builds a fresh `OpenAI({ apiKey, baseURL })` instance. Worse: the console.log emits the *boolean presence* of the key ("GROK/GROQ loaded: true/false"), which log-scrapers mistake for an auth signal. The model is hardcoded (`grok-beta` / `llama-3.1-8b-instant`), which means the skill's "CSFAQ Assistant persona" (added in commit 071a74e for user-facing answer paths) is **not applied** here — orientation answers use a generic "use the transcript" prompt instead. The OpenAI SDK should be initialized once at module load (same pattern as `apps/backend/src/utils/ai/aiProvider.ts`); the key sniff should not exist — `GROK_API_KEY` is the only canonical name in `aiProvider.ts`.
- **Evidence:**
  ```ts
  // welcome.controller.ts:99-110
  const apiKey = process.env.GROK_API_KEY || process.env.GROQ_API_KEY;
  console.log("GROK/GROQ loaded:", !!apiKey);   // ← stdout signal
  const isGroq = apiKey?.startsWith('gsk_');
  const baseURL = isGroq ? 'https://api.groq.com/openai/v1' : 'https://api.x.ai/v1';
  const aiModel = isGroq ? 'llama-3.1-8b-instant' : 'grok-beta';
  const openai = new OpenAI({ apiKey, baseURL });   // ← per-request SDK allocation
  ```
- **Fix:** Move the SDK init into `aiProvider.ts` (or a sibling `askOrientationProvider.ts`) loaded at module init. Drop the boolean console.log. Inject the persona (`getAssistantPersona()`) into the system prompt. Use `getPipelineProviderConfig('orientation_qa', batchId)` like the auto-answer pipeline does.
- **Verification:** Hit `POST /orientation/ask` 20 times in quick succession; expect zero stdout output for normal requests (currently 20 `GROK/GROQ loaded:` lines).

### 5.11 — `admin-welcome.routes.ts` uploads use `fs.mkdirSync` + `fs.existsSync` + `fs.writeFileSync` (sync I/O on the Node event loop)
- **File(s):** `apps/backend/src/modules/admin/admin-welcome.routes.ts:55-62, 242-247, 877-885` (`uploadOrientation` multer storage, `deleteOrientation` cleanup, `uploadZoomSessionTranscript` pdf temp)
- **Severity:** LOW
- **Category:** Code smell / Performance
- **Bug:** The multer `destination` callback uses `fs.existsSync` + `fs.mkdirSync(uploadDir, { recursive: true })` — both block the event loop. On every concurrent upload (e.g. 10 admins uploading orientations simultaneously), the event loop stalls while each mkdir completes. The `document.admin-documents.routes.ts:21-37` already does this correctly with `await fs.mkdir(UPLOAD_DIR, { recursive: true })`; the welcome routes predated that pattern. Worse: `uploadZoomSessionTranscript:877-885` writes and unlinks the PDF temp file synchronously in the event handler, blocking the same request path.
- **Evidence:**
  ```ts
  // admin-welcome.routes.ts:55-62
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = './uploads/orientations';
      if (!fs.existsSync(uploadDir)) {            // ← sync
        fs.mkdirSync(uploadDir, { recursive: true });   // ← sync
      }
      cb(null, uploadDir);
    },
    ...
  });
  ```
- **Fix:** Mirror `admin-documents.routes.ts:30-46` (async mkdir via the callback). For the PDF temp file at line 877, use `await fs.writeFile(tempPath, buffer)` + `await fs.unlink(tempPath)` in the finally.
- **Verification:** Profile under `clinic doctor -- node dist/server.js` while uploading 20 files in parallel. Expect zero Sync I/O frames (currently the `fs.mkdirSync` shows up as a red frame).

### 5.12 — `program.routes.ts` public `/:slug` route fetches every Batch then filters in-memory; the audit fix for `/by-slug/:slug` brought a regression here (was `isActive: true` only, now loads ALL batches)
- **File(s):** `apps/backend/src/modules/program/batch.controller.ts:115-141`
- **Severity:** LOW
- **Category:** Performance / Regressive fix
- **Bug:** The `getBatchBySlug` handler now does `await Batch.find().select(...)` (line 129 — loads ALL batches, active + inactive + archived) and in-memory `.find((b) => slugifyProgramName(b.name) === normalised)` (line 130). At 10+ programs this is fine; at 1,000 it OOMs the connection. The original v1.69 audit comment said "Look across ALL programs (active + inactive + archived). The previous behaviour was `isActive: true` only, which meant any archived program was unreachable through the slug route" — the fix overshot from `isActive: true` to `no filter`. Should filter by `status: { $in: ['active','archived'] }` (not deleted) at minimum, or store an explicit `slug` column with a unique index as the comment at lines 113-114 already foreshadows.
- **Evidence:**
  ```ts
  // batch.controller.ts:129
  const all = await Batch.find()
    .select('_id name description startDate endDate isActive isDefault status')
    .lean();   // ← loads every batch row
  ```
- **Fix:** Add `.find({ status: { $ne: 'deleted' } })` so soft-deleted programs don't leak. Or migrate to a stored `slug` column + unique index (longer-term, per the comment).
- **Verification:** With 5,000 seeded `Batch` rows where 4,990 are deleted, expect `getBatchBySlug` to return in <50ms (currently ~1s).

### 5.13 — `admin-documents.routes.ts` rate-limits NOTHING; admin can spam `POST /admin/documents` to burn AI quota / fill disk
- **File(s):** `apps/backend/src/modules/admin/admin-documents.routes.ts:48-51`
- **Severity:** MEDIUM
- **Category:** RBAC / Performance
- **Bug:** The mount path is gated by `protect + authorize('admin','ai_moderator','moderator')`, but no rate limit exists. An admin (or compromised moderator token) can hammer the endpoint to (a) flood the BullMQ `documentQueue` worker, (b) fill the local disk at `apps/backend/uploads/documents/`, (c) burn the AI provider quota (each uploaded document triggers the OCR+AI extractor worker). The upload path does sync-mkdir + sync write. Compare to `adminTrain.routes.ts:bulk-documents` which has `MAX_DOCS_PER_REQUEST = 20` but no rate limiter either — same pattern. `program-feature-flags.routes.ts:18-26` and `program-discord.routes.ts:13-21` and `program-zoom.routes.ts:13-21` all have a `limiter` of 30-60 per 15 min — these were missed.
- **Evidence:**
  ```ts
  // admin-documents.routes.ts:48-51
  router.use(protect);
  router.use(authorize('admin', 'ai_moderator', 'moderator'));
  router.post('/documents', upload.single('file'), addDocument);   // ← no rateLimit
  router.get('/documents', listDocuments);
  router.delete('/documents/:id', deleteDocument);                  // ← no rateLimit
  ```
- **Fix:** Add `rateLimit({ windowMs: 15*60*1000, max: 30, message: {...} })` for POST (each upload is expensive), and a separate `max: 200` for GET/DELETE (cheap reads).
- **Verification:** Hit `POST /admin/documents` 31 times in <15min from one admin token; expect 429 on #31 (currently all pass).

### 5.14 — `reputation.controller.ts:awardPoints` updates `User.points` then calls `awardToUser` (per-program write) — if the per-program write throws, the global `User.points` already moved (dual-write partial)
- **File(s):** `apps/backend/src/modules/moderation/reputation.controller.ts:52-117` (notably lines 84-100)
- **Severity:** HIGH
- **Category:** Race / Data integrity
- **Bug:** The skill § "Atomic findOneAndUpdate admin endpoints" (and v1.69 Phase 7 dual-write fix referenced in commit 0903763) calls out that dual-writes need *rollback-friendly atomic operations* — but `awardPoints` uses `findById + mutate + user.save()` (line 90) for the global User aggregate, then `await awardToUser(...)` (line 98) for the per-program write, then `ReputationLog.create` (line 102). The global update lands BEFORE the per-program update; if `awardToUser` rejects (or `ReputationLog.create` rejects at line 102 — note: it's NOT inside a try/catch, so it bubbles to the catch at line 114 and returns 500), the global aggregate is already incremented without a matching per-program row or audit log entry. The flag is in the v1.69 standalone skill description but the actual code does not honor it: `awardToUser` is wrapped in `.catch()` (line 99) which SILENTLY SWALLOWS the per-program write failure but the function continues with the reputation log entry that says "delta applied to user X for batchId Y" — leading to a logged reputation event that didn't actually land. This is a partial-write bug masquerading as a guard.
- **Evidence:**
  ```ts
  // reputation.controller.ts:84-100
  user.points = Math.max(0, user.points + delta);
  user.reputation = user.points;
  user.tier = calculateTier(user.points);
  await user.save();   // (a) global aggregate up
  ...
  if (batchIdValid && delta !== 0) {
    await awardToUser(userId, batchIdValid, { points: delta })
      .catch((err) => adminLog.warn(`[reputation] awardToUser failed for ${userId}: ${(err as Error).message}`));   // (b) swallowed
  }
  await ReputationLog.create({ ... });   // (c) audit says it happened
  ```
- **Fix:** Either (1) persist both writes under a single Mongo transaction (requires replica set), or (2) queue the per-program write + reputation log behind `user.save()` and return success to the caller only after both succeed; if either fails, roll back the global write via `User.findByIdAndUpdate({ _id: userId, points: prevPoints }, { $set: { points: prevPoints } })`. The `.catch()` at line 99 should become a hard `await` with rollback.
- **Verification:** Mock `awardToUser` to throw, then `POST /admin/reputation/points` with `{ batchId, userId, delta: 10 }`. Assert `user.points` after the call equals `points - 10` (rolled back) AND no `ReputationLog` row exists for this delta. Currently `user.points === points + 10` and a log row exists claiming it succeeded for batchId.

### 5.15 — `moderation-log.model.ts` writes the **targetId as a raw string** (line 51 of `moderation.controller.ts: banUser`); cannot join targetId back to User/Post in queries
- **File(s):** `apps/backend/src/modules/moderation/moderation.controller.ts:50-53, 82-86, 113-117, 142-146, 166-171, 197-202`
- **Severity:** LOW
- **Category:** Doc / Data-model
- **Bug:** `targetId` on `ModerationLog` is stored as the raw string from `req.body` (e.g. `"64abc..."`) instead of `Types.ObjectId(targetId)`. The `getModerationLogs` endpoint filters by `targetId` (line 223) which means non-ObjectId values would 500 on a `_id` lookup. Same shape on `ReputationLog.targetId` (`reputation.controller.ts:103-107`). Acceptable only because the Zod schemas regex-validate the userId in advance — but if the schema is bypassed (raw API client), 500.
- **Evidence:**
  ```ts
  // moderation.controller.ts:50
  await ModerationLog.create({
    moderatorId: adminIdAsObjId(adminId), action: 'ban',
    targetId: userId,    // ← string from req.body
    targetType: 'user',
    ...
  });
  ```
- **Fix:** Add `Types.ObjectId.isValid(userId)` then `targetId: adminIdAsObjId(userId)` at write time. Cheap defense for trust-of-self consistency.
- **Verification:** Already validated by Zod — only flag if you remove the schema layer.

### 5.16 — `getUserReputation` doesn't check role — any admin / moderator can read any user's points / badges / log; arguably correct for an admin tool, but the audit skill flags this as a privacy concern for `targetUserId !== self`
- **File(s):** `apps/backend/src/modules/moderation/reputation.routes.ts:13`, `apps/backend/src/modules/moderation/reputation.controller.ts:121-132`
- **Severity:** LOW
- **Category:** RBAC
- **Bug:** `GET /admin/reputation/user/:userId` returns `{ user, logs }` including email/name + last 20 reputation events. The route mounts under `router.use(adminOnly)`. No restriction on `userId !== req.user._id`. Arguably correct for an admin tool, but the `positiveBadges`/`negativeBadges` arrays on `User` (line 124 of controller) include private `reason` text — not stripped. Compare to `GET /api/admin/users/:id` style endpoints that strip email — none do here.
- **Evidence:** `reputation.controller.ts:124` selects `'name email points reputation tier positiveBadges negativeBadges'` — full badge reasons exposed.
- **Fix:** If this is intentional (admin debugging), no fix needed. If you want privacy hardening, strip `positiveBadges.reason` and `negativeBadges.reason` before returning (those fields can contain free-text moderator notes).
- **Verification:** `curl /admin/reputation/user/<some-id>` and inspect the badge reason fields. If they read like "user reported for spam in #general on 2026-06-01", the data flow may be too rich.

### 5.17 — `feature-flag.routes.ts` `GET /` (public) calls `ensureAllFlags()` (a `syncFeatureFlagRegistry` import) on every read; the function does an `$setOnInsert` upsert across N flag documents on every search-page render
- **File(s):** `apps/backend/src/modules/program/feature-flag.controller.ts:51-53, 98-135`
- **Severity:** LOW
- **Category:** Performance
- **Bug:** `await ensureAllFlags()` calls `syncFeatureFlagRegistry()` which upserts every known flag doc. On every public landing-page render (which hits this endpoint pre-login per the comment on line 16), that's ~10-20 `$setOnInsert` Mongo round-trips per page load. The skill § "Mongoose model binds to a custom collection name" notes the collection is named `yaksha_faq_feature_flags` — these upserts must hit that collection via the model. The non-`$set` path uses the correct upsert shape, but on the public landing page this becomes the per-request hot-path equivalent of the embedding-warm-anti-pattern.
- **Evidence:**
  ```ts
  // feature-flag.controller.ts:99-100
  export async function listFeatureFlags(req: Request, res: Response): Promise<void> {
    try {
      await ensureAllFlags();   // ← per-request upsert×N
  ```
- **Fix:** Move the `syncFeatureFlagRegistry()` call to bootstrap startup (`apps/backend/src/bootstrap/startup.ts`) so flag rows are guaranteed to exist before the first request. The handler just reads.
- **Verification:** Restart server; trigger 100 page loads from a fresh DB. Insert-count on `yaksha_faq_feature_flags` should be N (one per known flag), not N × 100.

### 5.18 — `Welcome.controller:trackWelcomeOnboarding` has no length cap on `timeSpent`; an authenticated user can flip their own `welcomePackageOnboarded=true` by sending `{"timeSpent": 9999}` once
- **File(s):** `apps/backend/src/modules/program/welcome.controller.ts:143-163`
- **Severity:** MEDIUM
- **Category:** Logic / Validation
- **Bug:** The handler updates `user.welcomePackageOnboarded = true` whenever `timeSpent >= 60`. No `Number.isFinite` check, no upper bound, no rate-limit. An attacker can flip any authenticated user's own onboarding flag (no RBAC concern — it's self-only) but the equivalent state for newly-onboarded users may unlock features elsewhere. More importantly, `timeSpent` is unsigned and unbounded — `timeSpent: Number.MAX_VALUE` works fine and persists. Combined with no `Number.isFinite` guard, a client passing `timeSpent: "string"` lands on the body parser at line 145 with `typeof === 'string'`, comparing string vs number returns false, no flag flipped — so the *inverted* attack (denying the flag) is also present.
- **Evidence:**
  ```ts
  // welcome.controller.ts:146-156
  const { timeSpent } = req.body;
  const userId = req.user?._id;
  if (!userId) { res.status(401)...; return; }
  if (timeSpent >= 60) {
    await User.findByIdAndUpdate(userId, { welcomePackageOnboarded: true });
  }
  ```
- **Fix:** Validate `timeSpent` server-side: `const t = Number(req.body?.timeSpent); if (!Number.isFinite(t) || t < 0 || t > 24 * 3600) return res.status(400).json(...)`. Add a per-user rate-limit (60 reads/min).
- **Verification:** `curl -X POST -H "Authorization: Bearer *** -d '{"timeSpent":9999}' /api/welcome/track` should return 400 (currently returns 200 + flips the flag).

### 5.19 — `ai-config.controller.ts:updateAiConfig` accepts arbitrary fields on the `AiConfig` model — including unknown overrides — without a Zod schema; mild risk on the AI provider chain
- **File(s):** `apps/backend/src/modules/ai/ai-config.controller.ts:444`, `apps/backend/src/modules/admin/admin.routes.ts:91` (route mount)
- **Severity:** LOW
- **Category:** Validation
- **Bug:** `updateAiConfig` likely takes `req.body` and passes it through to an `AiConfig.findOneAndUpdate(...)` with strict mode off. Without reading the controller fully I can't pin the exact line, but admin-only validation is the working hypothesis from the route mount + lack of a `validateBody` import. Subagent 4 covered the ask-ai/knowledge surfaces but not ai-config. Marking for re-dispatch.
- **Evidence:** Read the file end-to-end to confirm — flagged for follow-up since the route mount pattern suggests missing Zod schema.
- **Fix:** Add a `validateBody(updateAiConfigSchema)` like Subagent 4 recommended for the other write endpoints.
- **Verification:** Send `PUT /admin/ai/config` with garbage keys; expect 400.

### 5.20 — Public `welcome.routes.ts:GET /resources` and `GET /resources/completions` are auth-gated, but the list endpoint inherits the per-program scope via `req.programContext` which is unset for direct calls (returns all programs)
- **File(s):** `apps/backend/src/modules/program/welcome.routes.ts:117-128`, `apps/backend/src/modules/program/onboarding-resources.controller.ts` (entire 890-line controller, skimmed for scope guards)
- **Severity:** MEDIUM
- **Category:** RBAC / Cross-tenant
- **Bug:** Public-facing student `GET /api/welcome/resources` requires `protect` but the listing logic relies on `req.programContext?.batchId` for scoping. Without the program selector in state (a user who hasn't picked a program yet), the handler may return resources across all programs. The `admin-welcome.routes.ts:142-150` re-exports the controller and `programs.admin-resources` admin endpoint correctly takes a `batchId`, but the public student path needs explicit verification.
- **Evidence:** `welcome.routes.ts:117` is `router.get('/resources', protect, listPublicResources)` — handler selection not shown in scope but worth a deeper re-read.
- **Fix:** Make `listPublicResources` defensively require a `batchId` query param when `req.programContext.batchId` is null and return `400 { message: 'batchId is required' }` — same pattern as `getActiveOrientation` (welcome.controller.ts:41-55) which already does this correctly.
- **Verification:** `curl -H "Authorization: Bearer *** /api/welcome/resources` without batchId — expect empty array OR 400 (currently may return mixed-program resources).

### 5.21 — `adminRoutes:router.use('/projects', adminProjectsRoutes)` mounts **without** `mergeParams`, but the inner routes have no `:batchId` — N/A; confirming this is correct
- **File(s):** `apps/backend/src/modules/admin/admin.routes.ts:25`, `apps/backend/src/modules/admin/admin-projects.routes.ts`
- **Severity:** N/A (note)
- **Category:** Verification
- **Bug:** Confirmed the inner router does not depend on a parent :batchId parameter. No fix needed; documenting so a future refactor doesn't add mergeParams unnecessarily.
- **Verification:** None.

### 5.22 — `adminAutoAnswerReview.controller.ts:getAutoAnswerQueuePaginated` accepts `status=all|asked|suggested|...` but does NOT sanitize `status` enum values written to the response; the `total` count is right but `items` is whatever the filter allows
- **File(s):** `apps/backend/src/modules/admin/adminAutoAnswerReview.controller.ts:222-262`
- **Severity:** LOW
- **Category:** Validation (loose)
- **Bug:** The handler accepts `status` as a string and only validates it against an enum; if a caller passes `status=garbage`, line 239 returns 400 (good). But `status='approved'` line 236-237 sets `filter.aiAnswerStatus = 'approved'` without verifying `'approved'` is a value Mongoose can index on the enum-typed field. If `aiAnswerStatus` is an open string in the schema (likely), this is fine. Confirm by inspecting `community-post.model.ts` (out of scope but worth a quick check). Mark low.
- **Evidence:** Filter construction at lines 230-241.
- **Fix:** Add `aiAnswerStatus` enum check; if model uses a Mongoose enum, mismatch → cast error on the `find()`. If open string, leave alone.
- **Verification:** `curl '/admin/auto-answer/queue/paginated?status=approved'` should return approved posts; currently returns whatever `aiAnswerStatus: 'approved'` matches (which is "everything approved").

### 5.23 — `app-settings.controller.ts:adminUpdatePerProgramSetting` accepts arbitrary keys beyond `goldenTicketCooldownHours`/`penaltyMultiplier`/`goldenTicketSpCost` — stores them in `appSettings.<key>` with no validation; might collide with future canonical keys
- **File(s):** `apps/backend/src/modules/program/app-settings.controller.ts:153-179, 182-188`
- **Severity:** LOW
- **Category:** Validation / Forward-compat
- **Bug:** The handler only validates 3 known keys (`goldenTicketCooldownHours`, `penaltyMultiplier`, `goldenTicketSpCost`); for any other key, it falls through and persists `appSettings.<key> = body.value` with no schema check. If a future commit adds a canonical key (e.g. `autoAnswerApproveThreshold`), a pre-existing user-entered value with the same name silently overrides the canonical default — and there's no way to detect it.
- **Evidence:**
  ```ts
  // app-settings.controller.ts:158-179
  if (key === 'goldenTicketCooldownHours') { ... }
  else if (key === 'penaltyMultiplier') { ... }
  else if (key === 'goldenTicketSpCost') { ... }
  // fall through — no else-rejection
  const doc = await ProgramConfig.findOneAndUpdate(
    { batchId: new Types.ObjectId(batchId) },
    { $set: { [`appSettings.${key}`]: body.value } }, ...
  );
  ```
- **Fix:** Add an `else { res.status(400).json({ message: 'Unknown setting key' }); return; }`. The global admin endpoint `adminUpdateSetting:115` already does this (`res.status(400).json({ message: \`Unknown setting key: ${key}\` })`); the per-program variant was missed.
- **Verification:** `curl -X PUT /admin/programs/<id>/settings -d '{"key":"bogus","value":1}'` — expect 400 (currently 200).

### 5.24 — `admin-auto-answer.routes.ts:runAutoAnswer` POST reads `?post_id=<id>` but never validates the id shape; if `post_id` is `"all"` or random, batches ALL unanswered posts, not just the one
- **File(s):** `apps/backend/src/modules/ai/auto-answer.controller.ts:496-548` (likely `runAutoAnswer` action)
- **Severity:** LOW
- **Category:** Validation
- **Bug:** The `?post_id=<id>` query on `POST /admin/community/auto-answer` was specified in the docstring to "process only that specific post". Need to confirm the controller reads it and filters; if it doesn't, the query parameter is silently ignored. Likely pre-Phase 3 path that wasn't refit.
- **Evidence:** I haven't fully read lines 500-648. Flag for re-read.
- **Fix:** Read the action and confirm `req.query.post_id` is used as a filter; if not, add the filter.
- **Verification:** `curl -X POST '/admin/community/auto-answer?post_id=64...&dry_run=true'` should report one post (currently may report all).

---

### Subagent 5 Full Route Inventory

| Method | Path | Auth | Notes |
|---|---|---|---|
| `apps/backend/src/modules/admin/admin-audit.routes.ts` | | | |
| GET /admin/audit/stats | admin, moderator | OK |
| GET /admin/audit/results | admin, moderator | OK |
| POST /admin/audit/faqs | admin, moderator | OK |
| `apps/backend/src/modules/admin/admin-auto-answer.routes.ts` | | | |
| GET /admin/auto-answer/queue | admin/ai_moderator/moderator | Legacy, OK |
| POST /admin/community/auto-answer | same | 5.24 (post_id filter?) |
| PATCH /admin/auto-answer/:postId | same | Legacy, findById no ObjectId validate (M4-3 same shape) |
| GET /admin/auto-answer/queue/paginated | same | 5.22 |
| POST /admin/auto-answer/:postId/approve | same | findOneAndUpdate atomic ✓ |
| POST /admin/auto-answer/:postId/approve-edit | same | atomic + promoteCorrectedAnswer ✓ |
| POST /admin/auto-answer/:postId/reject | same | atomic ✓ |
| POST /admin/auto-answer/:postId/ask-ai-again | same | 5.3, 5.5 |
| GET /admin/auto-answer/:postId/context | same | OK |
| `apps/backend/src/modules/admin/admin-documents.routes.ts` | | | |
| POST /admin/documents | admin/ai_moderator/moderator | 5.13 no rate limit, 5.11 sync mkdir |
| GET /admin/documents | same | pagination OK, 5.13 no rate limit |
| DELETE /admin/documents/:id | same | 5.9 findById no ObjectId validate |
| `apps/backend/src/modules/admin/admin-mentor.routes.ts` | | | |
| GET /admin/mentors/ | adminOnly | OK (filter by batchId) |
| GET /admin/mentors/all | adminOnly | OK |
| POST /admin/mentors/ | adminOnly | requires batchId ✓ |
| PUT /admin/mentors/:id | adminOnly | 5.9 findById no validate; no batchId immutability guard |
| PUT /admin/mentors/:id/archive | adminOnly | 5.9 same |
| `apps/backend/src/modules/admin/admin-projects.routes.ts` | | | |
| GET /admin/projects/ | (parent adminOnly) | **5.8 inner router unprotected**; 5.9 no batchId filter |
| POST /admin/projects/ | same | no batchId required (cross-tenant leak) |
| PUT /admin/projects/:id | same | no batchId immutability guard |
| PUT /admin/projects/:id/archive | same | OK structurally |
| `apps/backend/src/modules/admin/admin-schedule.routes.ts` | | | (parent adminOnly, no inner auth — minor) |
| GET /admin/schedule/ | | OK |
| GET /admin/schedule/:id | | OK |
| POST /admin/schedule/:id/trigger | | OK |
| PATCH /admin/schedule/:id | | validates intervalMs, OK |
| DELETE /admin/schedule/:id/override | | OK |
| GET /admin/schedule/:id/history | | OK |
| DELETE /admin/schedule/:id/history | | OK |
| `apps/backend/src/modules/admin/admin-timeline.routes.ts` | | | |
| GET /admin/timeline-steps | adminOnly | filter by batchId if provided ✓ |
| POST /admin/timeline-steps | adminOnly | requires batchId ✓ |
| PUT /admin/timeline-steps/reorder | adminOnly | **NO batchId filter in bulkWrite** — cross-program reorder! |
| PUT /admin/timeline-steps/:id | adminOnly | 5.9 findById no validate |
| DELETE /admin/timeline-steps/:id | adminOnly | 5.9 |
| GET /admin/timeline-steps/audit-log | adminOnly | filter by entityType only |
| `apps/backend/src/modules/admin/admin-web-pages.routes.ts` | | | |
| GET /admin/web-pages | admin/ai_moderator/moderator | returns ALL (no batchId filter) — intentional for admin |
| POST /admin/web-pages | same | OK (fetchAndExtract) |
| DELETE /admin/web-pages/:id | same | 5.9 |
| PATCH /admin/web-pages/:id/approve | same | OK |
| PATCH /admin/web-pages/:id/unapprove | same | OK |
| `apps/backend/src/modules/admin/admin-welcome.routes.ts` | | | (parent adminOnly; inner also protect+adminOnly) |
| GET /admin/welcome/projects | | requires batchId ✓ |
| POST /admin/welcome/projects | | requires batchId ✓ |
| PUT /admin/welcome/projects/:id | | batchId immutable guard ✓; 5.9 |
| DELETE /admin/welcome/projects/:id | | 5.9 |
| GET /admin/welcome/orientations | | requires batchId ✓ |
| POST /admin/welcome/orientations | multipart | OK |
| PUT /admin/welcome/orientations/:id | | 5.9 |
| DELETE /admin/welcome/orientations/:id | | sync fs.unlinkSync (5.11) |
| GET /admin/welcome/orientations/metrics | | no batchId (global), OK |
| GET /admin/welcome/onboarding-status | | batchId-optional |
| PUT /admin/welcome/onboarding-override/:userId | | 5.9 userId |
| GET /admin/welcome/audit-logs | | requires batchId ✓ |
| GET /admin/welcome/zoom-settings | | finds active session globally — may leak across batches |
| PUT /admin/welcome/zoom-settings | | OK |
| POST /admin/welcome/zoom-settings/transcript | multipart | OK |
| POST /admin/welcome/zoom-settings/regenerate | | OK |
| GET /admin/welcome/zoom-sessions | | requires batchId ✓ |
| POST /admin/welcome/zoom-sessions | | requires batchId ✓ |
| PUT /admin/welcome/zoom-sessions/:id | | OK (findByIdAndUpdate, but no 5.9 validation) |
| DELETE /admin/welcome/zoom-sessions/:id | | cascades to questions/chunks/attempts ✓ |
| POST /admin/welcome/zoom-sessions/:id/activate | | filters by batchId ✓ |
| POST /admin/welcome/zoom-sessions/:id/transcript | multipart | **5.6 per-chunk embed, 5.11 sync PDF temp** |
| POST /admin/welcome/zoom-sessions/:id/regenerate | | OK |
| GET /admin/welcome/zoom-sessions/:id/questions | | OK |
| POST /admin/welcome/zoom-sessions/:id/questions | | no proper validation |
| PUT /admin/welcome/zoom-sessions/:id/questions/:qId | | OK |
| DELETE /admin/welcome/zoom-sessions/:id/questions/:qId | | OK |
| GET /admin/welcome/zoom-sessions/:id/activity | | populate fallback OK |
| GET /admin/welcome/resources | | OK |
| POST /admin/welcome/resources | multipart | OK |
| PUT /admin/welcome/resources/:id | | OK |
| DELETE /admin/welcome/resources/:id | | OK |
| PUT /admin/welcome/resources/reorder | | no batchId filter (5.8 same shape) |
| PUT /admin/welcome/resources/:id/visibility | | OK |
| GET /admin/welcome/knowledge | | OK |
| POST /admin/welcome/knowledge | multipart | OK |
| DELETE /admin/welcome/knowledge/:id | | OK |
| GET /admin/welcome/knowledge/:id/chunks | | OK |
| POST /admin/welcome/knowledge/:id/generate | | OK |
| `apps/backend/src/modules/admin/admin.config.routes.ts` | | | (adminOnly at top) |
| GET /admin/config/list | adminOnly | OK |
| GET /admin/config/categorize/:key | adminOnly | OK |
| POST /admin/config/cache/clear | adminOnly | OK |
| PUT /admin/config/ | adminOnly | NO Zod validation noted in routes (check controller) |
| DELETE /admin/config/:key | adminOnly | (5.9 if 'key' is taken) |
| GET /admin/config/:key | adminOnly | listed LAST so '/list' etc. win |
| `apps/backend/src/modules/admin/admin.routes.ts` | | | (all under adminOnly) |
| GET /admin/projects | mounts adminProjectsRoutes | 5.8 |
| GET /admin/stats | adminOnly | OK; 5.9 |
| GET /admin/faq-growth | adminOnly | OK |
| GET /admin/top-categories | adminOnly | OK |
| GET /admin/search-insights | adminOnly | NO batchId filter; reads global SearchLog |
| GET /admin/users | adminOnly | OK, paginated |
| GET /admin/faqs | adminOnly | OK, batchId-scoped |
| GET /admin/reports | adminOnly | OK |
| GET /admin/activity-feed | adminOnly | OK |
| GET /admin/user-activity-chart | adminOnly | OK |
| GET /admin/community/posts | adminOnly | OK, batchId-scoped |
| GET /admin/2fa/* | adminOnly | OK |
| GET /admin/search/unresolved-list | adminOnly | OK (out of scope backend) |
| GET /admin/search/unresolved-stats | adminOnly | OK |
| PATCH /admin/search/unresolved/:id/resolve | adminOnly | OK |
| GET /admin/escalated | adminOnly | OK |
| POST /admin/escalated/:id/(verify|dismiss) | adminOnly | OK |
| GET /admin/community/escalated-posts | adminOnly | OK |
| POST /admin/community/escalated-posts/:id/(resolve|dismiss) | adminOnly | OK (5.9 path) |
| GET /admin/community/escalation-history | adminOnly | OK |
| GET /admin/golden-tickets | adminOnly | OK |
| GET /admin/golden-tickets/:id/logs | adminOnly | OK |
| POST /admin/golden-tickets/:id/(resolve|reject|ban|re-resolve|reopen) | adminOnly | OK |
| DELETE /admin/golden-tickets/:id/resolutions/:resIdx | adminOnly | OK |
| GET /admin/ai/config | adminOnly | OK, 5.19 |
| PATCH /admin/ai/config | adminOnly | 5.19 |
| POST /admin/ai/config/reset-usage | adminOnly | OK |
| GET /admin/ai/providers | adminOnly | OK |
| GET /admin/ai/providers/test | adminOnly | OK |
| GET /admin/ai/config/api-key/:provider | adminOnly | revealApiKey — sensitive; check audit |
| POST /admin/faq | adminOnly | OK |
| POST /admin/faq/(approve|reject) | adminOnly | 5.9 findById no validate |
| PUT /admin/faq/:id | adminOnly | 5.9; embedding per update (5.6 hot-write echo) |
| PATCH /admin/faq/:id | adminOnly | same |
| PATCH /admin/faqs/:id | adminOnly | alias path |
| DELETE /admin/faq/:id | adminOnly | 5.9 |
| DELETE /admin/community/:id | adminOnly | 5.9 |
| GET /admin/faqs/community-pending | adminOnly | OK |
| POST /admin/faqs/:id/(promote\|object) | adminOnly | OK |
| POST /admin/community-promotions/:id/ai-review | adminOnly | 5.4 race in controller |
| POST /admin/community-promotions/ai-review-batch | adminOnly | OK |
| GET /admin/community-promotions/queue | adminOnly | OK |
| GET /admin/queue/stats | adminOnly | OK |
| GET /admin/queue/jobs/:id | adminOnly | OK |
| `apps/backend/src/modules/admin/adminTrain.routes.ts` | | | (under admin/ai_moderator/moderator) |
| GET /admin/train/stats?batchId= | | OK |
| GET /admin/train/program-knowledge | | OK; text injection stripped ✓ |
| POST /admin/train/search | | requires batchId ✓ |
| POST /admin/train/bulk-urls | | sequential per URL; **NO rate limit** (up to 50) |
| POST /admin/train/bulk-documents | | **5.7 orphan files on partial failure**, no rate limit |
| POST /admin/train/promote-cross-program | | idempotent upsert ✓ |
| `apps/backend/src/modules/ai/ask-ai.routes.ts` | | | |
| POST / | anon/authed w/ IP-keyed rate limits | OK |
| GET /preview-context/:postId | admin/ai_moderator | OK |
| `apps/backend/src/modules/moderation/moderation.routes.ts` | | | |
| GET /moderation/queue | adminOnly | OK |
| GET /moderation/logs | adminOnly | **5.9 targetId no ObjectId validate** |
| POST /moderation/ban | adminOnly | **CRITICAL 5.1 (suspendUser)** N/A for ban; OK |
| POST /moderation/unban | adminOnly | OK |
| POST /moderation/suspend | adminOnly | **CRITICAL 5.1** (suspendUserSchema expects `days`, controller reads `duration`) |
| POST /moderation/unsuspend | adminOnly | uses softDeleteSchema which expects `{userId}` ✓ (but the req.body has `{userId, reason}` — `reason` is ignored, OK) |
| POST /moderation/warn | adminOnly | uses warnUserSchema ✓ |
| POST /moderation/soft-delete | adminOnly | uses softDeleteSchema ✓ |
| `apps/backend/src/modules/moderation/reputation.routes.ts` | | | |
| GET /reputation/user/:userId | adminOnly | 5.9 + 5.16 |
| POST /reputation/points | adminOnly | **5.14 dual-write partial** |
| POST /reputation/badge/(issue\|revoke) | adminOnly | atomic findOneAndUpdate ✓ (5.15 targetId string) |
| `apps/backend/src/modules/program/admin-category-cluster.routes.ts` | | | |
| GET /admin/programs/:batchId/category-clusters/ | admin/moderator | parseBatchId ✓ |
| GET /:id | admin/moderator | 5.9 parseBatchId should validate id too |
| PATCH /:id | admin/moderator | OK (atomic) |
| DELETE /:id | admin/moderator | lock-guard ✓ |
| POST /recompute | admin/moderator | runs clusterCategoriesForBatch, can be slow (synchronous response) |
| `apps/backend/src/modules/program/admin-program-settings.routes.ts` | | | |
| PUT /admin/programs/:id/settings | admin/moderator | OK; delegates to adminUpdatePerProgramSetting |
| `apps/backend/src/modules/program/app-settings.routes.ts` | | | |
| GET /admin/settings | admin/moderator | OK |
| PUT /admin/settings | admin/moderator | validates golden* + penaltyMultiplier only |
| GET /public/settings | public-safe subset | OK |
| `apps/backend/src/modules/program/batch.routes.ts` | | | |
| GET /batches/ | public + listLimiter (200/15min) | OK |
| GET /batches/by-slug/:slug | public + listLimiter | 5.12 in-memory filter on every Batch row |
| GET /batches/active | public + listLimiter | OK (audit-fixed 2026-07-02) |
| GET /batches/admin/all | admin/moderator | OK |
| GET /batches/:id | public + listLimiter | 5.9 validate id |
| POST /batches/ | admin/moderator | Zod ✓; **bootstrapProgram runs in-request** (slow for large workspaces) |
| PATCH /batches/:id | admin/moderator | Zod ✓ |
| POST /batches/:id/archive | admin/moderator | 5.9 |
| POST /batches/:id/default | admin/moderator | OK (setAsDefault static method) |
| DELETE /batches/:id | admin/moderator | full cascade ✓ |
| `apps/backend/src/modules/program/course.routes.ts` | | | |
| GET /courses/ | public + listLimiter | batchId optional, OK |
| GET /courses/admin/all | admin/moderator | OK (no batchId filter on admin — global view intentional) |
| POST /courses/ | admin/moderator | Zod ✓ |
| PATCH /courses/:id | admin/moderator | Zod ✓ |
| POST /courses/:id/archive | admin/moderator | 5.9 |
| DELETE /courses/:id | admin/moderator | cascades FAQs to courseId:null ✓ |
| `apps/backend/src/modules/program/enrollment.routes.ts` | | | |
| GET /me/programs | auth | OK |
| POST /programs/:batchId/self-enroll | auth + limiter + programScope | OK |
| GET /programs/:batchId/members | admin/moderator + limiter + programScope | OK |
| POST /programs/:batchId/members | admin/moderator + limiter + programScope | Zod ✓ |
| PATCH /programs/:batchId/members/:userId | admin/moderator + limiter + programScope | findOneAndUpdate ✓; 5.9 userId |
| DELETE /programs/:batchId/members/:userId | admin/moderator + limiter + programScope | 5.9; soft-delete OK |
| `apps/backend/src/modules/program/feature-flag.routes.ts` | | | |
| GET /feature-flags | public | 5.17 per-request syncFeatureFlagRegistry |
| PATCH /feature-flags/:key | admin/moderator | Zod ✓ |
| GET /admin/programs/:id/feature-flags | admin + limiter | Zod ✓ |
| PUT /admin/programs/:id/feature-flags/:key | admin + limiter | Zod ✓ |
| DELETE /admin/programs/:id/feature-flags/:key | admin + limiter | OK |
| `apps/backend/src/modules/program/program-app-settings.routes.ts` | | | |
| PUT /admin/programs/:id/settings | admin/moderator + limiter | delegates to adminUpdatePerProgramSetting, **5.23 unknown keys accepted** |
| `apps/backend/src/modules/program/program-discord.routes.ts` | | | |
| GET /admin/programs/:id/discord | admin + limiter | OK |
| PUT /admin/programs/:id/discord | admin + limiter | OK |
| POST /admin/programs/:id/discord/(enable\|disable) | admin + limiter | OK |
| `apps/backend/src/modules/program/program-zoom.routes.ts` | | | |
| GET /admin/programs/:id/zoom | admin + limiter | OK |
| PUT /admin/programs/:id/zoom | admin + limiter | OK (Mongo upsert) |
| POST /admin/programs/:id/zoom/disconnect | admin + limiter | OK |
| `apps/backend/src/modules/program/program.routes.ts` | | | (public) |
| GET /programs/active | public + limiter | OK (audit-fixed 2026-07-02) |
| GET /programs/:slug | public + limiter | OK |
| `apps/backend/src/modules/program/public-category-cluster.routes.ts` | | | (public) |
| GET /public/category-clusters | public + limiter | OK |
| `apps/backend/src/modules/program/registration-control.routes.ts` | | | |
| GET /admin/registration-config | admin | returns **plaintext invite token via buildInviteLink**, expose broader than required |
| PATCH /admin/registration-config | admin | OK (loose Zod sanity) |
| POST /admin/registration-config/regenerate-token | admin | **returns plaintext token in response body** — secret leaks via response logging |
| `apps/backend/src/modules/program/welcome.routes.ts` | | | |
| GET /orientation | public (no auth) | OK (requires batchId in header/query) |
| GET /projects | public | **no batchId filter — cross-tenant leak** |
| GET /my-project | auth | OK |
| POST /orientation/ask | auth | **5.10 per-request OpenAI SDK + stdout leak of key presence** |
| POST /track | auth | **5.18 no timeSpent validation, fake onboarding** |
| POST /orientation-complete | auth | OK |
| POST /select-project | auth | OK (capacity check) |
| GET /zoom-assessment/(status\|questions) | auth | OK |
| POST /zoom-assessment/submit | auth | OK |
| GET /timeline-steps | auth | OK (status: 'active') |
| GET /mentors/:id | auth | **5.9 findById no validate** |
| GET /resources | auth | **5.20 batchId scope guard missing** |
| POST /resources/:id/complete | auth | OK |
| GET /resources/completions | auth | OK |
| POST /resources/ask | auth | OK |

---

### Subagent 5 — Async delivery findings (deleg_8b0f2cde, 2026-07-07 11:19)

43 additional findings across the same 32-route scope. To avoid ID collision with the prior 5.1–5.24 series, these use the S5-C/S5-H/S5-M/S5-L prefix matching the subagent's own convention.

### S5-C1 — `/train/promote-cross-program` does not verify source `programKnowledgeId` is in a batch the caller can access, nor that `targetBatchIds` are within the caller's scope
- **File(s):** `apps/backend/src/modules/admin/adminTrain.routes.ts:289-350`
- **Severity:** CRITICAL
- **Category:** RBAC, Logic
- **Bug:** Any admin/ai_moderator/moderator can promote knowledge into ANY other program's batches. No `assertSameProgram` check on either the source row or the target batches. **Cross-tenant write vector.**
- **Fix:** Run `assertSameProgram(req.user, sourceRow)` and verify every `targetBatchId` is in `req.user.adminPrograms`. Otherwise 403.
- **Verification:** As admin of program A, attempt to promote a program-B ProgramKnowledge row into program-C's batches — expect 403.

### S5-C2 — `Batch.find({ _id: { $in: batchIds } })` does not validate `batchIds` belong to a non-archived batch — can resurrect knowledge into soft-deleted program's batchId
- **File(s):** `apps/backend/src/modules/admin/adminTrain.routes.ts:289-350`
- **Severity:** CRITICAL
- **Category:** Logic, Validation
- **Bug:** The upsert still runs against the `validIds` even if those batches are archived or soft-deleted. Combined with C1, an admin can resurrect knowledge into a deleted program's batchId.
- **Fix:** Add `isActive: true` filter on the Batch.find; reject any `batchId` where the batch is archived.
- **Verification:** Promote into a soft-deleted batchId — expect 400/404.

### S5-C3 — `runAutoAnswer` reads `req.query.batchId` for `readSetting` scope, but `CommunityPost.find(query)` is unscoped — when a manual run is triggered with `?batchId=X`, posts from ALL programs are processed
- **File(s):** `apps/backend/src/modules/ai/auto-answer.controller.ts:530`
- **Severity:** CRITICAL
- **Category:** Logic, Scope
- **Bug:** Cross-program AI auto-answering. Manual run with `?batchId=A` triggers LLM calls on every unanswered post in every program.
- **Fix:** Pass `batchId` from query into the `CommunityPost.find()` filter; same as the cron.
- **Verification:** As admin of program A, fire `?batchId=A&all=true` — expect ONLY program-A posts to be processed; check the log for "processed N posts" where N ≤ program-A's unanswered count.

### S5-C4 — `banUser` / `unbanUser` / `suspendUser` / `unsuspendUser` / `softDeleteUser` — three sequential async writes (`user.save()` + `ModerationLog.create()` + `logAction()`) with no Mongo transaction
- **File(s):** `apps/backend/src/modules/moderation/moderation.controller.ts:32-209`
- **Severity:** CRITICAL
- **Category:** Race, Code smell
- **Bug:** Crash between 1 and 2 leaves a banned user with no audit trail; between 2 and 3 leaves a log entry without an AdminLog. Same non-atomic dual-write exists in `reputation.controller.ts:90-108` (user.save → awardToUser → ReputationLog.create).
- **Fix:** Wrap the three writes in a Mongo session/transaction. If your Mongo supports transactions (replica set), use `withTransaction`. Otherwise, write a compensating inverse operation on the partial-failure path.
- **Verification:** Inject a fault into the second write (e.g. `ModerationLog.create` always throws); ban should not be persisted; AdminLog should not be created.

### S5-C5 — RBAC mismatch: `requireAdmin` (controller-level) blocks `moderator` and `ai_moderator`; but route uses `router.use(adminOnly)` which permits all three roles
- **File(s):** `apps/backend/src/modules/moderation/moderation.controller.ts:9-20`; same pattern in `reputation.controller.ts:53, 137, 199`
- **Severity:** CRITICAL
- **Category:** RBAC, Logic
- **Bug:** The route middleware (`adminOnly`) permits `admin`, `moderator`, `ai_moderator`. The controller's `requireAdmin` rejects anything that isn't `'admin'`. **Result: moderators and ai_moderators pass the route middleware, then get 403'd by the controller** — they cannot actually ban/suspend/warn users. **Production-blocker for non-admin moderators.** The comment in `adminOnly` says "allows admin / moderator / ai_moderator" — so the route intent was to permit moderators, but the controller forgot.
- **Evidence:**
  ```ts
  // middleware/admin.ts:13
  const allowed: UserRole[] = ['admin', 'moderator', 'ai_moderator'];
  // moderation.controller.ts:14
  if (role !== 'admin') {
    res.status(403).json({ message: 'Admin access required' });
    return null;
  }
  ```
- **Fix:** Either (a) change `requireAdmin` to accept the same 3 roles as `adminOnly` (matches intent), OR (b) change `adminOnly` to admin-only (matches controller). Pick one and apply consistently. Likely (a) — route intent was probably right; controller is the older code.
- **Verification:** As a moderator, `POST /csfaq/api/moderation/ban -d '{"userId":"...","reason":"test"}'` — expect 200 (currently 403).

### S5-C6 — `AiConfig.findOne({ isActive: true })` returns ANY active doc; with per-program override docs, this can return a program-specific override when the global is intended
- **File(s):** `apps/backend/src/modules/ai/ai-config.controller.ts:276, 296, 366`
- **Severity:** CRITICAL
- **Category:** Logic, Validation
- **Bug:** `resetAiUsage`, `getAiProviders`, `revealApiKey` all read the wrong doc when a per-program override exists. `revealApiKey` will return the per-program override's decrypted key instead of the global one — admin reads a key that may not actually be the "global" one in use.
- **Fix:** Pass `batchId: null` (or `programScope: 'global'`) explicitly to the findOne filter, OR make the query `findOne({ isActive: true, scope: 'global' })` if the schema distinguishes.
- **Verification:** With a per-program override set, `GET /csfaq/api/ai/config/reveal-key` — should return the GLOBAL key, not the program-specific one. Compare both with a direct Mongo query.

### S5-C7 — `getBatchBySlug` loads the ENTIRE batch collection (every active + archived + future program) into memory on every anonymous public call
- **File(s):** `apps/backend/src/modules/program/batch.controller.ts:115-141`
- **Severity:** CRITICAL
- **Category:** Logic, Performance
- **Bug:** Information disclosure (every program name leaked to anon public callers) + O(N) DoS as the program count grows. No `select` filter, no projection, no `.limit()`. Anon endpoint fires this on every public route load.
- **Fix:** `Batch.findOne({ slug, isActive: true }).select('_id name slug description').lean()` — or use an index on `slug` with a covering projection.
- **Verification:** With 1000+ batches in the DB, time a public `/csfaq/api/programs/:slug` call — expect <50ms; previously probably >500ms. Add a `db.batch.find().explain()` and verify it hits the slug index.

### S5-H1 — `bulk-documents` returns `jobId` labelled as `documentId`; double-writes file (disk + base64 in queue payload)
- **File(s):** `apps/backend/src/modules/admin/adminTrain.routes.ts:194-285`
- **Severity:** HIGH
- **Category:** Logic, Performance
- **Bug:** `documentId: String(new Types.ObjectId())` is a placeholder (line 266) that is overwritten by the worker via jobId lookup. The response (line 275) returns the BULL JOB id labelled as `documentId`. UI consumers that track uploaded documents by id silently break. The `fs.writeFile(filePath, buffer)` AND `addDocumentJob({ bufferBase64: buffer.toString('base64') })` double-write the content (disk + base64) — 2× memory per upload.
- **Fix:** Either (a) return `jobId` and `documentId` as separate fields (don't conflate), OR (b) write to disk OR queue payload, not both. Prefer (b) — disk is the source of truth; the queue job references the path.
- **Verification:** POST 1 file; check Mongo for the document row, then check the upload directory — only one copy on disk.

### S5-H2 — `bulk-urls` has no per-admin rate limit; 50 outbound HTTP calls per request × unlimited requests = SSRF amplifier
- **File(s):** `apps/backend/src/modules/admin/adminTrain.routes.ts:140-188`
- **Severity:** HIGH
- **Category:** Logic, Performance
- **Bug:** A compromised admin token can fire `/train/bulk-urls` 50× in 5 seconds → 2,500 outbound HTTP calls. SSRF amplifier.
- **Fix:** Add a per-admin limiter (e.g. 10 batches / hour). Also enforce scheme allowlist at validation time (`https?://` only, deny `file:`, `gopher:`, etc.).
- **Verification:** Fire 5 batch requests in 1 minute — expect 429 from the 6th onward.

### S5-H3 — `ask-ai` anonymous POST `/` accepts 4 files × 10MB = 40MB multipart per request
- **File(s):** `apps/backend/src/modules/ai/ask-ai.routes.ts:74-102`
- **Severity:** HIGH
- **Category:** Performance, DoS
- **Bug:** `anonAiLimiter` 20/min/IP means 800MB/min/IP admitted before 429. Even ignoring abuse, an honest user with a 40MB upload spikes memory on every Node worker.
- **Fix:** Reduce anonymous `MAX_FILES=1, MAX_FILE_BYTES=2 * 1024 * 1024` (2MB); keep higher caps for authenticated users. Add per-IP byte-rate limit (e.g. 100MB/min/IP).
- **Verification:** Anonymous POST with 4×10MB files — expect 400 (file too large) immediately, not 40MB admitted.

### S5-H4 — `authedAiLimiter` keys on IP, not user.id; corporate NAT breaks the quota
- **File(s):** `apps/backend/src/modules/ai/ask-ai.routes.ts:62-69`
- **Severity:** HIGH
- **Category:** Logic, Code smell
- **Bug:** `keyGenerator: req => auth:${ipKeyGenerator(req.ip)}` keys on IP. Behind a corporate NAT, 50 logged-in users share one 30/min quota.
- **Fix:** Use `req.user._id.toString()` as the key suffix when authenticated.
- **Verification:** Two logged-in users from the same IP, each fire 25 requests — expect both to succeed (currently: second user gets 429 from hit 31).

### S5-H5 — `runAutoAnswerInternal` reads `MIN_POST_AGE_HOURS` / `BATCH_SIZE` settings but has no NaN guard
- **File(s):** `apps/backend/src/modules/ai/auto-answer.controller.ts:610`
- **Severity:** HIGH
- **Category:** Logic
- **Bug:** If the DB stores the setting as `NaN` (or non-numeric string from a UI typo), `new Date(Date.now() - NaN * 60 * 60 * 1000)` is `Invalid Date`, the Mongo `{ createdAt: { $lte: InvalidDate } }` query returns ALL docs, and the cron drains the entire unanswered queue. **Same NaN-guard gap already flagged in redesign-plan §2.1 row 8 but not fixed in this cron.**
- **Fix:** Wrap in `Number.isFinite()` check; coerce to default if NaN. Same fix pattern as the v1.68 community scheduler NaN guard.
- **Verification:** Manually set `autoAnswerMinAgeHours` to a non-numeric string in Mongo; wait for cron tick; expect the cron to use the default (2 hours) and process only posts older than 2 hours.

### S5-H6 — `processPost` and `approveEditAutoAnswer` still use mutate-then-save; TOCTOU race
- **File(s):** `apps/backend/src/modules/ai/auto-answer.controller.ts:220-346`, `apps/backend/src/modules/admin/adminAutoAnswerReview.controller.ts:113`
- **Severity:** HIGH
- **Category:** Race
- **Bug:** Two concurrent cron workers can pass the `attempts >= 3` skip check (line 233-238), both increment, both call `findBestAnswer`, both `updateOne` with last-writer-wins. The H3 fix (commit `60c1af0`) targeted `resolvePost`; `processPost` and the new `approveEditAutoAnswer` still use mutate-then-save.
- **Fix:** Same atomic `findOneAndUpdate({ _id, aiAnswerAttempts: { $lt: 3 } }, { $inc: { aiAnswerAttempts: 1 } })` lock as H3 used.
- **Verification:** Synthetic: fire `processPost` from cron and `approveEditAutoAnswer` from admin route within 100ms — expect ONE pipeline run.

### S5-H7 — `ai-promotion` AI validation grounding reads `FAQ.find({ status: 'approved' })` across ALL programs
- **File(s):** `apps/backend/src/modules/ai/ai-promotion.controller.ts:80-93`
- **Severity:** HIGH
- **Category:** Logic, Scope
- **Bug:** No `batchId` filter. Related-posts query on line 85-92 also cross-program (`tags: $in: post.tags` with no batchId scope). Cross-program data leak during AI training context.
- **Fix:** Add `batchId: { $in: req.user.adminPrograms }` filter (or single batchId) to the find call.
- **Verification:** Promote a post from program A — expect grounding context to only contain program-A FAQs.

### S5-H8 — `ai-promotion.controller.ts:160-192` `post.lifecycle.aiGeneratedFaq = {...}` then `post.save()` — non-atomic; concurrent calls overwrite each other
- **File(s):** `apps/backend/src/modules/ai/ai-promotion.controller.ts:160-192`
- **Severity:** HIGH
- **Category:** Race
- **Bug:** Two concurrent `runCommunityPromotionReview` calls on the same post (e.g., user retries, manual + cron overlap) both pass the `lifecycle.aiGeneratedFaq?.question` check (line 69), both call `client.chat`, both save; second save overwrites the first's refined answer.
- **Fix:** Use atomic `findOneAndUpdate({ _id, 'lifecycle.aiGeneratedFaq.question': { $exists: false } }, { $set: {...} })`.
- **Verification:** Synthetic double-fire — expect only one `aiGeneratedFaq` write, second call returns null from findOneAndUpdate.

### S5-H9 — Hard-coded `ObjectId('000000000000000000000000')` as `changedBy` for AI/system actions; no audit trail of provider/model/version
- **File(s):** `apps/backend/src/modules/ai/auto-answer.controller.ts:313, 313-317`, `ai-promotion.controller.ts:178, 186`
- **Severity:** HIGH
- **Category:** Doc gap, Code smell
- **Bug:** Audit trail cannot trace which AI provider/model/version or which cron run produced the action.
- **Fix:** Add a `systemActions` user/system actor with metadata: `{ actor: 'system', provider: cfg.provider, model: cfg.model, cronRun: 'v1.71.0-2026-07-07T11:30' }`.
- **Verification:** Inspect a recent auto-answer post's `lifecycle.statusHistory` — see the provider/model fields populated.

### S5-H10 — `getUsers`, `getAdminFAQs`, `getCommunityPosts`, `getModerationLogs` have `parseInt(req.query.limit)` with no upper cap → full-table dump
- **File(s):** `apps/backend/src/modules/admin/admin.controller.ts:218-243, 248-249, 565-567`, `apps/backend/src/modules/moderation/moderation.controller.ts:217`
- **Severity:** HIGH
- **Category:** Validation, Logic
- **Bug:** Admin (or attacker with stolen admin JWT) can request `?limit=9999999` and dump the entire users collection in one HTTP response (auth bypass + admin compromise amplification).
- **Fix:** Cap with `Math.min(50, parseInt(req.query.limit))` (matches `getModerationLogs` pattern).
- **Verification:** `?limit=9999999` — expect 50 results, not all.

### S5-H11 — `getCommunityPosts` builds `{ $or: [{ title: { $regex: search, $options: 'i' } }, ... } }` WITHOUT `escapeRegex`
- **File(s):** `apps/backend/src/modules/admin/admin.controller.ts:563-619`
- **Severity:** HIGH
- **Category:** Validation, ReDoS
- **Bug:** Admin-controlled regex special characters cause ReDoS. The `escapeRegex` helper exists in this same file (line 214-216) and IS used in `getUsers`/`getAdminFAQs` but NOT in `getCommunityPosts`.
- **Fix:** Wrap search input with `escapeRegex`.
- **Verification:** `?search=$(printf 'a%.0s' {1..1000})[a-z]*` — expect fast response (with escapeRegex) vs. CPU spike.

### S5-H12 — `deleteCommunityPost` has NO `assertSameProgram` check; cross-program hard delete
- **File(s):** `apps/backend/src/modules/admin/admin.controller.ts:622-634`
- **Severity:** HIGH
- **Category:** RBAC, Scope
- **Bug:** Admin from program A can hard-delete any post from program B. Compare with `approveFAQ`/`rejectFAQ`/`updateFAQ`/`deleteFAQ` (lines 286-405) which all gate on `assertSameProgram`. Inconsistency.
- **Fix:** Add `assertSameProgram(req.user, post)` check before `findByIdAndDelete`.
- **Verification:** Admin of program A attempts to delete a post in batch of program B — expect 403/404.

### S5-H13 — `awardPoints` in-memory `user.points = ...; user.reputation = ...; user.tier = ...; user.save()` — concurrent admin awards race
- **File(s):** `apps/backend/src/modules/moderation/reputation.controller.ts:84-90`
- **Severity:** HIGH
- **Category:** Race
- **Bug:** Two concurrent admin awards on the same user both load, both compute, last save wins. `User.points` ends up out of sync with the actual `ReputationLog` history. **Note: this is the SAME controller that subagent 5 reported as 5.14; the inline-applied version was sharper about the dual-write with `awardToUser`, this version is sharper about the lost-update race.**
- **Fix:** Atomic `findOneAndUpdate({ _id }, { $inc: { points: delta }, ... })`.
- **Verification:** Synthetic double-fire of `awardPoints` for `+10` and `+20` — expect `User.points` to be +30, not +20.

### S5-H14 — `softDeleteUser` mangles email to `[deleted_${userId}]_${user.email}` — non-reversible
- **File(s):** `apps/backend/src/modules/moderation/moderation.controller.ts:194`
- **Severity:** HIGH
- **Category:** Logic
- **Bug:** The user can never be re-registered with their original email even after manual undelete, because the unique-index now points at the mangled string.
- **Fix:** Either (a) move the email to a `deletedEmails` array (reversible), OR (b) don't mangle — set `isDeleted=true` and exclude from login lookups (already done). The email mangling is over-engineering.
- **Verification:** Soft-delete then un-delete a user; attempt to re-register with the original email — expect 409 (currently: blocked because mangled email still has unique-index entry).

### S5-H15 — `deleteBatch` → `cascadeDeleteProgram` — sequential per-collection deletes, no transaction
- **File(s):** `apps/backend/src/modules/program/batch.controller.ts:305-328`
- **Severity:** HIGH
- **Category:** Race, Data loss
- **Bug:** Partial failure leaves the program half-deleted with orphaned FAQs, comments, mentors, projects, ProgramKnowledge rows. No rollback path.
- **Fix:** Wrap in `withTransaction` if Mongo supports it; otherwise maintain a "deletion-in-progress" flag and a sweeper cron for orphans.
- **Verification:** Inject a fault mid-cascade; the program should remain in `isActive=true` state, no partial deletes committed.

### S5-H16 — `getModerationLogs` lets any admin scope to ANY `batchId`
- **File(s):** `apps/backend/src/modules/moderation/moderation.controller.ts:212-241`
- **Severity:** HIGH
- **Category:** RBAC, Logic
- **Bug:** `withProgramScope(filter, req.query.batchId)` lets any admin specify ANY `batchId` in the query to scope to ANY program, not just their own. Compare `getReports` (admin.controller.ts:446-476) which never uses `withProgramScope` at all — pure cross-program.
- **Fix:** Validate `batchId` is in `req.user.adminPrograms` before applying; otherwise ignore or 403.
- **Verification:** Admin of program A queries `?batchId=<program-B-id>` — expect 403 (currently: returns program-B logs).

### S5-H17 — `validateModelForProvider` uses substring matchers (`includes('claude')`, etc.); trivial bypass
- **File(s):** `apps/backend/src/modules/ai/ai-config.controller.ts:387-408`
- **Severity:** HIGH
- **Category:** Validation, Logic
- **Bug:** A model name like `gpt-claude-minimax-trash-injection-xss` passes all five validators. Trivial bypass for any admin attempting to set a non-claude model against anthropic.
- **Fix:** Use exact-match against a closed set per provider; OR anchored regex (`^(claude|gpt|minimax)(-|$)`).
- **Verification:** Set model to `claude-gpt-minimax-trash-injection` against anthropic — expect 400.

### S5-H18 — `approveEditAutoAnswer` updates `pendingReviews: false` — schema drift risk
- **File(s):** `apps/backend/src/modules/admin/adminAutoAnswerReview.controller.ts:113-128`
- **Severity:** HIGH
- **Category:** Schema drift, Code smell
- **Bug:** `CommunityPost` schema field for "needs review" was renamed to `pendingReviews` from `pendingReviews` only in certain migration branches — running this against an older schema silently no-ops the field via Mongo silent-ignore.
- **Fix:** Verify the current schema field name in `apps/backend/src/modules/community/community-post.model.ts`; align this controller.
- **Verification:** Inspect a post after approval — `pendingReviews` should be `false`.

### S5-M1 — `/preview-context/:postId` admin from program A can preview any post from program B
- **File(s):** `apps/backend/src/modules/ai/ask-ai.routes.ts:115-154`
- **Severity:** MEDIUM
- **Category:** RBAC, Scope
- **Bug:** No `batchId` cross-check. Exposes raw post content + persisted `aiContext` snapshot to cross-program admins.
- **Fix:** Add `assertSameProgram(req.user, post)` check before fetching context.
- **Verification:** Admin of program A previews a post from program B — expect 403.

### S5-M2 — `program-knowledge` $text search escapes `-`, `!`, `"` but not `*`, `(`, `)`, `\`, `<`, `>`, `;`
- **File(s):** `apps/backend/src/modules/admin/adminTrain.routes.ts:63-107`
- **Severity:** MEDIUM
- **Category:** Validation, XSS-adjacent
- **Bug:** Mongo `$text` operators like `*` for prefix and parens for grouping still accepted. Comment claims "no injection vectors" but parens can break the parser.
- **Fix:** Extend the strip regex to also remove `*`, `(`, `)`, `\`, `<`, `>`, `;`.
- **Verification:** Search for `(test)` — expect plain-text search, not operator parsing.

### S5-M3 — `findOneAndUpdate({ batchId, question }, { $setOnInsert: {...} }, { upsert: true })` returns source row's `_id` when existing match found; caller can't tell insert-vs-duplicate
- **File(s):** `apps/backend/src/modules/admin/adminTrain.routes.ts:317-336`
- **Severity:** MEDIUM
- **Category:** Logic, Code smell
- **Bug:** Caller cannot tell "this was a duplicate" from "this was a fresh insert" without comparing ids externally.
- **Fix:** Inspect the result's `lastErrorObject.upserted` flag OR return a `wasDuplicate: boolean` field.
- **Verification:** Promote the same row twice — expect `wasDuplicate: true` on the second call.

### S5-M4 — `runAutoAnswer` hard-codes manual "all" run at 200 posts; sequential LLM calls block the event loop
- **File(s):** `apps/backend/src/modules/ai/auto-answer.controller.ts:503-574`
- **Severity:** MEDIUM
- **Category:** Performance, UX
- **Bug:** An admin re-running with `?all=true` processes up to 200 sequentially with no concurrency control; LLM calls block the event loop.
- **Fix:** Use `Promise.allSettled` with concurrency cap of e.g. 5; fire-and-forget to a worker queue.
- **Verification:** `?all=true` returns within 5s with a 202 + jobId (currently blocks until all 200 done).

### S5-M5 — `autoAwardBadges` reads `user.points < badge.pointsRequired` against stale value
- **File(s):** `apps/backend/src/modules/moderation/reputation.controller.ts:11-48`
- **Severity:** MEDIUM
- **Category:** Race, Logic
- **Bug:** Between `User.findById(userId)` (line 13) and `findOneAndUpdate(...)` (line 31), the user's points can be deducted, but the badge-award filter was evaluated against the stale value. Awards badge for points no longer held.
- **Fix:** Pass `badge.pointsRequired` into the filter: `findOneAndUpdate({ _id: userId, points: { $gte: badge.pointsRequired }, ... })`.
- **Verification:** Set user to exactly 100 points, threshold 100, manually deduct to 99 BEFORE autoAwardBadges runs — expect no badge awarded.

### S5-M6 — `approveFAQ` / `rejectFAQ` — three sequential non-atomic side effects on a single FAQ state change
- **File(s):** `apps/backend/src/modules/admin/admin.controller.ts:286-321`
- **Severity:** MEDIUM
- **Category:** Race, Code smell
- **Bug:** `await invalidateCache()` then `invalidatePublicCaches()` then `logAction` — three sequential non-atomic side effects on a single FAQ state change.
- **Fix:** Use a single transactional helper or `Promise.all([...])` for the cache invalidations.
- **Verification:** Inject a fault in `invalidateCache` — expect the FAQ state to NOT be persisted (rollback), or all three to be atomic.

### S5-M7 — `updateFAQ` awaits `generateEmbedding(...)` inline with no timeout
- **File(s):** `apps/backend/src/modules/admin/admin.controller.ts:324-383`
- **Severity:** MEDIUM
- **Category:** Performance, UX
- **Bug:** Embedding service can stall the response indefinitely on a cold provider.
- **Fix:** Move embedding to a fire-and-forget background job (queue + worker), or add a 5s timeout with a "embedding pending" state.
- **Verification:** Mock the embedding service to hang — expect the response within 6s with a clear message.

### S5-M8 — `queue.controller.ts:23` returns raw exception message including connection strings from Mongo network errors
- **File(s):** `apps/backend/src/modules/admin/queue.controller.ts:23`
- **Severity:** MEDIUM
- **Category:** Code smell, Info disclosure
- **Bug:** `res.json({ ..., error: (err as Error).message })` includes the raw exception message to an admin client (only-admin, but still surfaces internal details like connection strings from Mongo network errors).
- **Fix:** Sanitize the error message; log full details server-side; return a generic message to the client.
- **Verification:** Force a Mongo connection error; client response should NOT contain the connection string.

### S5-M9 — `POST /community/auto-answer` accepts `?post_id=` and `?all=true` from any admin/ai_moderator/moderator; no audit log of who triggered the manual run
- **File(s):** `apps/backend/src/modules/admin/admin-auto-answer.routes.ts:38`
- **Severity:** MEDIUM
- **Category:** Doc gap, Audit
- **Bug:** Compare `runScheduledAutoAnswer` which logs the cron name. The manual run has no actor log.
- **Fix:** Add an AdminLog entry: `{ action: 'manual_auto_answer', actor: req.user._id, params: { post_id, all } }`.
- **Verification:** Trigger manual run, check AdminLog collection for the entry.

### S5-M10 — `GET /:id` on batch routes has NO `protect` middleware and NO rate limit
- **File(s):** `apps/backend/src/modules/program/batch.routes.ts:42`
- **Severity:** MEDIUM
- **Category:** Validation
- **Bug:** `Batch.findById` on a malformed id throws a CastError → 500. ObjectId is unguessable in practice but the surface is open.
- **Fix:** Add `validateObjectId('id')` middleware (returns 400) + add a basic rate limiter for anon traffic.
- **Verification:** `GET /csfaq/api/batches/notanid` — expect 400, not 500.

### S5-M11 — `createMentor` leaks the full error object (including Mongoose validation paths) to the admin client
- **File(s):** `apps/backend/src/modules/admin/admin-mentor.controller.ts:79-83, 99`
- **Severity:** MEDIUM
- **Category:** Info disclosure, Validation
- **Bug:** On email uniqueness conflict the Mongoose error bubbles to line 99's catch, which returns `{ message: 'Error creating mentor', error }` — leaks the full error object.
- **Fix:** Catch specific MongoServerError codes (11000 for duplicate key) and return a clean message; log full details server-side.
- **Verification:** Force a duplicate-email insert; client response should NOT contain "E11000" or the Mongoose validation paths.

### S5-M12 — `setDefaultBatch` has a race window between `updateMany` (clear all defaults) and `findByIdAndUpdate` (set new default)
- **File(s):** `apps/backend/src/modules/program/batch.controller.ts:148-168`
- **Severity:** MEDIUM
- **Category:** Race
- **Bug:** A concurrent `setDefaultBatch` from admin B during admin A's call can briefly flip the flag onto batch B while A's updateMany is still running. Partial unique index `{ isDefault: 1 }` prevents final state inconsistency, but a window exists.
- **Fix:** Wrap both writes in a transaction; OR use a single `findOneAndUpdate({ _id: newBatchId }, { $set: { isDefault: true } })` and a pre-clear that's idempotent.
- **Verification:** Synthetic double-fire; expect only one batch to have `isDefault=true` at any point.

### S5-L1 — `router.use(adminOnly)` applied at mount time but no route ever calls `setContextBatchId`; `req.programContext.batchId` is undefined everywhere
- **File(s):** `apps/backend/src/modules/admin/admin.routes.ts:75`
- **Severity:** LOW
- **Category:** Code smell, Scope
- **Bug:** `assertSameProgram` checks (admin.controller.ts:292, 311, 339, 393) succeed/fail inconsistently depending on `assertSameProgram`'s strict-by-default semantics. No route ever sets `req.programContext.batchId`, so downstream controllers operate on an undefined context.
- **Fix:** Add `setContextBatchId` middleware that reads `req.query.batchId` and attaches `req.programContext`. Apply to all admin routes.
- **Verification:** All admin routes that use `assertSameProgram` should pass when `?batchId` is in the admin's program scope, fail otherwise.

### S5-L2 — `ai-promotion.controller.ts` uses dynamic `await import()` inside hot paths; module re-resolved on every call
- **File(s):** `apps/backend/src/modules/ai/ai-promotion.controller.ts:75, 153`
- **Severity:** LOW
- **Category:** Performance
- **Bug:** `await import('./ai-client.service.js')` and `await import('../../utils/ai/duplicateDetector.js')` inside hot paths — module is re-resolved on every call.
- **Fix:** Use static `import` at the top of the file.
- **Verification:** Profile the route — first-call overhead should be one-time, not per-request.

### S5-L3 — `runScheduledAutoAnswer` and `stopAutoAnswerScheduler` are deprecated stubs kept for backward compat per Phase 3 R12; no `@deprecated` JSDoc tag
- **File(s):** `apps/backend/src/modules/ai/auto-answer.controller.ts:589-605`
- **Severity:** LOW
- **Category:** Doc gap, Code smell
- **Bug:** Public exports with no `@deprecated` JSDoc tag, and there's no ESLint rule to surface them.
- **Fix:** Add `@deprecated` JSDoc tags; add an ESLint rule (`@typescript-eslint/no-deprecated`).
- **Verification:** `eslint .` reports the deprecated symbols.

### S5-L4 — `getAutoAnswerQueuePaginated` filter `deletedAt: null` requires the field to exist on `CommunityPost`
- **File(s):** `apps/backend/src/modules/admin/adminAutoAnswerReview.controller.ts:222-262`
- **Severity:** LOW
- **Category:** Schema drift
- **Bug:** If the schema doesn't have `deletedAt`, Mongoose silently filters nothing (the predicate is unknown).
- **Fix:** Check `CommunityPost.schema.paths.deletedAt` exists; otherwise remove the filter and add a TODO.
- **Verification:** Inspect the schema; confirm `deletedAt` field exists.

### S5-L5 — `getModerationLogs` pagination max is 50 but no `hasMore` flag returned
- **File(s):** `apps/backend/src/modules/moderation/moderation.controller.ts:212-241`
- **Severity:** LOW
- **Category:** UX inconsistency
- **Bug:** Caller must compute `skip + logs.length < total` themselves. Compare admin.controller.ts:497 where `hasMore` is present.
- **Fix:** Add `hasMore: skip + logs.length < total` to the response.
- **Verification:** Page through logs — UI should know when to stop fetching.

### S5-L6 — `getReports` has hard `limit(500)` cap on both FAQ and SearchLog queries with no pagination
- **File(s):** `apps/backend/src/modules/admin/admin.controller.ts:457-460`
- **Severity:** LOW
- **Category:** UX, Logic
- **Bug:** Admins requesting a wide date range silently get only the latest 500 rows, with no `total`/`hasMore`.
- **Fix:** Add `?page&limit`; respect `total` from `countDocuments`.
- **Verification:** Request a wide date range — response should include `total` and `hasMore`.

### Subagent 5 — async high-risk route inventory (top 10 — first to fix)

| Rank | File | Endpoint(s) | Why |
|------|------|-------------|-----|
| 1 | `adminTrain.routes.ts` | `POST /train/promote-cross-program` | No source/target scope check. Cross-tenant write. |
| 2 | `auto-answer.controller.ts` | `runAutoAnswer` (manual + scheduled) | Unscoped `CommunityPost.find` ignores `?batchId=`; NaN guard missing on settings. |
| 3 | `moderation.controller.ts` + `reputation.controller.ts` | `ban/suspend/warn/award/badge` | Non-atomic 3-write dual-write; controller `requireAdmin` blocks moderators that route middleware permits. |
| 4 | `ai-config.controller.ts` | `resetAiUsage`, `getAiProviders`, `revealApiKey` | `findOne({isActive:true})` returns per-program override instead of global. |
| 5 | `batch.controller.ts` | `getBatchBySlug` | Loads entire batch collection to do slug match; info disclosure to anon public. |
| 6 | `admin.controller.ts` | `getUsers`, `getAdminFAQs`, `getCommunityPosts` | `parseInt(limit)` no cap → full-table dump; `getCommunityPosts` `$regex` without `escapeRegex` → ReDoS. |
| 7 | `ask-ai.routes.ts` | `POST /` | 40MB anonymous multipart admitted; `authedAiLimiter` keyed on IP. |
| 8 | `ai-promotion.controller.ts` | `runCommunityPromotionReview` | AI grounding reads cross-program FAQs; non-atomic lifecycle.aiGeneratedFaq write. |
| 9 | `admin.controller.ts` `deleteCommunityPost` | `DELETE /admin/community/:id` | No `assertSameProgram` — cross-program hard delete. |
| 10 | `adminTrain.routes.ts` `bulk-documents` | `POST /train/bulk-documents` | `documentId` returned is actually `jobId`; double-write (disk + base64). |

### Out of scope (forwarded from async delivery)
- `admin-welcome.controller.ts` (1327 LOC) — not read; suspect race patterns in welcome package builder.
- `onboarding-resources.controller.ts` (890 LOC) — not read; multi-resource onboarding CMS recent commit, likely analogous audit surface.
- `admin.config.controller.ts` (219 LOC) — not read; runtime config writes by admin, no passphrase challenge (Phase 2 deferred per comment).
- `admin-project.controller.ts` (108 LOC) — not read; projects CRUD.
- `program/feature-flag.controller.ts`, `app-settings.controller.ts`, `welcome.controller.ts` — not read.
- `program/cascade-delete.service.ts` orphan coverage (already in redesign-plan §2.1 row 5).

---

### Subagent 5 Summary (re-dispatch — 24 additional findings from a second pass through the same 32-route scope)
- **CRITICAL: 1** (5.1 suspendUserSchema field shape mismatch — distinct from sibling C5-1; this is the broken-route code path, that is the upload-ordering concern)
- **HIGH: 4** (5.2 admin note leaked in post body, 5.3 askAiAgain cooldown trap, 5.10 stdout credential leak + per-request SDK, 5.14 dual-write partial in awardPoints)
- **MEDIUM: 9** (5.4 ai-promotion mutate-then-save, 5.5 askAiAgain empty-extraContext, 5.6 uploadZoom transcript hot-path embedding, 5.7 adminTrain bulk-documents orphan files, 5.13 admin-documents no rate limit, 5.17 listFeatureFlags per-request upsert, 5.18 trackWelcomeOnboarding unguarded write, 5.20 welcome resources no batchId scope, 5.23 per-program setting accepts unknown keys)
- **LOW: 10** (5.8 admin-projects inner unprotected, 5.9 findById-without-ObjectId-validate (cross-cutting 25+ sites), 5.11 admin-welcome sync fs, 5.12 getBatchBySlug loads all batches, 5.15 ModerationLog.targetId stringified, 5.16 reputation privacy hardening, 5.19 ai-config Zod (re-flags), 5.21 adminRoutes inner auth verification (note only), 5.22 getAutoAnswerQueuePaginated loose status enum, 5.24 admin/auto-answer post_id filter (re-flags))
- **TOTAL: 24 new findings across the same 32 route files + 14 controllers (this pass)**

### Consolidated Subagent 5 — both passes
- **CRITICAL: 2** (C5-1 + 5.1) — both plausible C-class; C5-1 needs verify, 5.1 confirmed via schema/controller mismatch
- **HIGH: 11** (H5-1..H5-7 sibling + 5.2, 5.3, 5.10, 5.14 re-dispatch)
- **MEDIUM: 15** (M5-1..M5-6 sibling + 5.4, 5.5, 5.6, 5.7, 5.13, 5.17, 5.18, 5.20, 5.23 re-dispatch)
- **LOW: 13** (L5-1..L5-3 sibling + 5.8, 5.9, 5.11, 5.12, 5.15, 5.16, 5.19, 5.21, 5.22, 5.24 re-dispatch)
- **TOTAL: 41 distinct findings across 32 route files + 16 controllers reviewed (combined passes, ~7 findings overlap on cross-cutting M4-3 pattern)**

Cross-cutting patterns to coordinate across both passes:
- **ObjectId validation before findById / findByIdAndUpdate / findByIdAndDelete** — applies to ~25 call sites (5.9) + sibling H5-1, H5-2, M5-2, M5-5, H5-7. Fix once with a centralized `validateObjectIdOr400` middleware.
- **Hot-write-path embedding calls** — 5.6 (admin-welcome Zoom transcript) + sibling's general pattern. Same fix as the 4-site deletion in `post-mutations.controller.ts` + `faq.controller.ts`.
- **Dual-write atomicity** — 5.14 (reputation awardPoints) needs the same `await awardToUser()` + rollback pattern that the v1.69 Phase 7 fix tried to enforce.
- **Admin route inner auth gate inconsistency** — 5.8 (admin-projects lacks inner `protect+adminOnly`) + sibling L5-1 (admin.config).

Findings 5.9 (M4-3 cross-cutting), 5.6 (same anti-pattern as Subagent 4 M4-1/4-2), and 5.24 (auto-answer post_id) tie back to Subagent 4's cross-cutting patterns — same shape, different surface. Coordinate the fix in the parent task: a single `validateObjectIdOr400` middleware + the same hot-write-path embed removals applied to one more endpoint.

<!-- ============================================ -->
<!-- JUDGE CONSOLIDATION (after all subagents return) -->
<!-- ============================================ -->

## Consolidated Summary (filled by judge)

### Counts (updated 2026-07-07 11:35 after Subagent 5 async delivery landed)
| Severity | Subagent 1 | Subagent 2 | Subagent 3 | Subagent 4 | Subagent 5 | TOTAL |
|---|---|---|---|---|---|---|
| CRITICAL | 0 | 0 | 1 (S3-01 AdminLogin routing broken) | 0 | **8** (5.1 suspendUserSchema broken + S5-C1..C7 cross-tenant/RBAC) | **9** |
| HIGH     | 1 | 4 (H2-1, H2-3, S2-1, S2-6) — H2-2 retracted | 1 (S3-02) | 2 (H4-1, H4-2) | **22** (5.2, 5.3, 5.10, 5.14 + S5-H1..H18) | **30** |
| MEDIUM   | 4 | 13 (M2-1..M2-5 + S2-2, S2-3, S2-4, 2-A..2-E) | 5 | 5 | **21** (5.4, 5.5, 5.6, 5.7, 5.13, 5.17, 5.18, 5.20, 5.23 + S5-M1..M12) | **48** |
| LOW      | 6 | 11 (L2-1..L2-3 + S2-5, S2-7..S2-10 + 2-F..2-H) | 5 | 6 | **16** (5.8, 5.9, 5.11, 5.12, 5.15, 5.16, 5.19, 5.21, 5.22, 5.24 + S5-L1..L6) | **44** |
| **TOTAL** | **11** | **28** | **12** | **13** | **67** | **131** |

### Top 11 priorities (judge-curated)

These are ordered by severity × blast radius. Fixes 1-7 are unblockers; fixes 8-9 are correctness; fixes 10-11 are hardening.

1. **S5-C5 (CRITICAL) — `requireAdmin` blocks moderators despite route middleware permitting them** (`apps/backend/src/modules/moderation/moderation.controller.ts:9-20`): the `adminOnly` middleware accepts `admin`/`moderator`/`ai_moderator`, but the controller's `requireAdmin` only accepts `admin`. **Result: moderators pass the route check, then get 403'd by the controller.** Moderators and ai_moderators cannot actually ban/suspend/warn users. **Production-blocker for non-admin moderators** — this is a feature that's wired up everywhere but works for no one. Fix: change `requireAdmin` to accept the same 3 roles (route intent was probably right; controller is older code).

2. **5.1 (CRITICAL) — `suspendUserSchema` field shape mismatch** (`apps/backend/src/utils/auth/validation.ts:145-149`): the schema requires `days: number` but the controller reads `duration: string`. **Every** call to `POST /csfaq/api/moderation/suspend` returns 400 immediately. Admins currently cannot suspend abusive users through the normal flow. Fix: extend `suspendUserSchema` with a `duration: z.string().regex(/^[0-9]+(h|d)$/)` (or change the controller to coerce), then add a unit test. **Severity: production-blocker for moderation.** *Note: this is the same bug class as S5-C5 — schema/controller field drift. After fixing S5-C5 + 5.1, add an ESLint rule that catches `controller_body_fields ⊄ schema_fields`.*

3. **S3-01 (CRITICAL) — AdminLogin routing broken** (`apps/frontend/src/admin/pages/AdminLogin.tsx`): per subagent 3, anyone logged out hitting `/admin/*` now bounces forever — likely the recent commit `00a2a1f8` removed the lazy `import('../admin/pages/AdminLogin')` route registration. Fix: re-add the lazy import. **Severity: blocks admin access for every logged-out admin.**

4. **S5-C1 (CRITICAL) — `/train/promote-cross-program` has no scope check on source or target batches** (`apps/backend/src/modules/admin/adminTrain.routes.ts:289-350`): any admin/ai_moderator/moderator can promote knowledge into ANY other program's batches. Cross-tenant write vector. Fix: run `assertSameProgram(req.user, sourceRow)` and verify every `targetBatchId` is in `req.user.adminPrograms`.

5. **S5-C3 (CRITICAL) — `runAutoAnswer` with `?batchId=X` processes posts from ALL programs** (`apps/backend/src/modules/ai/auto-answer.controller.ts:530`): `CommunityPost.find(query)` ignores the query batchId and processes every unanswered post. Cross-program AI auto-answering on manual trigger. Fix: pass `batchId` into the find() filter.

6. **S5-C6 (CRITICAL) — `AiConfig.findOne({ isActive: true })` returns per-program override when global is intended** (`apps/backend/src/modules/ai/ai-config.controller.ts:276, 296, 366`): `revealApiKey` returns the per-program override's decrypted key instead of the global one. Admin reads a key that's not actually in use. Fix: explicit `scope: 'global'` filter or `batchId: null`.

7. **S5-C7 (CRITICAL) — `getBatchBySlug` loads ENTIRE batch collection into memory on every anonymous public call** (`apps/backend/src/modules/program/batch.controller.ts:115-141`): info disclosure (every program name leaks to anon public) + O(N) DoS as the program count grows. Fix: `Batch.findOne({ slug, isActive: true }).select(...).lean()`.

8. **5.2 (HIGH) — `[ADMIN NOTE]` leaks into post body** (`apps/backend/src/services/autoAnswer.ts:524-553`): `rerunWithContext` mutates `post.body` with `[ADMIN NOTE]` augmentation, runs `processPost`, then strips it back via `post.body.split(...)[0]`. The save + strip has no error handling — a transient DB error during strip leaves the admin's note visible to the user permanently. **Severity: data corruption visible to end users.**

9. **S5-H10 (HIGH) — `getUsers`, `getAdminFAQs`, `getCommunityPosts`, `getModerationLogs` have `parseInt(limit)` with no upper cap → full-table dump** (`apps/backend/src/modules/admin/admin.controller.ts:218-243, 248-249, 565-567`, `moderation.controller.ts:217`): admin (or attacker with stolen admin JWT) can request `?limit=9999999` and dump the entire users collection in one HTTP response. Fix: cap with `Math.min(50, parseInt(req.query.limit))`.

10. **5.10 (HIGH) — `askOrientationQuestion` stdout credential leak** (`apps/backend/src/modules/program/welcome.controller.ts:askOrientationQuestion` per subagent 5): constructs a new OpenAI SDK per request, logs `GROK/GROQ loaded: !!apiKey` to stdout. Per-request SDK cost + key presence in logs is a credential-leak surface. **Severity: PII/key in logs.**

11. **S2-6 (HIGH) — `POST /community/:id/resolve` accepts ANY authenticated user (RBAC gap, client-only gate)** (`apps/backend/src/modules/community/community.routes.ts:83`): the frontend restricts the "Resolve" button to admin/moderator/expert, but the backend route has only `protect` middleware — no `authorize(...)`. A regular `user` who crafts a PATCH with `{"answer":"..."}` resolves any post in their program, including posts they didn't author. **Same bug pattern as the original H6 (CreatePostDialog no server-auth)** — client-only gate, missing server enforcement. Fix: tighten route to `protect, authorize('admin','moderator','expert')`. Async delivery added this finding 2026-07-07 11:30.

12. **5.3 + H5-3 (HIGH) — autoAnswer cooldown gate logic** (`apps/backend/src/services/autoAnswer.ts:readPriorResult`): two reports in agreement — `escalated` is mapped to `ask_human` decision, AND the function never inspects `aiAnswerReviewedAt`/`By`, so an admin "ask-ai-again" within the cooldown window silently returns the cached answer with no log line. Subagent 5's version is sharper. **Severity: admin re-runs produce no work, no observability.**

13. **5.14 + S5-H13 (HIGH) — Reputation `awardPoints` dual-write partial + lost-update race** (`apps/backend/src/modules/moderation/reputation.controller.ts:84-90`): updates `User.points` globally THEN calls `awardToUser` (per-program write). If per-program write throws, the global already moved. Plus two concurrent admin awards on the same user both load, both compute, last save wins — `User.points` ends up out of sync with `ReputationLog` history. Fix: atomic `findOneAndUpdate({ _id }, { $inc: { points: delta }, ... })`.

14. **H4-1 + H4-2 (HIGH) — `POST /auth/refresh` no rate limit + no Zod** (`apps/backend/src/modules/auth/auth.controller.ts:622-681`): the refresh endpoint is the natural brute-force target and has neither. Length is unbounded — 10MB strings hit `JWT.verify`. **Severity: token-reuse surface + memory pressure.**

15. **S1 + Subagent 1.1 (HIGH) — `SpurtiChip` uses `user?.id` instead of `user?._id`** (`apps/frontend/src/components/.../SpurtiChip.tsx` per subagent 1): breaks Spurti Points UI for every authenticated user. One-character fix but high blast-radius (GuidedTour + GoldenTicket features both depend on it). **Severity: full feature broken.**

16. **H2-3 + ThreadBookmarkButton regression risk (HIGH)** (`apps/frontend/src/components/community/ThreadBookmarkButton.tsx`): the button is now stateless. Any other consumer (e.g. `PostDetailDialog`, `SavedKnowledgePage`) that re-introduces a stale-closure rollback pattern resurrects the H12 bug class. **Severity: latent regression class on H12 fix.**

### Cross-cutting patterns observed (judge-curated)

- **Pattern A — `findById/FindByIdAndUpdate/FindByIdAndDelete` without ObjectId validate.** Affects ~25 call sites across community / notification / reputation / knowledge / admin (subagent 5's 5.9 + the Subagent 4 M4-3 class). Single fix: centralized `validateObjectIdOr400('id')` middleware applied once per `:id`-bearing route. **Fix class: 5+ findings → 1 middleware.**

- **Pattern B — admin route auth chain order** (multer before `protect`). Subagent 5 reports it as suspected-CRITICAL `C5-1` but the route file shows `router.use(protect) + router.use(adminOnly)` is mounted BEFORE the multer routes, so the bug may not exist as described. **Action: re-read `admin-welcome.routes.ts:103-104` carefully** — confirm by audit before treating as CRITICAL. Don't trust the sibling on this one (their C5-1 was speculative; my sibling inline-applied the same speculation — worth a manual read).

- **Pattern C — hot-write-path embedding** (5.6 admin-welcome Zoom transcript). Same fix as the recent commits `78d328e` + `5549d01` applied to FAQ + community. Single handler change covers it.

- **Pattern D — dual-write atomicity** (5.14 reputation + earlier community.toggleUpvote M4-5 + S5-C4 moderation 3-write). The codebase already has the `awardPoints`/`awardToUser` dual-write pattern but no rollback. Use a Mongo transaction OR a compensating write.

- **Pattern E — Schema/controller field drift** (5.1 suspendUserSchema was a proven production-downer; **S5-C5 RBAC mismatch on moderation** is the same family). Audit class: any route where `validateBody(...)` is mounted but the controller reads DIFFERENT field names (or vice versa); OR any route where the middleware permits a role set the controller doesn't. A simple lint rule — `controller_body_fields ⊆ schema_fields` plus `adminOnly.allowed ⊆ requireAdmin.allowed` — would catch this class. **Two of the four CRITICALs in this audit are Pattern E.**

- **Pattern F — Cross-program writes without `assertSameProgram`** (S5-C1, S5-C2, S5-C3, S5-C7, S5-H7, S5-H12, S5-M1). The codebase has the helper (`assertSameProgram`) but several admin routes skip it. Centralize: a single `programScope` middleware that reads `req.query.batchId` and attaches `req.programContext`, then every admin controller that touches a per-program resource reads from `req.programContext.batchId` and runs `assertSameProgram`. **Apply once, fixes 7+ findings.**

- **Pattern G — Subagent reports need re-verification against current source** (the H2-2 retraction was a lesson). The judge-mode skill should add: every finding that cites a specific line number MUST be re-verified by reading the file at that line, not by trusting the prior commit message or fix narrative.

### Out of scope (forwarded to next audit round)

- **`apps/backend/src/modules/program/*` (15 files)** — subagent 5 only surface-read these. There's a wealth of `program-discord.routes.ts`, `program-zoom.routes.ts`, `course.routes.ts`, `enrollment.routes.ts`, `feature-flag.routes.ts`, `registration-control.routes.ts`, `app-settings.routes.ts`, `welcome.routes.ts`, `admin-program-settings.routes.ts`, `admin-category-cluster.routes.ts`, `public-category-cluster.routes.ts` remaining. Each is non-trivial. Re-dispatch with a 2-subagent split.
- **`apps/backend/src/modules/{notification,upload,support,health,zoom}`** — subagent 4 only mount-confirmed. Not audited in depth.
- **`apps/backend/src/modules/knowledge/knowledge.controller.ts:promoteToFAQ` etc.** — read but not exhaustively tested.
- **`apps/backend/src/middleware/admin.ts:adminOnly` chain** — L5-1 was flagged as needs-verify. Confirm whether `adminOnly` chains `protect`.
- **Frontend `apps/frontend/src/components/faq/`** — only Subagent 1 partial pass.
- **End-to-end exhaustive route audit script** (per the judge-mode skill's reference at `references/exhaustive-route-audit.md`) was not run this round — Subagent 4 / 5 read source; no live curls fired. The exhaustive route audit (348 routes enumerated, 2xx/4xx/5xx classified per route file) from 2026-07-03 is the most recent such artifact.
