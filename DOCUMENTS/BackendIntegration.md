# Backend Integration Notes

## MongoDB

- Backend uses MongoDB with Mongoose.
- Configure `MONGODB_URI` in `.env`.
- Default local URI:
  mongodb://localhost:27017/csfaq

---

## Health Check

GET /api/health

Returns:

{
  "success": true,
  "message": "CSFAQ API is running"
}

---

## FAQ Module

Implemented endpoints:

GET /api/faqs
GET /api/faqs/:id
POST /api/faqs
PUT /api/faqs/:id
DELETE /api/faqs/:id

`GET /api/faqs` supports optional query params:

- `search` — full-text search across question/answer/category (MongoDB text index)
- `category` — exact category match
- `tag` — exact tag match

Returns:

{
  "success": true,
  "data": [...]
}

`GET /api/faqs/:id` and `POST /api/faqs` return `data` as a single FAQ
object rather than an array. `DELETE /api/faqs/:id` returns
`{ "success": true, "message": "FAQ deleted successfully" }` with no `data`.
Missing `:id` on GET/PUT/DELETE returns a `404`.

---

## Discussion Forum Module

Implemented endpoints:

POST /api/discussions
GET /api/discussions
GET /api/discussions/:id
POST /api/discussions/:id/replies
PATCH /api/replies/:replyId/upvote
PATCH /api/replies/:replyId/accept
PATCH /api/replies/:replyId/approve

`GET /api/discussions` supports optional query params:

- `search` — text search
- `category` — exact category match
- `tag` — exact tag match

`GET /api/discussions/:id` returns the discussion together with its
replies. `POST /api/discussions` and `POST /api/discussions/:id/replies`
expect `authorId` in the body (see [Current Integration
Assumptions](#current-integration-assumptions) — there's no real auth yet).
`PATCH /api/replies/:replyId/accept` only succeeds when called by the
discussion's original author (`userId` in the body). `.../approve` is the
admin action that shows an "approved" badge on a reply.

Returns:

{
  "success": true,
  "data": {...}
}

---

## Escalation Module

Implemented endpoints:

POST /api/escalations
GET /api/escalations
GET /api/escalations/my
PATCH /api/escalations/:id/assign
PATCH /api/escalations/:id/status
PATCH /api/escalations/:id/reopen
POST /api/escalations/:id/notes
GET /api/escalations/analytics

`PATCH /api/escalations/:id/assign` expects `{ "team": "..." }` in the body
(sets `assignedTo`; the original category is preserved separately).
`PATCH /api/escalations/:id/status` expects `{ "status": "...",
"resolutionNotes": "..." }`. `POST /api/escalations/:id/notes` expects
`{ "text": "..." }` and appends to the escalation's internal `notes[]`.

---

## FAQ Voice Agent

GET /voice-agent/api/faqs

This is intentionally **not** backed by MongoDB. It reads a static local
snapshot (`backend/voice-agent/data/faq-seed.json`) so the voice agent can
run without a database connection. Its static frontend assets are served
from `/voice-agent` (mounted in `app.ts` alongside the API routes, same
port as the rest of the backend). See `Voice agent/FAQS/README.MD` for how
to refresh that snapshot from the live FAQ source.

Returns:

{
  "source": "local-seed:voice-agent/data/faq-seed.json",
  "fetchedAt": "...",
  "faqs": [...]
}

Note the different response shape from the other modules — no
`success`/`data` wrapper. Errors return HTTP 502 with
`{ "error": "...", "message": "..." }`.

---

## Admin Module — Not Implemented

GET /api/admin/overview
GET /api/admin/flagged-discussions

Reserved routes only. Both currently return HTTP `501`:

{
  "success": false,
  "message": "Admin Dashboard module not implemented yet. Placeholder endpoint."
}

The Admin Dashboard *page* on the frontend does work today, but only
because it consumes the Escalation module's `GET /api/escalations` and
`GET /api/escalations/analytics` directly — it doesn't hit these `/api/admin/*`
routes at all yet.

---

## Current Integration Assumptions

Authentication is not implemented anywhere in the backend.

Temporary behavior:

- FAQ and Discussion Forum: `authorId`/`submittedBy` are trusted as-is from
  the request body (frontend generates/persists a local fake user id) — the
  backend does not verify identity.
- Escalation: `submittedBy` defaults to "Anonymous User"
- `getMyEscalations()` currently returns all escalations (no user filtering)
- Assignment, notes, and reply-approve/accept do not perform real role checks


---

## Frontend Response Format

All endpoints except the FAQ Voice Agent return

{
  "success": true,
  "data": ...
}

Frontend components should consume `response.data`. The FAQ Voice Agent
(`/voice-agent/api/faqs`) is the one exception — see above.

---

## Tested

✓ FAQ GET / GET by id / POST / PUT / DELETE
✓ FAQ search / category / tag filters

✓ Discussion GET / GET by id / POST
✓ Discussion search / category / tag filters
✓ Reply add / upvote / accept / approve

✓ Escalation POST
✓ Escalation GET
✓ Escalation Tracker
✓ Assignment
✓ Status Update
✓ Reopen
✓ Notes
✓ Analytics (API)

✓ FAQ Voice Agent GET (local seed)

Not yet tested against a real deployment:

- Admin module (not implemented — see above)
- Query Resolution module (not implemented — see above)

---

## Future Enhancement

- Authentication
- Authorization
- File attachment storage (Escalation `attachments[]` field exists, unused)
- Admin dashboard integration (`/api/admin/*` endpoints — overview + flagged-discussions queue)
- Discussion → FAQ promotion flow (`promotedToFaq` field exists, unused)
