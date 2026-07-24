/**
 * sentryTags.ts
 *
 * Express middleware that decorates the current Sentry scope with tags and
 * user context pulled from the in-flight request. Installed once after the
 * shared middleware stack so that batchId (set by programScope) and userId
 * (set by auth) are available by the time Sentry captures an event or span.
 *
 * Tags surfaced to Sentry:
 *  - batchId    — current program/batch (set by programScope middleware)
 *  - userId     — authenticated user (set by auth middleware)
 *  - route      — normalized request path (e.g. /csfaq/api/faqs/:id)
 *  - method     — HTTP verb
 *  - requestId  — UUID v4 from middleware (matches X-Request-ID header)
 *  - userRole   — role if present on req.user.role
 *
 * User context:
 *  - Sentry.setUser({ id: userId })  — only when authenticated, no PII.
 *
 * Both Sentry.captureException() and the auto-instrumented spans pick these
 * up automatically — no extra plumbing needed at the call site.
 */
import type { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';
import type { ProgramContext } from '../middleware/programScope.js';

// Module augmentation: adds typed fields to Express's Request without
// conflicting with the existing `req.user: IUser` shape declared elsewhere
// (user.model.ts). We only touch `id` and `programContext` here — the
// `user` augmentation lives in the auth middleware that actually populates it.
declare module 'express-serve-static-core' {
  interface Request {
    id?: string;
    programContext?: ProgramContext;
  }
}

export function sentryRequestTagsMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  // Pull from request-context AsyncLocalStorage (set by registerMiddleware)
  // and from the explicit req fields populated by auth/programScope.
  // Cast through unknown for the user fields — IUser is a heavy Mongoose
  // Document and we only need optional scalar fields here.
  const userId = req.user?.id as string | undefined;
  const batchId = req.programContext?.batchId;
  const userRole = (req.user as unknown as { role?: string } | undefined)?.role;

  // Tags — cheap to set repeatedly, Sentry dedupes per event.
  Sentry.setTag('route', req.route?.path ?? req.path);
  Sentry.setTag('method', req.method);
  if (req.id) Sentry.setTag('requestId', req.id);
  if (batchId) Sentry.setTag('batchId', batchId);
  if (userRole) Sentry.setTag('userRole', userRole);

  // User identity — only the id, no email/name/role (PII safety).
  if (userId) {
    Sentry.setUser({ id: userId });
  } else {
    // Anonymous request — clear any stale user from a previous request in
    // this scope. Sentry reuses the hub across requests in dev mode if you
    // don't reset it.
    Sentry.setUser(null);
  }

  next();
}