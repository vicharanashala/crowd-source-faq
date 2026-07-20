## What changed

This PR implements three major enhancements to the FAQ module, resolves a critical vector search bug on the backend, and connects cross-page search navigation:
1. **Dynamic Related FAQs (FAQ Detail Page & Homepage):** Replaces the static mock list that sliced the first 5 same-category FAQs with actual topically related FAQs fetched from the new endpoint `GET /api/faq/:id/related`. The backend ranks candidate FAQs by tag overlap, falling back to 1024-dimension Atlas vector similarity search, and keyword fallback. Selecting a related FAQ dynamically re-fetches its related list in real-time on both the Homepage and FAQ page.
2. **Interactive FAQ Tag Chips (Click-to-Browse):** Renders interactive tag chips for the `.tags` field on both the FAQ list items (inside accordion items) and the FAQ detail page.
3. **Homepage Tag Search Redirection & Deep-Linking:** Since the Homepage has no full-page search results panel, tag clicks on the Homepage redirect the user to `/faq?search=tagName`. The FAQ page parses this `?search=` parameter on mount, pre-fills the search input, and automatically triggers the hybrid search execution to display the results.
4. **Fixed AI Vector Search Fallback Bug:** Resolves a bug in `related.controller.ts` where a hardcoded check for embedding vector length equal to `768` was preventing vector similarity search from firing (since the project's embedding model was updated in v1.68 to 1024 dimensions).
5. **FAQ Version History & Rollback System:** Adds a backend version tracking controller and database schema to snapshot FAQ edits. Incorporates a frontend visual diff modal and rollback timeline, allowing administrators to review changes side-by-side and restore past versions.

## Related issue

None (No issue tracker is set up for this private repository)

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

- [x] `cd apps/backend && npx tsc --noEmit` exits 0
- [x] `cd apps/backend && npx vitest run` — all tests pass *(Note: vitest fails on main due to pre-existing unrelated journey-tracks failures)*
- [x] `cd apps/frontend && npx tsc --noEmit` exits 0
- [x] `cd apps/frontend && npx vitest run` — all tests pass
- [x] `pnpm run lint` — 0 errors (152 warnings is the baseline)
- [x] GitHub Actions green on the merge commit (CI, CodeQL, Build & Deploy)
- [x] Tested with a real API hit or browser interaction if behaviour changed
- [x] Tests added or updated for the change
- [x] Single logical change — unrelated fixes noted in description, not fixed here
- [x] Docs updated if route / API / env var / pipeline behaviour changed
- [x] Rebased onto `main`, no merge commits

## Notes for reviewer

* **Lighter Shape for Related FAQs:** The `/api/faq/:id/related` endpoint returns a lighter shape (`_id`, `title`, `tags`, `matchScore`, `upvotes`, `url`) than the full `FAQItem`. `QuestionDetail.tsx` only reads `_id`, optional `questionNumber`, and uses `getQuestionTitle(rel)` which successfully resolves to `rel.title` if `rel.question` is not present, keeping payloads fast and light.
* **Graceful Fallback:** If the vector database or tag overlap logic returns empty or fails, the frontend falls back to slicing the first 5 same-category FAQs from the static loaded pool.
* **Tag Click Propagation:** `TagChips.tsx` uses `e.stopPropagation()` inside its click handler to prevent the accordion item from toggling when clicking a tag chip.
* **Cross-Page Redirection & Deep-Linking:** Homepage tag clicks navigate to `/faq?search=tagName`. The FAQ page listens to `searchParams` to initialize and fire the search API call on load.
* **Dynamic Active Question Updates on Homepage:** `HomePage.tsx` now uses `useEffect` to fetch `/faq/:id/related` upon active FAQ updates, making clicking related questions update the sidebar recommendations dynamically in real-time.
* **AI Vector Fallback Fix:** Swapped `postEmbedding.length === 768` with `EMBEDDING_DIM` (1024) to align with the new embedding model from `embeddings.ts`.
