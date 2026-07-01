# Multi-Program CMS — Design

> **Status:** v1.2 — Phase 1 shipped. Phase 2 in flight: per-program
> settings model + complete visual/UX rebuild of the program page as
> a "new website" feel (themeable, section-driven, admin-editable
> from `/admin/programs/:id/settings`).

## TL;DR

The user wants a **program-centric architecture**: admins create a program
(e.g. "Yaksha 2026-27", "Yaksha 2025 Summer") and every piece of content —
FAQs, community posts, knowledge-base entries, Zoom recordings, documents,
badges, leaderboard rows, the lot — belongs to exactly one program. The
**home page itself is the program entry point** — `/` lists the active
programs and lets the admin create new ones. Click a program to enter it.
The public site shows the currently-selected program's content; admins
manage each program's content separately.

The data model already has a `Batch` (i.e. program) entity, and the `FAQ`
and `Category` collections are already `batchId`-scoped. **The gap is that
most other content models aren't.** That's the work.

---

## 1. Current state (recon, 2026-06-13)

### 1.1 Backend models (35 total)

**Already `batchId`-scoped (good):**
- `Batch` (the program itself)
- `FAQ`
- `Category`
- `GuestEvent`

**Need `batchId` added (the gap — 12 content-bearing models):**
| Model              | Used for                                        | Admin page                  |
|--------------------|-------------------------------------------------|-----------------------------|
| `CommunityPost`    | Discussion threads, Q&A, comments               | `AdminCommunity`            |
| `ZoomMeeting`      | Recorded Zoom sessions                          | `AdminZoomMeetings`         |
| `DocumentInsight`  | Insights extracted from uploaded docs           | `AdminDocumentInsights`     |
| `TranscriptKnowledge` | Knowledge-base entries from Zoom transcripts | `AdminZoomInsights` (via promotion) |
| `Badge`            | Awardable badges                                | `AdminLeaderboard`          |
| `ReputationLog`    | User reputation events (per program)            | `AdminLeaderboard`          |
| `SearchLog`        | Search analytics (per program)                  | `AdminUnresolvedSearch`     |
| `UnresolvedSearch` | Unresolved queries (per program)                | `AdminUnresolvedSearch`     |
| `Notification`     | User notifications (per program)                | (no admin — system-fired)   |
| `TeaNotification`  | "Spill the tea" community pulse                 | (no admin)                  |
| `SupportRequest`   | User support tickets                            | `AdminSupportInbox`         |
| `AiQuestion`       | AI Q&A log                                      | (debug only)                |

**Program-agnostic (correctly so — should NOT be batch-scoped):**
- `User` (one identity spans programs)
- `AdminLog`, `OnboardingAuditLog`, `ModerationLog` (cross-program audit)
- `FeatureFlag`, `AppSetting`, `AiConfig`, `NotificationSettings` (global config)
- `RevokedToken`, `Project`, `Mentor`, `Orientation`, `TimelineStep`,
  `AttendanceGuidance` (onboarding — itself program-aware via a different FK)
- `FreshReviewLog`, `FreshReviewVote` (reviewer activity — already FK'd to FAQ)
- `DocumentRecord` (raw upload, before insight extraction)
- `PipelineResult` (AI pipeline result, not user-visible)

### 1.2 Frontend admin pages

**Already batch-aware:**
- `AdminFAQs` (filter dropdown, new/edit modals pick a batch)
- `AdminBatches` (the program CRUD)

**NOT batch-aware (the gap):**
- `AdminCommunity`, `AdminModeration`
- `AdminZoomMeetings`, `AdminZoomInsights`, `AdminDocumentInsights`
- `AdminLeaderboard`, `AdminUnresolvedSearch`
- `AdminSupportInbox`, `AdminSupportTicket`, `AdminSupportAnalytics`,
  `AdminSupportCategories`, `AdminSupportGuidance`

### 1.3 Public pages

**Already batch-aware:**
- `HomePage` (uses `BatchContext`, redirects to portal if no batch)
- `FAQPage` (passes `batchId` to public endpoints)

**NOT batch-aware:**
- `CommunityPage` (no `batchId` filter)
- `FromMeetings` (Zoom transcripts on the FAQ page)
- `BatchPortalPage` (the program picker — works fine)
- (No public KB page exists yet — see Open Question Q1)

---

## 2. Target architecture

### 2.1 Data model

Add `batchId: Types.ObjectId | null` (with `ref: 'Batch'`, `index: true`,
`default: null`) to the 12 content models listed in §1.1. Backfill all
existing rows to the default batch (the one with `isDefault: true`) via a
one-time migration. After the migration, public reads filter by `batchId`
and admin reads can either show a single program's content or cross-program
content with a `?batchId=` filter.

### 2.2 Program lifecycle (admin flow)

```
AdminBatches
  ├─ Create new program (name, dates, description)
  ├─ Edit program metadata
  ├─ Set as default (the one the public site shows by default)
  ├─ Archive (hides from public, keeps data)
  └─ Delete (soft — moves to a `deletedAt` tombstone)
```

Once a program exists, every other admin page in the suite either:

**(a)** Operates *inside* a single program — admin picks a program from a
picker at the top of the page, then sees only that program's content; OR

**(b)** Shows a *batch-filter dropdown* in the toolbar (the pattern
`AdminFAQs` already uses) so admins can scan across programs or focus on
one.

**Recommendation:** keep the current `AdminFAQs` pattern (b) for FAQ-style
list pages — it's less disruptive and admins already use it. For
program-management itself (the new "Program detail" page), use pattern
(a) so all program-scoped tabs (FAQs / Community / Zoom / KB) live under
one roof. See Open Question Q2.

### 2.3 "Program detail" page (new)

A new admin route `/admin/programs/:programId` with tabs:

```
┌─ /admin/programs/:programId ─────────────────────────────┐
│  [Overview] [FAQs] [Community] [Zoom] [Documents]        │
│            [Knowledge Base] [Settings]                   │
│                                                            │
│  Each tab is the existing admin page filtered by          │
│  this program. Tabs are lazy-loaded; tabs you don't have   │
│  permission for are hidden.                                │
└────────────────────────────────────────────────────────────┘
```

This is the "create a program then you can upload everything" experience
the user asked for. After saving a new program, the admin lands here and
sees an empty state in each tab with a "+ Add" CTA.

### 2.4 Public site flow

> **Locked-in (2026-06-13): the home page `/` is the program entry point.**

- **`/` — Program portal.** Lists all active programs as cards. For
  unauthenticated visitors, the cards show program name + dates +
  description and a "View program" button. For admins, an additional
  "Create new program" CTA is visible at the top. Clicking a card
  sets that program as the active one in `BatchContext` and routes to
  the program's pages. The current `HomePage` (which shows FAQs) gets
  replaced by this; the FAQs move into the per-program view.
- **`/program/:slug` — Program public page.** Fetches the program
  description from `GET /api/batches/by-slug/:slug` and renders its
  FAQs, recent community posts, upcoming Zoom sessions, and KB entries.
  This replaces the hardcoded `Yaksha2026_27ProgramPage` from an
  earlier turn.
- **`/program/:slug/faq`, `/program/:slug/community`, etc.** — per-program
  sub-routes. Or a single `/program/:slug` with tabs. (Decide in
  Phase 3 — see open question Q4.)
- **`/community`, `/faq`, `/from-meetings` (legacy routes)** — auto-scope
  to the `BatchContext` active program for backwards compatibility.
  The migration to per-program URLs is Phase 3.
- The current `/explore/select` (`BatchPortalPage`) gets folded into
  `/` — no separate "pick a program" page anymore.

### 2.5 "Knowledge Base" — what it actually is

There is no `KnowledgeBase` model. The closest existing concepts:
- `TranscriptKnowledge` — text chunks promoted from Zoom transcripts;
  user-facing KB entries
- `DocumentInsight` — structured insights extracted from uploaded docs

**Recommendation:** treat "Knowledge Base" as the union of
`TranscriptKnowledge` + promoted community answers + `DocumentInsight`
items, surfaced under a `/admin/programs/:id/knowledge` tab that lists
them with a "promote to FAQ" action. Confirm in Q1.

---

## 3. Implementation phases

### Phase 0 — Unblock the home page (already shipped this session)
Seed creates a default `Batch`, backfills orphaned FAQs. The user can
already run `npm run seed` and the home page renders.

### Phase 1 — Batch-scope the 12 content models
- Add `batchId` to `CommunityPost`, `ZoomMeeting`, `DocumentInsight`,
  `TranscriptKnowledge`, `Badge`, `ReputationLog`, `SearchLog`,
  `UnresolvedSearch`, `Notification`, `TeaNotification`, `SupportRequest`,
  `AiQuestion`.
- Migration script (`backend/scripts/migrate-batch-backfill.ts`) that
  assigns all existing rows to the default batch.
- Add `(batchId, …)` compound indexes where appropriate.
- Public endpoints filter by `batchId`; admin endpoints accept
  `?batchId=`.

### Phase 2 — Admin pages
- Add a batch-filter dropdown (or sidebar picker) to each unscoped admin
  page. New `/admin/programs/:programId` detail page with tabs.
- `AdminBatches` gets a "Set as default" action (calls a new
  `POST /api/batches/:id/default` endpoint that clears the flag on others
  in a transaction).
- The new "Knowledge Base" tab on the program detail page.

### Phase 3 — Public site
- `CommunityPage`, `FromMeetings`, and any other public list page get
  batch-scoped reads.
- Refactor `Yaksha2026_27ProgramPage` to `/program/:slug` and read from
  the Batch model instead of the hardcoded list.
- Public `/admin/programs/:programId` preview (a public read-only mirror).

### Phase 4 — Polish
- Bulk operations: "migrate 50 FAQs from program A to program B".
- Cross-program analytics on `AdminDashboard`.
- Program archive (read-only mode, hidden from portal).
- Soft-delete with `deletedAt`.

---

## 4. Locked-in decisions (signed off 2026-06-13)

### Q1. Knowledge base = `TranscriptKnowledge` + `DocumentInsight`
No new model. The new "Knowledge Base" tab on the program detail page
unions the two collections and shows them with a "Promote to FAQ"
action. (See §2.5.)

### Q2. Global program picker (the invasive option)
Every admin page gets a "Select a program" sidebar/picker at the top.
Once an admin picks a program, every action on that page is scoped to
that program until they switch. This is in addition to the new
`/admin/programs/:programId` landing page (the program-centric tabs).

Implication: a new `<AdminProgramPicker>` shared component goes in the
admin layout. The picker is sticky on the left rail (desktop) or a
bottom sheet (mobile). State lives in a new `AdminProgramContext` so
every admin page reads from one place — no per-page dropdown duplication.

### Q5. Everything per-program (reputation resets each cycle)
- `User.reputation`, `User.spurtiPoints`, `Badge` (per-program) —
  split. Each program maintains its own leaderboard.
- `ReputationLog` is per-program (new `batchId` field).
- The current single-number reputation stays for legacy/global
  features (the "first time you post", "first reply" badges that
  are inherently cross-program). All program-aware reputation is
  per-program.
- The leaderboard becomes "leaderboard for current program" on
  public pages; admins can switch programs to see each cohort.

This means `Badge` and `ReputationLog` get a `batchId` field (in
addition to the global badges). The `User` model stays as-is (single
identity), but a derived view joins badges+reputation+spurtiPoints
filtered by the active program.

---

## 4a. Open questions (lower priority — defer)

### Q3. Migration policy
**Default:** backfill all existing rows to the default batch. Old
data has nowhere else to go and the volume is small (~hundreds of
rows per model). The user can re-tag if they need to split history
later.

### Q4. Public `/program/:slug` refactor
Defer to Phase 3. The hardcoded `Yaksha2026_27ProgramPage` I built
last turn stays until Phase 3 lands. It works; it's just hardcoded.

---

## 5. Files to be touched (rough estimate)

**Backend (~25 files):**
- 12 model files (add field + index)
- 12 controller / route files (add `batchId` filter / scope)
- 1 migration script (`scripts/migrate-batch-backfill.ts`)
- `models/Batch.ts` (add `setAsDefault` static method or transaction logic)
- 1 new endpoint: `GET /api/batches/by-slug/:slug` (for `/program/:slug`)
- 1 new endpoint: `POST /api/batches/:id/default` (admin)

**Frontend (~20 files):**
- 1 new home page (`ProgramPortalPage` — replaces `HomePage`)
- 1 new admin page (`AdminProgramDetail.tsx` with tabs)
- 1 new admin page (`AdminProgramPicker.tsx` — sidebar global picker)
- 1 new context (`AdminProgramContext.tsx`)
- 6 admin pages (consume the new picker)
- 3 public pages (Community, FromMeetings, legacy FAQ) — batch scope
- 1 new public page (`/program/:slug` — replaces the hardcoded one)
- `BatchContext.tsx` (already updated for `isDefault`)
- `Navbar.tsx` (link to `/program/:slug` if a program is active)
- `App.tsx` (new routes)

**Total rough estimate:** ~4-6 days of focused work, depending on
test coverage expectations.

---

## 7. Phase 2 — "new website" rebuild

User feedback after Phase 1: the program page looked like a thin FAQ
homepage, not a "new website". The data model was right; the
visual/UX was too plain. User wants the program page to feel like a
fresh, marketing-quality website whose every aspect is admin-driven
and changes per program.

**Locked-in scope (2026-06-14):**
- Per-program settings model (theme, hero, sections, branding) — every
  program is a fully-customisable microsite.
- The program page renders dynamically from those settings.
- Admin edits the settings at `/admin/programs/:id/settings` with a
  live preview.

### 7.1 `ProgramSettings` model

```ts
{
  batchId: ObjectId,            // 1:1 with Batch
  theme: {
    primaryColor: string,       // hex, e.g. "#5a7a5a" (sage)
    accentColor: string,        // hex
    background: 'cream' | 'mist' | 'ink',
    fontFamily: 'serif' | 'sans',
  },
  hero: {
    title: string,              // big serif headline
    subtitle: string,           // paragraph
    imageUrl?: string,          // optional hero image
    ctaText?: string,           // primary call-to-action button label
    ctaLink?: string,           // internal link or anchor
  },
  sections: {
    showStats: boolean,         // "X FAQs · Y threads · Z recordings"
    showFAQs: boolean,
    showCommunity: boolean,
    showZoom: boolean,
    showKB: boolean,            // knowledge base (TranscriptKnowledge + DocumentInsight)
    sectionOrder: Array<'stats' | 'faqs' | 'community' | 'zoom' | 'kb'>,
  },
  branding: {
    logoText: string,           // "Yaksha FAQ" default
    footerText: string,
  },
  createdAt, updatedAt
}
```

Defaults applied if a Batch has no ProgramSettings doc: a `defaultSettings()`
factory returns the cream/sage/serif look matching the current
"Choose a program" hero — so the program page never renders blank.

### 7.2 Endpoints

- `GET /api/programs/:slug` — public, returns `{ program, settings }`
  (program data + merged ProgramSettings or defaults).
- `PUT /api/admin/programs/:id/settings` — admin, upserts
  ProgramSettings for a batch.

### 7.3 Admin UI

`/admin/programs/:id/settings` — a left-rail form (theme pickers, hero
copy, section toggles) with a live preview pane on the right that
re-renders a miniature program page as the admin types.

### 7.4 Public UI rebuild

- The program page stops looking like a FAQ list. It becomes a
  marketing-style microsite:
  - Big serif hero with title, subtitle, image, CTA.
  - Stats strip (FAQs / community / Zoom / KB counts).
  - Feature-highlight cards for each enabled section.
  - The actual FAQ / community / Zoom / KB content appears as
    sections further down (collapsible accordions, search filter).
- Home portal (`/`) gets a richer hero with the same theme
  treatment, plus the program cards.

### 7.5 Seed

- A new seed step creates default `ProgramSettings` for every
  existing batch (idempotent — only creates if missing).

### 7.6 Migration

- `migrate-batch-backfill.ts` gets a new section that backfills
  `ProgramSettings` for any batch that doesn't have one.

### 7.7 What this does NOT include (deferred)

- Multi-image hero carousel, video backgrounds.
- A/B testing different hero copy.
- Per-section sub-themes.
- Program-archive mode (read-only).

---

## 6. Phase 1 — the unblock-now slice (SHIPPED)

The minimum I can build in a focused session that gets the user
something visible to verify. Scope:

**Backend:**
1. Add `batchId` to the 12 content models (CommunityPost, ZoomMeeting,
   DocumentInsight, TranscriptKnowledge, Badge, ReputationLog, SearchLog,
   UnresolvedSearch, Notification, TeaNotification, SupportRequest,
   AiQuestion).
2. Migration script that backfills all existing rows to the default
   batch.
3. New endpoint: `GET /api/batches/by-slug/:slug` (slugify the Batch name).
4. New endpoint: `POST /api/batches/:id/default` (admin only).
5. Update public read endpoints to filter by `batchId`.

**Frontend:**
1. New `ProgramPortalPage` at `/` — lists active programs as cards,
   "Create new program" CTA for admins. Click a card → set BatchContext
   + route to `/program/:slug`.
2. New `/program/:slug` page that fetches from
   `GET /api/batches/by-slug/:slug` + the program's FAQs, then renders
   the existing `Yaksha2026_27ProgramPage` UI but data-driven.
3. Refactor `BatchContext` so picking a program from `/` updates
   `currentBatch` (it already does this).
4. Wire the new routes in `App.tsx`. The old `/explore/select` route
   stays for now (legacy deep-links) but redirects to `/`.

**What Phase 1 does NOT include** (deferred):
- The new `/admin/programs/:programId` admin landing page with tabs
- The global `<AdminProgramPicker>` sidebar
- Community / Zoom / KB pages being batch-scoped (they'll read
  cross-program data with no filter, which works but isn't isolated)
- Cross-program leaderboard isolation
- Per-program reputation (User model unchanged for now)

This is roughly a 1-2 day focused slice. Once Phase 1 is verified in
the browser, Phase 2 picks up with the admin scoping and the per-model
batch filtering on the unscoped pages.

---

## 6. Risks / non-obvious gotchas

1. **Existing data with `batchId: null`** must be backfilled before
   the public site flips to mandatory batch filtering, or the
   home page will go empty. The seed already does this for FAQs; a
   one-shot migration script will do it for the other 11 models.
2. **Vector indexes** in Atlas are per-collection, not per-batch.
   Search results still need to filter by `batchId` in the query
   pipeline (the `BatchContext` already does this for FAQs).
3. **Notifications** are user-bound, not program-bound, but the
   *event* that fires them (a new FAQ, a reply) is program-bound.
   Adding `batchId` to notifications is for analytics, not routing —
   worth doing but lower priority.
4. **Cross-program user data** (reputation, badges) — the user
   identity spans programs, so a single user can have different
   reputation in different programs. The current single-number
   reputation will need to be either flattened (keep cumulative) or
   split (per-program). See Q5.
5. **The hardcoded `Yaksha2026_27ProgramPage`** I built in an
   earlier turn is a one-off. Phase 3 replaces it with a slug-routed
   page. Until then the two pages will drift.
