# Contributing to Crowd Source FAQ

Thanks for your interest in contributing. This document covers the workflow and quality bar for getting changes into `main`.

## Code of Conduct

By participating, you agree to abide by the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Project Overview

Crowd Source FAQ is a full-stack TypeScript application:

- **Backend** — Express + Mongoose, ES modules, MongoDB Atlas. See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).
- **Frontend** — React 18 + Vite + Tailwind, hooks-based.
- **Pipelines** — AI auto-answer, FAQ audit, search, Zoom ingestion. See [docs/PIPELINES.md](./docs/PIPELINES.md).

Start with the [Vision section in the README](./README.md#vision) — every contribution should ladder up to: automate the FAQ lifecycle end-to-end, zero people in the loop.

## Local Setup

```bash
git clone https://github.com/Sarthak-Kushwah/crowd-source-faq
cd crowd-source-faq
pnpm install

# Run the full stack (env setup, ngrok, backend + frontend)
./run.sh
```

`run.sh` prompts for `MONGODB_URI` and `JWT_SECRET` on first run, saves to `apps/backend/.env.local`, does not overwrite existing values.

Required env vars: `MONGODB_URI`, `JWT_SECRET`, at least one AI provider key (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `XAI_API_KEY` / `MINIMAX_API_KEY`). Optional: Zoom OAuth, Cloudinary, Sentry, Twilio, SMTP, Upstash Redis. Full list: [docs/ARCHITECTURE.md#10-env-variables-reference](./docs/ARCHITECTURE.md#10-env-variables-reference).

## Workflow

1. Find or open an issue describing the change.
2. Branch from `main` with a descriptive name (`fix/handle-empty-transcript`, `feat/zoom-retry-dlq`, `docs/architecture-overview`).
3. Make the change. **One logical change per PR.** No unrelated refactors.
4. Run quality checks locally (`tsc --noEmit` in both `apps/backend/` and `apps/frontend/`, plus tests).
5. Open a PR targeting `main`. Reference the issue with `Closes #N` or `Refs #N`.
6. Address review feedback. Approval + green CI = merge.

## Pull Request Quality Bar

Every PR should:

- **Implement only what the issue describes.** If you spot something broken but unrelated, note it in the PR description — do not fix it in the same change.
- **Add or update tests** for backend logic (controllers, routes, utils).
- **Update docs** if the change touches architecture, public APIs, env vars, or pipeline behaviour. The relevant `docs/*.md` file should reflect the new state in the same PR.
- **Run `tsc --noEmit`** in `apps/backend/` and `apps/frontend/`. Both must be clean.
- **Be mergeable cleanly.** Rebase onto `main` before review.

## Code Style

### Backend (TypeScript / Express)

- **ESM with `.js` extensions on all relative imports:**
  ```ts
  import { chat } from '../utils/aiProvider.js';   // good
  import { chat } from '../utils/aiProvider';      // bad
  ```
- **No dynamic `require()`.** All imports at the top of the file.
- **No bare `catch (e) { console.error(e); }`.** Use `logger.warn` / `logger.error` for background failures, `friendlyError(err, 'fallback message')` for user-facing actions.
- **Validate request bodies with Zod** via `validateBody(schema)` middleware on every mutating route.
- **Use the shared AI provider system.** Never hardcode `chat('openai', ...)` in pipeline controllers. See [docs/AI_PROVIDERS.md](./docs/AI_PROVIDERS.md).
- **Use shared pipeline utilities** for auto-answer and FAQ audit: `searchKnowledgeWithFallback`, `triageByScore`, `buildAuditMetaUpdate`, `logPipelineEvent`, `isSensitiveContent` from `utils/pipelineCommon.js`.
- **Write pipeline outcomes to `PipelineResult`** with `pipeline`, `targetModel`, `targetId`, `score`, `verdict`, `flagged`, `checkedAt`.

### Frontend (React / TypeScript)

- **Functional components + hooks.** No class components.
- **Guard auth-gated fetches on `isAuthenticated`, not `user !== null`.** The `useAuth` hook flips `isAuthenticated` only after `/auth/me` confirms the token.
- **Derived state before functions that use it.** TypeScript TDZ: `const canEdit = isAuthor && !isExpert` requires `isExpert` to be declared earlier in the same scope.
- **Avoid multi-patch refactors on deeply nested JSX.** The token-shifting breaks closing-tag structure. For structural multi-replacement work, use `write_file` to rewrite the whole component.

## Quality Checks Before Commit

```bash
cd apps/backend && npx tsc --noEmit && npm test
cd ../frontend && npx tsc --noEmit && npm test
```

## Working on Pipelines

The auto-answer, FAQ audit, and Zoom ingestion pipelines are the highest-leverage parts of the codebase. Before touching them, read [docs/PIPELINES.md](./docs/PIPELINES.md) and [docs/AI_PROVIDERS.md](./docs/AI_PROVIDERS.md).

Pitfalls:

- **Route prefix when adding admin pipeline routes.** Files under `apps/backend/src/modules/admin/*.routes.ts` mount at `/api/admin`. The router path MUST include the full segment. `router.get('/auto-answer/queue', ...)` creates `/api/admin/auto-answer/queue` — correct. `router.get('/queue', ...)` creates `/api/admin/queue` — wrong, silently 404s.
- **Process-post scope nesting in `autoAnswerController`.** `processPost` is an inner function inside `runScheduledAutoAnswer`. Helpers it uses (like `logResult`) MUST be declared at the same scope level. Multi-patch operations on this file corrupt the indentation; use `write_file` if you're doing structural work.
- **Per-pipeline AI provider config.** Always use `getPipelineProviderConfig(pipeline)` + `chatWithConfig(cfg, messages)`. Never `chat('openai', ...)`.

## Working on Search

The hybrid search pipeline (vector + keyword + RRF) lives in `apps/backend/src/modules/search/search.controller.ts` and `apps/backend/src/utils/http/search.ts`. Known constraints:

- `POST /api/search` is **public** (no `protect`). The frontend SearchBar sends no JWT.
- The LRU cache is in-memory and per-instance — does not survive restarts. Upstash Redis is the multi-instance cache when configured.
- `applySearchThreshold` accepts a `thresholds` parameter but currently ignores it; filtering is hardcoded to `textScore > 0 || vectorScore >= 0.80`.

## Documentation

If your change touches:

- A new route, controller, model, or service — update `docs/ARCHITECTURE.md`
- A pipeline (auto-answer, FAQ audit, search, Zoom) — update `docs/PIPELINES.md`
- AI provider configuration — update `docs/AI_PROVIDERS.md`
- A new env var — update `docs/ARCHITECTURE.md#10-env-variables-reference`
- A new public-facing feature or behaviour — update `README.md`

Docs and code in the same PR is the norm. Out-of-date docs are a bug.

## Commit Messages

- Imperative mood, present tense: "Add", "Fix", "Refactor", not "Added" or "Fixes".
- First line ≤ 72 characters, no period.
- Body: explain WHY, not WHAT. Reference issues.
- Examples: `fix: prevent orphaned data on user soft-deletion`, `feat: add retry + dead-letter queue for Zoom ingestion`, `docs: expand admin dashboard analytics section in README`.

## Reporting Issues

When opening an issue, include environment (Node version, OS, branch / SHA), reproduction steps, expected vs actual output, relevant logs, and screenshots for UI bugs.

For security issues, do NOT open a public issue. Email the maintainers directly.

## Questions?

Open a discussion on GitHub, or check the [docs/](./docs/) directory.
