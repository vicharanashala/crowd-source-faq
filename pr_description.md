## What changed

This PR introduces two major enhancements to the FAQ module and resolves a critical vector search bug on the backend:
1. **Dynamic Related FAQs (FAQ Detail Page):** Replaces the static mock list that sliced the first 5 same-category FAQs in `FAQPage.tsx` with actual topically related FAQs fetched from the new endpoint `GET /api/faq/:id/related`. The backend ranks candidate FAQs by tag overlap, falling back to 1024-dimension Atlas vector similarity search, and text match fallback.
2. **Interactive FAQ Tag Chips (Click-to-Browse):** Renders interactive tag chips for the `.tags` field on both the FAQ list items (inside accordion items) and the FAQ detail page. Clicking on a tag chip immediately routes the user to search results with that tag as the query.
3. **Fixed AI Vector Search Fallback Bug:** Resolves a bug in `related.controller.ts` where a hardcoded check for embedding vector length equal to `768` was preventing vector similarity search from firing (since the project's embedding model was updated in v1.68 to 1024 dimensions).

## Related issue

<!--
Closes #ISSUE-NUMBER
Refs #ISSUE-NUMBER (if partial)
-->

## Type of change

- [x] Bug fix
- [x] Feature
- [ ] Refactor (no behaviour change)
- [ ] Docs / comments only
- [ ] CI / tooling

## Area affected

- [x] Backend (Express / Mongoose)
- [x] Frontend (React / Vite)
- [ ] Admin / Train tab (`/admin/*`)
- [ ] Community (`/community` — posts, comments, auto-answer)
- [x] Search (hybrid text retrieval, training stats)
- [ ] Auth / middleware / samagama.in bridge
- [ ] Crons / schedulers / embedding-warm
- [ ] Observability (Sentry / logging / Discord alerts)
- [ ] Docs

## CI verification

- [ ] `cd apps/backend && npx tsc --noEmit` exits 0
- [ ] `cd apps/backend && npx vitest run` — all tests pass
- [ ] `cd apps/frontend && npx tsc --noEmit` exits 0
- [ ] `cd apps/frontend && npx vitest run` — all tests pass
- [ ] `pnpm run lint` — 0 errors (152 warnings is the baseline)
- [ ] GitHub Actions green on the merge commit (CI, CodeQL, Build & Deploy)
- [x] Tested with a real API hit or browser interaction if behaviour changed
- [ ] Tests added or updated for the change
- [x] Single logical change — unrelated fixes noted in description, not fixed here
- [ ] Docs updated if route / API / env var / pipeline behaviour changed
- [x] Rebased onto `main`, no merge commits

## Notes for reviewer

* **Lighter Shape for Related FAQs:** The `/api/faq/:id/related` endpoint returns a lighter shape (`_id`, `title`, `tags`, `matchScore`, `upvotes`, `url`) than the full `FAQItem`. `QuestionDetail.tsx` only reads `_id`, optional `questionNumber`, and uses `getQuestionTitle(rel)` which successfully resolves to `rel.title` if `rel.question` is not present, keeping payloads fast and light.
* **Graceful Fallback:** If the vector database or tag overlap logic returns empty or fails, the frontend falls back to slicing the first 5 same-category FAQs from the static loaded pool.
* **Tag Click Propagation:** `TagChips.tsx` uses `e.stopPropagation()` inside its click handler to prevent the accordion item from toggling when clicking a tag chip.
* **AI Vector Fallback Fix:** Swapped `postEmbedding.length === 768` with `EMBEDDING_DIM` (1024) to align with the new embedding model from `embeddings.ts`.


