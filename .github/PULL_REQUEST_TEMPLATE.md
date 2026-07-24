## What changed

<!-- One paragraph. What does this PR do, and why? -->

## Related issue

<!--
Closes #ISSUE-NUMBER
Refs #ISSUE-NUMBER (if partial)
-->

## Type of change

- [ ] Bug fix
- [ ] Feature
- [ ] Refactor (no behaviour change)
- [ ] Docs / comments only
- [ ] CI / tooling

## Area affected

- [ ] Backend (Express / Mongoose)
- [ ] Frontend (React / Vite)
- [ ] Admin / Train tab (`/admin/*`)
- [ ] Community (`/community` — posts, comments, auto-answer)
- [ ] Search (hybrid text retrieval, training stats)
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
- [ ] Tested with a real API hit or browser interaction if behaviour changed
- [ ] Tests added or updated for the change
- [ ] Single logical change — unrelated fixes noted in description, not fixed here
- [ ] Docs updated if route / API / env var / pipeline behaviour changed
- [ ] Rebased onto `main`, no merge commits

## Notes for reviewer

<!-- Anything non-obvious: edge cases, intentional trade-offs, what NOT to review. -->
