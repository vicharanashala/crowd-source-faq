/**
 * instrument.ts — Sentry initialization entry point.
 *
 * IMPORTANT: This file MUST be imported BEFORE any other application code,
 * ideally via `tsx --import ./src/instrument.ts src/server.ts`. This ensures
 * Sentry's auto-instrumentation patches Express + Mongoose before they're
 * imported by the rest of the app. Initializing Sentry inline in bootstrap/app.ts
 * (the previous pattern) caused the v10 SDK to log "express is not instrumented"
 * because route registration happened before the patch was applied.
 *
 * Env loading: this file ALSO loads dotenv before reading SENTRY_* vars.
 * Why: tsx --import runs instrument.ts *before* server.ts's own imports, so
 * if we relied on server.ts's `import './env.js'` (dotenv) the Sentry DSN
 * would be empty here. That was a real bug — Sentry.init() would silently
 * no-op with no DSN and no debug logs. Loading dotenv here fixes the order.
 *
 * Single Sentry client (SENTRY_DSN):
 *   - Captures HTTP errors (via setupExpressErrorHandler in bootstrap/app.ts),
 *     request spans (expressIntegration), Mongoose spans (mongooseIntegration),
 *     unhandled rejections, and logger.error/alert calls.
 *   - SENTRY_DB_DSN is kept as a fallback only (used when SENTRY_DSN is unset).
 *     Routing DB spans to a separate Sentry project requires multiple Client
 *     instances, which Sentry SDK v10 doesn't support cleanly — single project
 *     + "db" tag filter in the dashboard is the recommended approach.
 *
 * PII is filtered via beforeSend + beforeSendTransaction. sendDefaultPii:false
 * keeps IP + user-agent out of events by default.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env FIRST so the Sentry env vars below are populated. Mirrors the
// dotenv config in src/env.ts so behaviour is identical regardless of entry
// point (server.ts, scripts, tests).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import * as Sentry from '@sentry/node';
import { expressIntegration, mongooseIntegration } from '@sentry/node';

const sentryEnabled = process.env.SENTRY_ENABLED !== 'false'; // default on
const sentryDsn = process.env.SENTRY_DSN || process.env.SENTRY_DB_DSN;
const sentryEnv = process.env.SENTRY_ENV || process.env.NODE_ENV || 'development';
const sentryRelease = process.env.SENTRY_RELEASE;
const sentryDebug = process.env.SENTRY_DEBUG === 'true';
const tracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1');

/** Strip PII from outgoing Sentry events. */
function sentryBeforeSend(event: Sentry.ErrorEvent, _hint: Sentry.EventHint): Sentry.ErrorEvent | null {
  if (event.request) {
    if (event.request.headers) {
      const headers = event.request.headers as Record<string, unknown>;
      delete headers['authorization'];
      delete headers['Authorization'];
      delete headers['cookie'];
      delete headers['Cookie'];
    }
    if (event.request.data) delete event.request.data;
    if (event.request.cookies) delete event.request.cookies;
  }
  return event;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sentryBeforeSendTransaction(event: any, _hint: Sentry.EventHint): any {
  if (event.request) {
    if (event.request.headers) {
      const headers = event.request.headers as Record<string, unknown>;
      delete headers['authorization'];
      delete headers['Authorization'];
      delete headers['cookie'];
      delete headers['Cookie'];
    }
    if (event.request.data) delete event.request.data;
    if (event.request.cookies) delete event.request.cookies;
  }
  return event;
}

if (sentryEnabled && sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: sentryEnv,
    release: sentryRelease,
    debug: sentryDebug,
    sendDefaultPii: false,
    tracesSampleRate,
    integrations: [
      expressIntegration(),
      mongooseIntegration(),
    ],
    beforeSend: sentryBeforeSend,
    beforeSendTransaction: sentryBeforeSendTransaction,
  });
}