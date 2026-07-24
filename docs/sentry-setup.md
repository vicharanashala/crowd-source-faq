# Sentry Setup — Complete Guide

This doc explains the step-by-step setup for the 3 Sentry dashboards (Frontend, Backend, Database monitoring) for the shamagama project.

## Prerequisites

You need a Sentry account (https://sentry.io). Free tier is fine for testing.
- Sign up → create an Organization
- Create 3 Projects:
  - `shamagama-frontend` (Platform: React / JavaScript)
  - `shamagama-backend` (Platform: Node.js / Express)
  - `shamagama-database` (Platform: Node.js — for MongoDB tracing; can be the same project as backend if you prefer)

Each project has a DSN (Data Source Name) — a URL like:
`https://<key>@<org>.ingest.sentry.io/<project-id>`

The 3 DSNs go in the project's env config (see step 2 below).

## Step 1: Local dev — get the DSNs

1. Log in to sentry.io
2. Projects → "Create Project" (3 times — see names above)
3. For each project: Settings → Client Keys (DSN) → copy the DSN
4. Save them in your password manager; we'll put them in env files next

## Step 2: Configure env

### Backend (apps/backend/.env)

Add (or set) the following. If you only have ONE DSN for the whole backend, use that for all 3 vars; otherwise set per-project.

```bash
# Backend observability
SENTRY_DSN=https://<backend-key>@<org>.ingest.sentry.io/<backend-project-id>
SENTRY_TRACES_SAMPLE_RATE=0.2          # 20% of transactions get traced
SENTRY_PROFILES_SAMPLE_RATE=0.1        # 10% of traced transactions get profiled
SENTRY_DB_DSN=https://<db-key>@<org>.ingest.sentry.io/<db-project-id>  # optional: separate project for DB
SENTRY_ENV=development                # production in prod
SENTRY_RELEASE=v1.0.0+1               # or use git sha: $(git rev-parse --short HEAD)
SENTRY_DEBUG=false                     # set true in dev for verbose logs
```

### Frontend (apps/frontend/.env)

```bash
VITE_SENTRY_DSN=https://<fe-key>@<org>.ingest.sentry.io/<fe-project-id>
VITE_SENTRY_TRACES_SAMPLE_RATE=0.1
VITE_SENTRY_ENV=development
VITE_SENTRY_RELEASE=v1.0.0+1
```

Both envs use `git rev-parse --short HEAD` for `SENTRY_RELEASE` if you want auto-versioning.

## Step 3: Backend changes (apps/backend)

### 3.1 Update `apps/backend/src/bootstrap/app.ts` — already has Sentry init. Update it to:

- Add `profilingIntegration` from `@sentry/profiling-node` (it's in `package.json:43` already as `@sentry/node`; `profiling-node` is a separate peer dep — see if it's installed)
- Add `mongooseIntegration` from `@sentry/node` for MongoDB query tracing
- Add request body + user PII filtering via `beforeSend`
- Add `tracesSampleRate` and `sendDefaultPii: false` defaults

### 3.2 Add `apps/backend/src/utils/sentryTags.ts` (NEW)

Helper to set Sentry tags from request context (batchId, userId, route) for easier filtering in the dashboard.

### 3.3 Wire Sentry request middleware in `bootstrap/app.ts`

Add `Sentry.Handlers.requestHandler()` and `Sentry.Handlers.tracingHandler()` between `registerMiddleware` and `registerRoutes` so all requests get traced.

### 3.4 Wire Sentry error handler in `bootstrap/app.ts`

Replace the `app.use((err, req, res, next) => {...})` block with `Sentry.Handlers.errorHandler()` first, then the existing logger.

### 3.5 Auto-set tags on every request

In `bootstrap/app.ts`, add a middleware that sets `Sentry.setTag('batchId', req.batchId)` etc. from the requestContext.

## Step 4: Frontend changes (apps/frontend)

### 4.1 Install Sentry React SDK

```bash
cd apps/frontend
pnpm add @sentry/react
```

### 4.2 Create `apps/frontend/src/sentry.ts` (NEW)

Init Sentry with `BrowserTracing`, `Replay`, React-specific integrations. Read from `VITE_SENTRY_DSN`.

```ts
import * as Sentry from '@sentry/react';

export const initSentry = () => {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENV ?? 'development',
    release: import.meta.env.VITE_SENTRY_RELEASE,
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    sendDefaultPii: false,
    beforeSend(event) {
      // Strip Authorization header + PII
      if (event.request?.headers) {
        delete (event.request.headers as Record<string, unknown>)['authorization'];
        delete (event.request.headers as Record<string, unknown>)['Authorization'];
      }
      return event;
    },
  });
};
```

### 4.3 Wire Sentry into `apps/frontend/src/main.tsx`

Call `initSentry()` at the very top of `main.tsx`, before any other imports run.

### 4.4 Add an `ErrorBoundary` for the React app

Sentry has its own — wrap `<App />` in `<Sentry.ErrorBoundary>`. The earlier frontend audit (Phase 9 / Batch 1) added per-route boundaries; Sentry's can be at the root.

## Step 5: Database monitoring

The `@sentry/node` SDK has a built-in `mongooseIntegration` that automatically instruments all Mongoose queries. Once enabled, every query sends a span to Sentry with:
- Collection name
- Operation type (find, updateOne, etc.)
- Query shape
- Duration
- (Optional) result count

This means **no extra code is needed** for database monitoring — just enable the integration in `bootstrap/app.ts`.

For advanced DB-level insights (slow query analytics, query plans, etc.) you'd need Sentry's **Mobile / Backend Insights** features, which require a paid plan. The free tier gives you the trace spans.

## Step 6: Dashboards

After ~1 hour of data flow, go to Sentry → Dashboards → Create Dashboard. Make 3:

### Dashboard 1: Frontend (shamagama-frontend)

- Widget: "Errors by Page" (Top errors grouped by `transaction`)
- Widget: "JS Console Errors" (filter `error.type:js_console`)
- Widget: "Slow Page Loads" (Top p95 by transaction)
- Widget: "Replays" (count of session replays with errors)
- Widget: "Browser Versions with Most Errors"

### Dashboard 2: Backend (shamagama-backend)

- Widget: "Errors by Endpoint" (group by `transaction`)
- Widget: "5xx Response Rate" (filter `transaction.status:5xx`)
- Widget: "Slowest Endpoints" (p95 by transaction)
- Widget: "Unhandled Promise Rejections" (search `unhandledrejection`)
- Widget: "Errors by User" (group by `user.id`)

### Dashboard 3: Database (shamagama-database or filtered)

- Widget: "Slowest Mongoose Operations" (group by `db.operation`)
- Widget: "Most Queried Collections" (group by `db.collection`)
- Widget: "Query Errors" (search `error.type:MongoError`)
- Widget: "p95 Query Duration by Collection"

## Step 7: Alerts (recommended)

Sentry → Alerts → Create Alert Rule:
- "When error count > 50 in 5 min, notify #engineering on Discord"
- "When 5xx rate > 5% in 10 min, page on-call"
- "When a new error type appears, notify #engineering"

## Done

After ~1 hour of running traffic, the 3 dashboards will populate. Tune:
- `tracesSampleRate` — lower if volume is high (free tier has limits)
- `sendDefaultPii: false` — keep this OFF in production
- `replaysSessionSampleRate` — 0.1 is fine; bump to 0.5 if you need more replay coverage

## File checklist (for the implementer)

- [ ] `apps/backend/src/bootstrap/app.ts` — Sentry init with Mongoose integration
- [ ] `apps/backend/src/utils/sentryTags.ts` (NEW) — request context tagger
- [ ] `apps/backend/.env` (or runtime) — DSN + sample rates
- [ ] `apps/frontend/src/sentry.ts` (NEW) — Sentry React init
- [ ] `apps/frontend/src/main.tsx` — call `initSentry()` at top
- [ ] `apps/frontend/.env` — `VITE_SENTRY_DSN` + sample rates
- [ ] Sentry dashboard 1 (frontend) configured
- [ ] Sentry dashboard 2 (backend) configured
- [ ] Sentry dashboard 3 (DB) configured
- [ ] 3 Sentry projects created
- [ ] 3 DSNs copied into envs
- [ ] 3 alert rules set up

## Notes for the implementer

- The codebase already has `@sentry/node` installed. The `@sentry/profiling-node` peer dep is referenced in the doc string but may NOT actually be in `package.json` — check before using `profilingIntegration`. If not, install it.
- For the React SDK, the package is `@sentry/react` (not just `@sentry/browser`) — React-specific.
- The current backend `bootstrap/app.ts:16` already has a config check `config.observability.sentry.enabled` — use the same pattern. Read the config schema to find the field names.
- Vite env vars MUST be prefixed with `VITE_` to be exposed to the client. `SENTRY_DSN` would not work; use `VITE_SENTRY_DSN`.
- The `config.observability.sentry` block in the config schema may have a different shape than my env vars — read the actual schema and adapt.
