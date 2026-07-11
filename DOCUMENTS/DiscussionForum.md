# CSFAQ — Discussion Forum Module

Implementation of the **Discussion Forum** page from `PRODUCT.md`, built with
the specified stack:

| Layer    | Technology                     |
| -------- | ------------------------------- |
| Frontend | React + TypeScript + Tailwind   |
| Backend  | Node.js + Express + TypeScript  |
| Database | MongoDB (via Mongoose)          |

The wider CSFAQ project also has an **FAQ page**, **Admin Dashboard**,
**Query Resolution page**, and **Escalation page**, owned by other
workstreams. This module now lives merged into the single CSFAQ monorepo
alongside all of them (not a standalone repo — see [Where this
lives](#where-this-lives) below). Of those sibling modules, **FAQ and
Escalation are now fully built**, not placeholders. **Admin Dashboard**
(beyond the escalation queue) and **Query Resolution** are still
placeholders — see [Current Sibling-Module Status](#current-sibling-module-status).

Future-enhancement items from `Product.md` (rich text editor, nested
replies, reputation system, WebSockets, etc.) are intentionally **not**
built.

## Where this lives

```
csfaq/
├── backend/                Express + TypeScript API, MongoDB models (all modules)
├── frontend/                React + TypeScript + Tailwind SPA (all modules)
├── Voice agent/FAQS/        Standalone original FAQ Voice Agent (kept for offline reference)
└── DOCUMENTS/                Per-module notes, this file included
```

The Discussion Forum's own files, inside that monorepo:

```
backend/src/
├── models/Discussion.ts
├── models/Reply.ts
├── controllers/discussionController.ts
├── controllers/replyController.ts
├── routes/discussionRoutes.ts
├── routes/replyRoutes.ts
└── middleware/validate.ts        validateDiscussionInput, validateReplyInput

frontend/src/
├── pages/DiscussionForumPage.tsx     list, search, "new discussion" entry point
├── pages/DiscussionDetailPage.tsx    single discussion + its replies
├── components/SearchBar.tsx
├── components/NewDiscussionButton.tsx
├── components/QuestionSubmissionForm.tsx   new-discussion modal/form
├── components/DiscussionFeed.tsx     renders the list of DiscussionCards
├── components/DiscussionCard.tsx     one discussion's preview in the feed
├── components/ReplySection.tsx       reply list + add-reply + upvote/accept/approve actions
├── components/Navbar.tsx             shared nav (FAQ / Discussion Forum / Escalation / Admin) — not forum-specific, but the forum is one of its four links
├── api/discussionApi.ts              typed client for all discussion + reply endpoints
└── hooks/useCurrentUser.ts           local fake-auth identity (see Notes)
```

## What's implemented (Discussion Forum)

- Navigation bar linking to FAQ / Discussion Forum / Escalation / Admin (`Navbar.tsx`)
- Search bar to find existing discussions before posting (`SearchBar.tsx`, backed by `?search=`)
- New Discussion button + submission form (title, description, category,
  optional tags) (`NewDiscussionButton.tsx` + `QuestionSubmissionForm.tsx`), with client- and server-side validation (`validateDiscussionInput`)
- Discussion feed: title, description preview, category, reply count,
  upvote count, accepted-answer indicator, creation date (`DiscussionFeed.tsx` / `DiscussionCard.tsx`)
- Discussion detail page: full question, author, timestamp, replies,
  accepted answer (`DiscussionDetailPage.tsx`)
- Reply section: add reply, chronological order, accepted answer pinned
  to the top (`ReplySection.tsx`)
- Upvote system (one upvote per user per reply, enforced via `upvotedBy[]` on the Reply model)
- Accepted answer: only the discussion's original author can mark one
  reply as accepted; only one accepted answer per discussion
- Admin approval: mark a reply as approved (badge shown to all users)
- MongoDB collections matching the spec: `Discussion`, `Reply`
- REST API matching the spec exactly (see below)

## Current Sibling-Module Status

| Module | Status |
|---|---|
| FAQ | ✅ Fully implemented (own CRUD API, own frontend page) |
| Escalation | ✅ Fully implemented (submit/track/reopen, admin assign/status/notes, analytics) |
| Admin Dashboard | 🚧 Partial — the page shows the live escalation queue/analytics, but the dedicated `/api/admin/*` overview + moderation endpoints are still `501` placeholders |


`backend/src/routes/{adminRoutes,queryResolutionRoutes}.ts` and
`frontend/src/pages/{AdminDashboardPage,QueryResolutionPage}.tsx` are the
remaining placeholder pieces. Replace them when those modules are built out.

## Getting started

### Backend

```bash
cd backend
cp .env.example .env   # adjust MONGODB_URI / PORT if needed
npm install
npm run dev             # http://localhost:5002
```

Requires a running MongoDB instance (local or Atlas) at the `MONGODB_URI`
in `.env`.

### Frontend

```bash
cd frontend
npm install
npm run dev              # http://localhost:5173
```

The Vite dev server proxies `/api/*` to the backend (see
`frontend/vite.config.ts` — update its `target` if you change the backend
port), so no CORS setup is needed in development.

## API Reference

| Method | Endpoint                          | Description                                   |
| ------ | ---------------------------------- | ---------------------------------------------- |
| POST   | `/api/discussions`                 | Create a new discussion                        |
| GET    | `/api/discussions`                 | List discussions (`?search=&category=&tag=`)   |
| GET    | `/api/discussions/:id`             | Get one discussion with its replies            |
| POST   | `/api/discussions/:id/replies`     | Add a reply to a discussion                    |
| PATCH  | `/api/replies/:replyId/upvote`     | Upvote a reply (`{ userId }`)                  |
| PATCH  | `/api/replies/:replyId/accept`     | Mark a reply accepted (`{ userId }`, author-only) |
| PATCH  | `/api/replies/:replyId/approve`    | Admin: approve a reply                         |
| GET/POST/PUT/DELETE | `/api/faqs/*`         | FAQ module — fully implemented                 |
| *      | `/api/escalations/*`               | Escalation module — fully implemented          |
| GET    | `/voice-agent/api/faqs`            | FAQ Voice Agent — own local data, not this API's DB |
| *      | `/api/admin/*`                     | Placeholder — Admin Dashboard module (beyond the escalation queue) |
| *      | `/api/query-resolution/*`          | Placeholder — Query Resolution module          |

Full request/response shapes for every module are in `DOCUMENTS/BACKEND_INTEGRATION.md`.

## Notes

- There is no Auth module in this build yet. The frontend generates and
  persists a lightweight local user id (`frontend/src/hooks/useCurrentUser.ts`)
  so "who's the discussion author" / "did this user already upvote" /
  "only the author can accept" can be demonstrated. Swap this out for real
  auth when that module exists — the API already expects an `authorId` /
  `userId` on the relevant requests, so the contract won't need to change.
- The detail page has a "View as admin" checkbox (`DiscussionDetailPage.tsx`)
  as a stand-in for a real role check, so the reply-approval control can be
  exercised without a full Admin Dashboard yet.
- `Discussion.promotedToFaq` exists on the data model but nothing sets it
  yet — the "best answers get promoted to the FAQ" flow mentioned on the
  Discussion Forum page is not wired up end-to-end.