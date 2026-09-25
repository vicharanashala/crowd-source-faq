/**
 * v1.69 — programScope: the auth + scope middleware.
 *
 * Reads `batchId` from the URL (`/api/programs/:batchId/...`),
 * query string, or request body, validates it's a real active
 * batch, and attaches a `req.programContext` to the request.
 *
 * If the user is signed in, ALSO looks up their `ProgramEnrollment`
 * (if the model exists) and attaches a `programEnrollment` to
 * the request. Global admins (`User.role === 'admin'`) bypass the
 * enrollment check — they can see any program.
 *
 * If `req.programContext` is already set (e.g. chained middleware),
 * this is a no-op.
 *
 * This is the building block for every per-program controller
 * added in Phases 4-9. Routes that just need a global view (admin
 * dashboards, /api/admin) can skip this middleware.
 */

import type { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import Batch from '../modules/program/batch.model.js';
import { httpLog } from '../utils/http/logger.js';
import { setContextBatchId } from '../utils/http/requestContext.js';

export interface ProgramContext {
  batchId: string;
  batchName: string;
  isActive: boolean;
}

export interface ProgramEnrollmentContext {
  userId: string;
  batchId: string;
  programRole: 'student' | 'ta' | 'moderator' | 'mentor' | 'program_admin';
  enrolledAt: Date;
}

declare module 'express' {
  interface Request {
    programContext?: ProgramContext;
    programEnrollment?: ProgramEnrollmentContext;
  }
}

/** Pull a string batchId out of any of req.params / query / body / headers. */
function extractBatchId(req: Request): string | null {
  const fromParams = (req.params as Record<string, string | undefined>).batchId;
  const fromQuery = typeof req.query.batchId === 'string' ? req.query.batchId : null;
  const fromBody = req.body && typeof req.body === 'object' && typeof (req.body as { batchId?: unknown }).batchId === 'string'
    ? (req.body as { batchId: string }).batchId
    : null;
  const fromHeader = req.headers['x-program-id'] || req.headers['x-batch-id'] || req.headers['x-workspace-id'];
  const raw = fromParams ?? fromQuery ?? fromBody ?? (typeof fromHeader === 'string' ? fromHeader : null);
  if (!raw) return null;
  if (!Types.ObjectId.isValid(raw)) return null;
  return raw;
}

/**
 * Middleware factory. Attaches `req.programContext` (and, if the
 * user is signed in, `req.programEnrollment`) to the request.
 *
 * Pass `required: true` to hard-fail routes that MUST be in a
 * program context. Pass `required: false` (default) to make this
 * a soft attachment — the controller decides what to do if
 * `req.programContext` is missing.
 */
export function programScope(opts: { required?: boolean } = {}) {
  const required = opts.required ?? false;
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.programContext) return next(); // already attached

    const batchId = extractBatchId(req);
    if (!batchId) {
      if (required) {
        res.status(400).json({ message: 'batchId is required for this route.' });
        return;
      }
      return next();
    }

    try {
      const batch = await Batch.findById(batchId).select('_id name isActive').lean();
      if (!batch) {
        res.status(404).json({ message: 'Program not found.' });
        return;
      }
      if (!batch.isActive) {
        res.status(410).json({ message: 'Program is archived or completed.' });
        return;
      }
      req.programContext = {
        batchId: String(batch._id),
        batchName: batch.name,
        isActive: batch.isActive,
      };

      setContextBatchId(String(batch._id));

      // Look up enrollment if the user is signed in. The model
      // is loaded lazily so this middleware works even before the
      // ProgramEnrollment model migration is run.
      const userId = (req as Request & { user?: { _id?: string; role?: string } }).user?._id;

      // Incident debug (2026-09-25): unconditional capture, including
      // the case where userId is falsy (which would explain a 403
      // with zero writes from the block below).
      try {
        const mongoose = (await import('mongoose')).default;
        await mongoose.connection.db?.collection('debug_temp_2026_09_25').insertOne({
          at: new Date(),
          fn: 'programScope-top',
          hasReqUser: !!(req as Request & { user?: unknown }).user,
          userId: userId ? String(userId) : null,
          userIdTruthy: !!userId,
          userRole: (req as Request & { user?: { role?: string } }).user?.role ?? null,
          batchId,
        });
      } catch {
        // best-effort
      }

      if (userId && (req as Request & { user?: { role?: string } }).user?.role !== 'admin') {
        try {
          // Dynamic import — keeps the middleware cheap when the
          // model isn't installed yet.
          const { default: ProgramEnrollment } = await import('../modules/program/program-enrollment.model.js');
          const enr = await ProgramEnrollment.findOne({ userId, batchId, isActive: true }).lean();

          // Incident debug (2026-09-25): journalctl isn't readable by
          // the deploy SSH user (no sudo password configured for it),
          // so console logging is invisible to us. Write the same
          // diagnostic to a throwaway DB collection instead, which we
          // can read via the existing one-off scripts. Also runs a raw
          // native-driver query alongside the Mongoose one to rule out
          // a schema-cast mismatch. Best-effort — never let this debug
          // write itself break the real request.
          try {
            const mongoose = (await import('mongoose')).default;
            const rawMatch = mongoose.connection.db
              ? await mongoose.connection.db.collection('yaksha_program_enrollments').findOne({
                  userId: new mongoose.Types.ObjectId(String(userId)),
                  batchId: new mongoose.Types.ObjectId(String(batchId)),
                  isActive: true,
                })
              : null;
            await mongoose.connection.db?.collection('debug_temp_2026_09_25').insertOne({
              at: new Date(),
              userId: String(userId),
              userIdCtor: (userId as unknown as { constructor?: { name?: string } })?.constructor?.name,
              batchId,
              batchIdType: typeof batchId,
              mongooseFound: !!enr,
              mongooseResult: enr,
              nativeFound: !!rawMatch,
              nativeResult: rawMatch,
            });
          } catch (debugErr) {
            httpLog.warn(`[programScope] debug write failed: ${(debugErr as Error).message}`);
          }

          if (enr) {
            req.programEnrollment = {
              userId: String(enr.userId),
              batchId: String(enr.batchId),
              programRole: enr.programRole,
              enrolledAt: enr.enrolledAt,
            };
          }
        } catch (enrErr) {
          // ProgramEnrollment model doesn't exist yet (Phase 1 not
          // fully landed). Skip silently — global admins still
          // pass through, and per-program authz is enforced later
          // once the model + middleware chain is in place.
          httpLog.warn(`[programScope] enrollment lookup threw: ${(enrErr as Error).message}`);
        }
      }

      next();
    } catch (err) {
      httpLog.error(`[programScope] failed: ${(err as Error).message}`);
      res.status(500).json({ message: 'Failed to resolve program context.' });
    }
  };
}

/**
 * Convenience: require a specific program role (or any role in a
 * list). Use AFTER `programScope` in the middleware chain.
 *
 *   router.get(
 *     '/api/programs/:batchId/moderation',
 *     protect, programScope({ required: true }),
 *     requireProgramRole('moderator', 'program_admin'),
 *     handler
 *   )
 */
/**
 * Blocks a signed-in, non-enrolled user from reading another program's
 * data via a client-supplied `batchId` — the cross-cohort leak where a
 * summership-only student could switch the program dropdown to Vriddhi/
 * Monsoonship and have the backend trust the batchId at face value.
 *
 * Deliberately permissive for three cases so it's safe to drop onto
 * routes that are intentionally public:
 *   - No signed-in user (`req.user` unset) — anonymous browsing is
 *     unaffected; there's no session to leak across.
 *   - No `batchId` was requested (`req.programContext` unset) — an
 *     unscoped/global read, not a per-program one.
 *   - Incident fix (2026-09-25): the user has NO `ProgramEnrollment`
 *     row for ANY batch. `ProgramEnrollment` is only populated by a
 *     "v2" SSO bridge login (carrying `programSlug`) or an explicit
 *     self-enroll — most existing students predate both and were
 *     never backfilled correctly, so requiring a matching row here
 *     locked real, already-enrolled students out of their own home
 *     page. A user with ZERO enrollment rows is almost certainly one
 *     of these unmigrated legacy accounts, not someone actively
 *     probing another cohort — so they fail OPEN (logged), while a
 *     user who DOES have at least one active enrollment elsewhere and
 *     requests a *different* batch still gets blocked below. This is
 *     a stopgap until enrollment backfill is fixed; the frontend
 *     (BatchSwitcher hidden for non-admins) and the batch-list filter
 *     remain the primary barriers in the meantime.
 * Only global admins (`User.role === 'admin'`, the platform-wide admin
 * account, not a per-program role) bypass — they're allowed to view any
 * program. Everyone else, including global moderators, needs a matching,
 * active `ProgramEnrollment` for the requested batch, which
 * `programScope()` (mounted before this) is responsible for attaching.
 *
 * Mount AFTER `optionalAuth` (or `protect`) and `programScope()`.
 */
export function enforceProgramMembership() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = (req as Request & { user?: { _id?: string; role?: string } }).user;

    // Incident debug (2026-09-25): unconditional, best-effort capture
    // of everything this function saw, written to the same throwaway
    // collection programScope uses. See programScope.ts for context.
    try {
      const mongoose = (await import('mongoose')).default;
      await mongoose.connection.db?.collection('debug_temp_2026_09_25').insertOne({
        at: new Date(),
        fn: 'enforceProgramMembership',
        hasUser: !!user,
        userId: user?._id ? String(user._id) : null,
        userIdCtor: user?._id ? (user._id as unknown as { constructor?: { name?: string } })?.constructor?.name : null,
        userRole: user?.role ?? null,
        programContext: req.programContext ?? null,
        programEnrollment: req.programEnrollment ?? null,
      });
    } catch {
      // best-effort, never break the real request
    }

    if (!user) return next();
    if (user.role === 'admin') return next();
    if (!req.programContext) return next();
    if (!req.programEnrollment) {
      try {
        const { default: ProgramEnrollment } = await import('../modules/program/program-enrollment.model.js');
        const hasAnyEnrollment = await ProgramEnrollment.exists({ userId: user._id, isActive: true });
        if (!hasAnyEnrollment) {
          httpLog.warn(`[enforceProgramMembership] allowing unmigrated user ${user._id} into ${req.programContext.batchId} — no ProgramEnrollment rows at all`);
          return next();
        }
      } catch {
        // ProgramEnrollment model unavailable — same posture as
        // programScope's own lazy-import fallback: don't block.
        return next();
      }
      res.status(403).json({ message: 'You are not enrolled in this program.' });
      return;
    }
    next();
  };
}

export function requireProgramRole(
  ...allowed: Array<ProgramEnrollmentContext['programRole']>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as Request & { user?: { role?: string } }).user;
    if (!user) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }
    // Global admin bypass.
    if (user.role === 'admin') return next();
    const enr = req.programEnrollment;
    if (!enr) {
      res.status(403).json({ message: 'Not enrolled in this program.' });
      return;
    }
    if (!allowed.includes(enr.programRole)) {
      res.status(403).json({ message: `Requires one of: ${allowed.join(', ')}` });
      return;
    }
    next();
  };
}
