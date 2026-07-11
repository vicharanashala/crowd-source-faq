# Escalation Module — CSFAQ

Scope: Escalation page (submit, track, assign, analytics, reopen) + the
escalation queue shown on the Admin Dashboard.

## What this is

Submit queries, track their status, route them to the right team, and manage
everything through an admin view. Originally built to be merged into the
shared CSFAQ MERN app — **that merge has happened**: this module's backend
and frontend now live inside the same `csfaq/` monorepo as FAQ, Discussion
Forum, and the Voice Agent (see `DOCUMENTS/BACKEND_INTEGRATION.md` for the
full API surface across all modules).

## Important: there are two parallel frontend implementations

This module currently has **two separate, non-shared** frontend builds of
essentially the same feature, and only one of them is actually reachable
from the app:

| | Track A (legacy prototype) | Track B (integrated) |
|---|---|---|
| Files | `pages/EscalationPage.jsx`, `components/EscalationForm.jsx`, `components/EscalationTracker.jsx`, `components/AdminDashboard.jsx`, `components/StatusStepper.jsx`, `components/TicketAttachments.jsx` | `pages/AdminDashboardPage.tsx`, `components/admin/EscalationQueue.tsx`, `components/admin/DashboardStats.tsx` |
| Data layer | `services/escalationService.js` (plain `fetch`, bearer-token header support, `FormData` for attachments) | `api/escalationApi.ts` (typed `apiClient`) |
| Styling | Plain CSS (`styles/escalation.css`) | Tailwind, matching the rest of the app |
| Covers | Submit, track, reopen, **and** an admin tab (filter/sort + assign/status/notes) | Admin only — assign/status/notes/analytics |
| Actually routed? | **No.** `frontend/src/App.tsx` imports `./pages/EscalationPage` with no extension; `pages/EscalationPage.tsx` (a "Coming soon" placeholder, unrelated to Track A) also exists with the same name, and the bundler resolves to that one. Track A's real submit/track/admin UI is currently **dead code** — it exists in the repo but nothing links to it. | **Yes**, via the `/admin` route. |

Net effect right now: **the `/escalation` route interns actually see is a
placeholder**, even though a fully-built submit/track flow (Track A)
already exists in the codebase. The `/admin` route works, using Track B,
but only covers the admin side (assign/status/notes/analytics) — there's no
routed page for interns to submit or track their own tickets today.

## Features

| Feature | Status |
|---|---|
| Submit query (tagged to a team) | ✅ Built (Track A) — ⚠️ not currently reachable, see above |
| Track query status | ✅ Built (Track A) — ⚠️ same |
| Reopen a resolved/closed query | ✅ Working (both tracks call `PATCH /escalations/:id/reopen`) |
| Admin: assign/reassign to a team | ✅ Working (Track B, routed at `/admin`) |
| Admin: filter/sort (status, priority, category, sort order) | ⚠️ UI exists only in Track A's `AdminDashboard.jsx` (not routed) — and even there, the filters are sent as query params that `getEscalations` on the backend **ignores entirely**. `GET /api/escalations` always returns every escalation sorted by `createdAt` descending, no filtering. Track B (the routed one) has no filter/sort UI at all. |
| Admin: analytics dashboard | ✅ Working (Track B, `GET /api/escalations/analytics`) |
| Status lifecycle | ✅ Working, but simpler than "Reopened" implies: statuses are `Pending → In Progress → Resolved/Closed`; reopening sets status back to `"In Progress"`, not a distinct `Reopened` state. |
| Link back to originating Discussion Forum thread | ❌ Not implemented. No field on the `Escalation` model or UI for this exists currently. |
| Auth (real login + role check) | ❌ Not done. `submittedBy` is hardcoded to `"Anonymous User"` server-side (`createEscalation` doesn't read `req.user` at all); admin visibility is a local-storage checkbox, not a role check. |
| Database connection | ⚠️ Requires `MONGODB_URI` in `backend/.env` (not `MONGO_URI` — see [Next steps](#next-steps-to-make-this-submission-ready)) — nothing works without it. |
| File attachments | ⚠️ Track A's `escalationService.js` will send files as `multipart/form-data`, but the backend has no file-upload middleware (no multer) and `createEscalation` just spreads `req.body` — uploaded files are silently dropped, not stored. The `attachments: string[]` field on the model stays empty. |

## What's real vs. mocked

**Real and functional right now (via the `/admin` route, Track B):**
Viewing all escalations, assigning them to a team, updating status with
resolution notes, adding internal notes, reopening, and analytics — all
work as actual logic against MongoDB once connected.

**Built but not reachable (Track A):** submitting a new escalation and
tracking your own — the code exists and would work if wired into the
router, but nothing currently renders it.

**Mocked / not yet connected:**
- Auth is not implemented — `submittedBy` is hardcoded, not derived from a real session.
- Admin dashboard visibility is a placeholder check (local storage / a checkbox), not a real role system.
- File attachments are accepted by the client but never persisted by the server.
- Filter/sort exists in the UI in one place but is not enforced by the backend.


## Tech stack

- React + Vite (frontend) — merged into the shared CSFAQ frontend
- Node.js + Express + TypeScript (backend)
- MongoDB via Mongoose
- Styling is currently mixed: Track A (`EscalationForm`, `EscalationTracker`,
  `AdminDashboard.jsx`) uses plain CSS (`styles/escalation.css`); Track B
  (`EscalationQueue`, `DashboardStats`, routed at `/admin`) uses Tailwind,
  consistent with the rest of the app.

## How to use

There's no root-level `install-all`/`dev` script in this monorepo. Run the
backend and frontend separately, same as the other modules:

```bash
cd backend
cp .env.example .env   # set MONGODB_URI
npm install
npm run dev              # http://localhost:5002

cd frontend
npm install
npm run dev               # http://localhost:5173
```