# PRODUCT.md — CSFAQ: Community Support & FAQ Platform

**Built for:** Vicharanashala Internship (VINS), IIT Ropar
**Status:** Active development — see [Module Status](#module-status) below.

---

## 1. Overview

CSFAQ is a full-stack MERN platform that gives interns a single place to find
answers, discuss problems with each other, and get unresolved issues in
front of an admin — instead of those three things living in scattered
WhatsApp threads, emails, and one-off Google Forms.

The core loop the product is designed around:

```text
Intern has a question
        │
        ▼
Search the FAQ ──── Found it → done
        │
        │ Not found
        ▼
Ask/browse the Discussion Forum ──── A peer or admin reply solves it → done
        │
        │ Still unresolved
        ▼
Raise an Escalation ──── Admin picks it up, tracks it to resolution
```

FAQ, Discussion Forum, and Escalation are three independent, first-class
surfaces (not steps in a wizard) — an intern can jump straight to
Escalation, and an admin resolving an escalation.

## 2. Users

| User | Needs |
|---|---|
| **Intern** | Fast answers; a place to ask peers; a way to guarantee a human sees an unresolved problem. |
| **Admin / Mentor** | Visibility into what's unresolved, ability to assign/triage, and a way to keep the FAQ current without re-answering the same question repeatedly. |

There is currently no authentication — see [Known Gaps](#6-known-gaps--non-goals-for-now).

## 3. Modules

### 3.1 FAQ

Browse, search, and filter a maintained FAQ so an intern's question is
answered without needing a human.

- Search by keyword (question/answer/category, via a MongoDB text index)
- Filter by category — category list is derived from the data itself, not hardcoded
- Expand/collapse individual answers
- **FAQ Voice Agent**: a "🎙️ Ask the Voice Agent" entry point on the FAQ page opens
  a voice-driven Q&A interface (speech-to-text question in, matched FAQ answer
  read back out). It runs off its own local, offline FAQ data snapshot (see
  [Voice Agent data](#voice-agent-data)) rather than the live MongoDB FAQ
  collection, so it works without a database connection.
- Admin FAQ creation (`POST /api/faqs`) exists on the backend; there is no
  admin UI for it yet (see [Roadmap](#7-roadmap)).

### 3.2 Discussion Forum

Peer-to-peer Q&A for anything not already covered by the FAQ.

- Create a discussion (title, description, category, optional tags)
- Search/filter existing discussions before posting a new one
- Reply to a discussion
- Upvote a reply (one upvote per user)
- Discussion author marks one reply as the accepted answer
- Admin can approve a reply (shown as a badge to all users)
- *Planned:* promoting a resolved discussion into an FAQ entry
  (`promotedToFaq` flag already exists on the data model, not yet wired to any action)

### 3.3 Escalation

For anything the FAQ and Discussion Forum don't resolve — a real ticket an
admin has to act on.

- Submit an escalation (title, description, category, priority)
- Track the status of your own submitted escalations
- Reopen a resolved/closed escalation
- Admin: assign/reassign to a team, update status, add internal notes
- Admin analytics: counts by status (pending / in progress / resolved / closed)
- Status lifecycle: `Pending → In Progress → Resolved/Closed`, reopenable back to `Pending`

### 3.4 Admin Dashboard

- Live escalation queue + the analytics above, auto-refreshing
- FAQ management and broader moderation (flagged discussions, content
  moderation queue) are reserved routes (`/api/admin/*`) but not yet built —
  they currently return `501 Not Implemented`

## 4. Module Status

| Module | Backend | Frontend |
|---|---|---|
| FAQ | ✅ Done (CRUD + text search) | ✅ Done |
| FAQ Voice Agent | ✅ Done (own local data, see below) | ✅ Done |
| Discussion Forum | ✅ Done | ✅ Done |
| Escalation | ✅ Done | ✅ Done |
| Admin Dashboard |✅ Done | ✅ Done |

## 5. Architecture

```text
frontend/            React + TypeScript + Vite + Tailwind (React Router)
backend/              Node.js + Express + TypeScript + MongoDB (Mongoose)
backend/voice-agent/  FAQ Voice Agent's static assets + local FAQ seed data
                      (mounted onto the backend at /voice-agent, same port
                      as the rest of the API — no separate process)
```

### Data models (MongoDB / Mongoose)

- **Faq** — `question`, `answer`, `category`, `tags[]`, timestamps. Text-indexed on question/answer/category.
- **Discussion** — `title`, `description`, `category`, `tags[]`, `authorId`, `acceptedReplyId`, `flagged`, `promotedToFaq`, timestamps.
- **Reply** — `discussionId`, `authorId`, `content`, `upvoteCount`, `upvotedBy[]`, `approved`, `accepted`, timestamps.
- **Escalation** — `title`, `description`, `category`, `priority` (Low/Medium/High), `status` (Pending/In Progress/Resolved/Closed), `submittedBy`, `assignedTo`, `attachments[]`, `notes[]` (internal notes), `resolutionNotes`, timestamps.

### API surface

| Method | Endpoint | Purpose |
|---|---|---|
| GET/POST/PUT/DELETE | `/api/faqs`, `/api/faqs/:id` | FAQ CRUD |
| POST/GET | `/api/discussions`, `/api/discussions/:id` | Create/list/read discussions |
| POST | `/api/discussions/:id/replies` | Reply to a discussion |
| PATCH | `/api/replies/:id/upvote` \| `/accept` \| `/approve` | Reply actions |
| POST/GET | `/api/escalations`, `/api/escalations/my` | Create/list escalations |
| PATCH | `/api/escalations/:id/assign` \| `/status` \| `/reopen` | Admin escalation actions |
| POST | `/api/escalations/:id/notes` | Add internal note |
| GET | `/api/escalations/analytics` | Status counts for the dashboard |
| GET | `/voice-agent/api/faqs` | Voice agent's own local FAQ data (not MongoDB) |
| GET | `/api/admin/*`, `/api/query-resolution` | Reserved, currently `501` |

All endpoints return `{ success: boolean, data?: ..., message?: string }`.

### Voice Agent data

The Voice Agent intentionally does **not** call `/api/faqs` or touch MongoDB.
It serves a static JSON snapshot (`backend/voice-agent/data/faq-seed.json`)
so the feature can be demoed without a database connection. That snapshot
was originally pulled from the official Samagama FAQ page and can be
refreshed with `npm run refresh` inside `Voice agent/FAQS/` (the standalone
original, kept for offline reference — see its own README).

## 6. Known Gaps / Non-Goals (for now)

- **No authentication.** `submittedBy`/`authorId` fields exist on the data
  models but are populated with a placeholder (`"Anonymous User"` /
  a locally-generated id) rather than a real logged-in user. Admin checks
  are a local-storage flag, not a real role system.
- **No file attachment storage** for escalations, despite the `attachments[]` field existing.
- **FAQ voice agent data can drift from the real FAQ**, since it's a manually refreshed snapshot, not live.

## 7. Future Additions

- Real authentication + role-based access (admin vs intern)
- Admin FAQ management UI (backend endpoint already exists)
- Discussion → FAQ promotion flow
- Query Resolution module
- Admin overview / content-moderation endpoints (currently placeholders)
- FAQ voting / ranking, related-questions, analytics 

## 8. Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS, React Router |
| Backend | Node.js, Express, TypeScript |
| Database | MongoDB via Mongoose |
| Voice Agent | Vanilla JS, Web Speech API (browser-native STT/TTS), served as static assets by the backend |