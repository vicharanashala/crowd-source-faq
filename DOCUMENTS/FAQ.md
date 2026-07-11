# FAQ Frontend Integration Guide

## Objective

The FAQ module should follow the same architecture as the Discussion Forum and Escalation modules.

Instead of using the large standalone prototype with hardcoded data, the frontend should consume FAQs from the backend using the existing API.

**This objective is now met.** The sections below are kept as the original
integration guide; see [Current State](#current-state) for what's actually
built today versus what was originally specified.

---

## Backend API

### Fetch FAQs

GET /api/faqs

Returns

```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "question": "...",
      "answer": "...",
      "category": "...",
      "tags": []
    }
  ]
}
```

### Create FAQ (Admin)

POST /api/faqs

Request

```json
{
  "question": "...",
  "answer": "...",
  "category": "...",
  "tags": []
}
```

Full FAQ API (including `GET /:id`, `PUT /:id`, `DELETE /:id`, and the
`search`/`category`/`tag` query params on the list endpoint) is documented
in `DOCUMENTS/BACKEND_INTEGRATION.md`.

---

# Recommended Folder Structure

```
src/

pages/
    FAQPage.jsx

components/
    FAQCard.jsx
    FAQSearch.jsx
    FAQCategory.jsx

services/
    faqService.js

styles/
    faq.css
```

This matches the architecture already used by:

- Discussion
- Escalation

---

# Responsibilities

## FAQPage

Responsible for

- fetching FAQs
- search state
- category state
- rendering FAQ cards

Should call

```
getFAQs()
```

from

```
faqService.js
```

---

## FAQSearch

Contains only

- search textbox

Voice Search is **not required for this milestone** and can be added later.

---

## FAQCategory

Displays available categories and updates the selected filter.

---

## FAQCard

Displays

- Question
- Answer (expand/collapse)
- Category
- Tags

---

# Keep from the Prototype

The following UI elements should be preserved where possible:

- Overall page layout
- Search bar
- FAQ card design
- Expand/collapse interaction
- Typography
- Color palette

---

# Remove for Now

The following features are not backed by the current backend and should be omitted or disabled:

- Upvote / Downvote
- Trending FAQs
- Most viewed
- Related questions
- Search miss logging
- Insights panel
- Escalation simulation
- In-memory analytics

These can be reintroduced once backend support exists.

---

# Data Source

Do not use a hardcoded FAQ array.

All FAQs should come from:

```
GET /api/faqs
```

The initial FAQ content has been seeded into MongoDB, so the frontend should treat the backend as the single source of truth.

---

# Admin Support

The backend already supports

```
POST /api/faqs
```

A simple admin page or form can later be added to allow administrators to create new FAQs.

No frontend changes should be required to display newly added FAQs—reloading the FAQ page should automatically fetch the latest data.

---

# Goal

The aim is to make the FAQ module consistent with the rest of the application:

Discussion
↓

FAQ
↓

Escalation
↓

Admin

using a shared component-based architecture and MongoDB-backed data instead of hardcoded demo content.

---

# Current State

What's actually in the repo today, vs. the spec above.

## Real folder structure

The spec above was written before the merge into the shared app; the actual
paths differ slightly (page is TypeScript, components stayed JS/JSX — that's
fine, `allowJs` is enabled so they interoperate cleanly):

```
frontend/src/
├── pages/FaqPage.tsx          not FAQPage.jsx — otherwise matches the spec
├── components/
│   ├── FAQCard.jsx
│   ├── FAQSearch.jsx
│   └── FAQCategory.jsx
├── services/faqService.js
├── styles/faq.css
└── types/faq.ts                 Faq TypeScript type, used by FaqPage.tsx
```

## Implemented as specified

- `FaqPage.tsx` fetches from `getFAQs()`, owns search + category state, renders `FAQCard`s — matches the spec exactly.
- `FAQSearch.jsx` — search textbox only, no voice input. Matches the spec.
- `FAQCard.jsx` — question, expand/collapse answer, category, tags. Matches the spec.
- `faqService.js` — `getFAQs()` used by the page; `createFAQ()` exists (matches "Create FAQ (Admin)" above) but nothing calls it yet — there's still no admin form UI, exactly as this guide anticipated ("can later be added").
- All the "Remove for Now" items (upvote, trending, related questions, search-miss logging, insights panel, in-memory analytics, escalation simulation) are absent, as intended.

## Deviated from the spec

- **`FAQCategory.jsx` derives its category list from the fetched FAQ data**
  (`categories` prop, computed in `FaqPage.tsx` from `faqs.map(f => f.category)`)
  instead of a hardcoded list. This isn't in the original spec, but it's a
  deliberate fix: an earlier hardcoded category list (Account, Technical,
  Selection, etc.) didn't match the categories actually seeded in MongoDB
  (`About the Internship`, `Timeline`, `Team Formation`, `VIBE Team`, `NOC`),
  so category filtering silently returned zero results for most buttons.
  Deriving it from real data keeps it correct as FAQs are added.
- **A "🎙️ Ask the Voice Agent" link was added** to `FaqPage.tsx`, opening
  `/voice-agent` in a new tab. This isn't in the original spec (voice search
  was explicitly deferred) — it links out to the separate FAQ Voice Agent
  module rather than adding voice input to `FAQSearch.jsx` itself. See
  `Voice agent/FAQS/README.MD` and the Voice Agent section of
  `DOCUMENTS/BACKEND_INTEGRATION.md`.
