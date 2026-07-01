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
      if (userId && (req as Request & { user?: { role?: string } }).user?.role !== 'admin') {
        try {
          // Dynamic import — keeps the middleware cheap when the
          // model isn't installed yet.
          const { default: ProgramEnrollment } = await import('../modules/program/program-enrollment.model.js');
          const enr = await ProgramEnrollment.findOne({ userId, batchId, isActive: true }).lean();
          if (enr) {
            req.programEnrollment = {
              userId: String(enr.userId),
              batchId: String(enr.batchId),
              programRole: enr.programRole,
              enrolledAt: enr.enrolledAt,
            };
          }
        } catch {
          // ProgramEnrollment model doesn't exist yet (Phase 1 not
          // fully landed). Skip silently — global admins still
          // pass through, and per-program authz is enforced later
          // once the model + middleware chain is in place.
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
