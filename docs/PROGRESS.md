# Progress — FAQ Satisfaction Rating

**Branch:** `feature/faq-satisfaction`
**Feature:** Lets users (guest or authenticated) rate an FAQ's helpfulness on a 1–5 scale; ratings aggregate into `satisfactionAvg` / `satisfactionCount` on the FAQ, surfaced to admins.

## Status by area

| Area | Owner | Status |
|---|---|---|
| Data model (`FaqSatisfactionRating` schema, aggregate fields, `recomputeSatisfaction()`) | Enumula Umamaheshwari | ✅ Done |
| Backend API (`GET`/`POST /faq/:id/satisfaction`, guest + auth support, validation) | Manan Agarwal | ✅ Done |
| Frontend rating slider (public FAQ page, both integration points) | Atul Raj | ✅ Done |
| Rating slider UI (5-level emoji rating, optimistic updates) | Hemanjani Harika Kutani | ✅ Done |
| Admin surface — sortable `satisfactionAvg` column | Kshethragna Mikkineni | ✅ Done |
| Backend Vitest tests (new rating, upsert-on-resubmit, guest vs. authenticated, `protectOptional` 401 case, aggregate math) | Kshethragna Mikkineni | ⏳ In progress |
| Playwright e2e test (`tests/e2e/`) | Kshethragna Mikkineni | ⏳ In progress |
| `docs/reference/openapi.yaml` update | Kshethragna Mikkineni | ⏳ In progress |
| `docs/reference/database-schema.md` update | Kshethragna Mikkineni | ⏳ In progress |
| Final PR quality pass (tsc clean, tests passing, docs updated) | Kshethragna Mikkineni | ⏳ Pending |

## Notes
- Admin-side sorting is client-side for now — no server-side index exists yet on `satisfactionAvg`.
- Documentation handoff identified by the API implementer: OpenAPI contract, database schema, architecture/route-reference updates, and this progress file — all owned by the admin/testing/docs role above.
