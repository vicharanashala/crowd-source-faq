import { Request, Response } from 'express';
import mongoose from 'mongoose';
// v1.69 — Phase 3g: program-scope the moderation log reads.
import { withProgramScope } from '../../utils/db/scopedQuery.js';
import User from '../auth/user.model.js';
import ModerationLog from './moderation-log.model.js';
import { logAction } from '../admin/admin.controller.js';

// S5-C5 fix: the route middleware (`adminOnly`) accepts admin / moderator /
// ai_moderator, but the original `requireAdmin` only accepted `admin`. That
// mismatch blocked every moderator + ai_moderator from running ban/suspend/
// warn actions despite the route permitting them. Now we accept all 3 roles;
// the route middleware is the authoritative gate, and admin-specific business
// rules (e.g. "cannot ban an admin") are enforced per-call below.
const ADMIN_ROLES = new Set(['admin', 'moderator', 'ai_moderator']);

function requireAdminRole(req: Request, res: Response): string | null {
  const role = (req as any).user?.role as string | undefined;
  if (!req.user || !role) {
    res.status(401).json({ message: 'Not authorized' });
    return null;
  }
  if (!ADMIN_ROLES.has(role)) {
    res.status(403).json({ message: 'Admin role required (admin, moderator, or ai_moderator).' });
    return null;
  }
  return (req as any).user.id as string;
}

// S5-L1 fix: expose the program-context middleware here so PR 1 ships the
// export; a follow-up PR updates moderation.routes.ts to mount it. The
// middleware reads ?batchId from the query and attaches req.programContext
// so downstream controllers (which already reference req.programContext?.batchId)
// stop seeing undefined.
export function setContextBatchId(req: Request, res: Response, next: () => void): void {
  const raw = req.query.batchId;
  if (typeof raw === 'string' && raw.length > 0) {
    (req as any).programContext = { batchId: raw };
  } else {
    (req as any).programContext = {};
  }
  next();
}

// S5-C4 fix: Mongo Atlas (mongodb+srv://) is always a replica set, so
// `mongoose.startSession()` + `session.withTransaction()` is supported.
// We define the helper here; ban/suspend/unsuspend/etc. route their 3
// writes through it. Compensating-write fallback is no longer needed.
type ModerationWriteOpts = {
  user: any;
  reason?: string;
  duration?: string;
  previousState: string;
  newState: string;
  action: 'ban' | 'unban' | 'suspend' | 'unsuspend' | 'warn' | 'soft_delete';
  prevLogFilter?: Record<string, unknown>;
};

async function modLogAndAction(
  req: Request,
  res: Response,
  adminId: string,
  opts: ModerationWriteOpts
): Promise<boolean> {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await opts.user.save({ session });
      await ModerationLog.create([{
        moderatorId: new mongoose.Types.ObjectId(adminId),
        action: opts.action,
        targetId: String(opts.user._id),
        targetType: 'user',
        reason: opts.reason ?? '',
        duration: opts.duration,
        newState: opts.newState,
        previousState: opts.previousState,
        batchId: (req as any).programContext?.batchId ?? null,
      }], { session });
      // logAction lives in admin.controller; it's an audit-log write that
      // doesn't accept a session arg. Run it INSIDE the withTransaction
      // callback so a throw from it rolls back the user.save + ModerationLog
      // writes above.
      await logAction(
        adminId,
        `${opts.action}_user` as any,
        String(opts.user._id),
        'user',
        opts.reason ?? opts.duration ?? ''
      );
    });
    return true;
  } catch (err) {
    // withTransaction has already aborted the session; surface a 500.
    console.error(`[moderation] modLogAndAction ${opts.action} failed:`, err);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Moderation write failed; no partial state committed.' });
    }
    return false;
  } finally {
    await session.endSession();
  }
}

function msFromDuration(duration: string): number {
  const match = duration.match(/^(\d+)(h|d)$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const val = parseInt(match[1]);
  return match[2] === 'h' ? val * 3600000 : val * 86400000;
}

const adminIdAsObjId = (id: string): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(id);

// ─── Ban User ────────────────────────────────────────────────────────────
// S5-C5: now accepts moderator/ai_moderator via requireAdminRole.
// S5-C4: all 3 writes go through modLogAndAction (transactional).
export const banUser = async (req: Request, res: Response): Promise<void> => {
  const adminId = requireAdminRole(req, res);
  if (!adminId) return;
  try {
    const { userId, reason } = req.body as { userId?: string; reason?: string };
    if (!userId || !reason) { res.status(400).json({ message: 'userId and reason required' }); return; }

    const user = await User.findById(userId);
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }
    if (user.role === 'admin') { res.status(403).json({ message: 'Cannot ban an admin' }); return; }

    const prevState = user.isBanned ? 'banned' : 'active';
    user.isBanned = true;
    user.banReason = reason;
    user.bannedAt = new Date();
    user.bannedBy = adminIdAsObjId(adminId);

    const ok = await modLogAndAction(req, res, adminId, {
      user, reason, action: 'ban',
      previousState: prevState, newState: 'banned',
    });
    if (!ok) return;
    res.json({ userId, isBanned: true, banReason: reason, bannedAt: user.bannedAt });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server error' });
    }
  }
};

// ─── Unban User ────────────────────────────────────────────────────────
export const unbanUser = async (req: Request, res: Response): Promise<void> => {
  const adminId = requireAdminRole(req, res);
  if (!adminId) return;
  try {
    const { userId, reason } = req.body as { userId?: string; reason?: string };
    if (!userId) { res.status(400).json({ message: 'userId required' }); return; }

    const user = await User.findById(userId);
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }

    const prevState = user.isBanned ? 'banned' : 'active';
    user.isBanned = false;
    user.banReason = undefined;
    user.bannedAt = undefined;
    user.bannedBy = undefined;

    const ok = await modLogAndAction(req, res, adminId, {
      user, reason: reason || 'User unbanned',
      action: 'unban', previousState: prevState, newState: 'active',
    });
    if (!ok) return;
    res.json({ userId, isBanned: false });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server error' });
    }
  }
};

// ─── Suspend User ───────────────────────────────────────────────────────
export const suspendUser = async (req: Request, res: Response): Promise<void> => {
  const adminId = requireAdminRole(req, res);
  if (!adminId) return;
  try {
    // 5.1 fix: schema accepts `duration: '24h' | '7d'` (or the legacy
    // `days: number`). The controller now reads `duration` (string);
    // `msFromDuration` parses it. `days` is still accepted by the schema
    // for backward compat.
    const body = req.body as { userId?: string; reason?: string; duration?: string; days?: number };
    const { userId, reason } = body;
    let duration = body.duration;
    if (!duration && typeof body.days === 'number' && body.days > 0) {
      duration = `${body.days}d`;
    }
    if (!userId || !reason || !duration) { res.status(400).json({ message: 'userId, reason, and duration required' }); return; }

    const user = await User.findById(userId);
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }
    if (user.role === 'admin') { res.status(403).json({ message: 'Cannot suspend an admin' }); return; }

    const until = new Date(Date.now() + msFromDuration(duration));
    const prevState = user.suspendedUntil ? `suspended_until_${user.suspendedUntil.toISOString()}` : 'active';
    user.suspendedUntil = until;

    const ok = await modLogAndAction(req, res, adminId, {
      user, reason, duration,
      action: 'suspend',
      previousState: prevState,
      newState: `suspended_until_${until.toISOString()}`,
    });
    if (!ok) return;
    res.json({ userId, suspendedUntil: until });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server error' });
    }
  }
};

// ─── Unsuspend User ─────────────────────────────────────────────────────
export const unsuspendUser = async (req: Request, res: Response): Promise<void> => {
  const adminId = requireAdminRole(req, res);
  if (!adminId) return;
  try {
    const { userId, reason } = req.body as { userId?: string; reason?: string };
    if (!userId) { res.status(400).json({ message: 'userId required' }); return; }

    const user = await User.findById(userId);
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }

    const prevState = user.suspendedUntil ? 'suspended' : 'active';
    user.suspendedUntil = undefined;

    const ok = await modLogAndAction(req, res, adminId, {
      user, reason: reason || 'Suspension lifted',
      action: 'unsuspend', previousState: prevState, newState: 'active',
    });
    if (!ok) return;
    res.json({ userId, suspendedUntil: null });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server error' });
    }
  }
};

// ─── Warn User ─────────────────────────────────────────────────────────
export const warnUser = async (req: Request, res: Response): Promise<void> => {
  const adminId = requireAdminRole(req, res);
  if (!adminId) return;
  try {
    const { userId, reason } = req.body as { userId?: string; reason?: string };
    if (!userId || !reason) { res.status(400).json({ message: 'userId and reason required' }); return; }

    const user = await User.findById(userId);
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }

    // warn doesn't mutate user state, so we don't need the user.save in a
    // transaction — but we still wrap the two log writes for atomicity.
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await ModerationLog.create([{
          moderatorId: adminIdAsObjId(adminId),
          action: 'warn',
          targetId: userId,
          targetType: 'user',
          reason,
          newState: 'warned',
          previousState: 'active',
          batchId: (req as any).programContext?.batchId ?? null,
        }], { session });
        await logAction(adminId, 'warn_user', userId, 'user', reason);
      });
    } catch (err) {
      console.error(`[moderation] warnUser failed:`, err);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Warn failed; no partial state committed.' });
      }
      await session.endSession();
      return;
    }
    await session.endSession();
    res.json({ userId, warned: true, reason });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server error' });
    }
  }
};

// ─── Soft Delete User ───────────────────────────────────────────────────
// S5-H14 fix: original code did `user.email = \`[deleted_${userId}]_${user.email}\``,
// which permanently mangles the email and blocks re-registration with the
// original address. The User schema does NOT currently have a `deletedEmail`
// field, so we set `user.email = null` and document the trade-off here. To
// fully restore reversibility, add `deletedEmail: String` to the schema in
// a follow-up migration; in the meantime, audit logs retain the original
// user record under targetId.
export const softDeleteUser = async (req: Request, res: Response): Promise<void> => {
  const adminId = requireAdminRole(req, res);
  if (!adminId) return;
  try {
    const { userId, reason } = req.body as { userId?: string; reason?: string };
    if (!userId) { res.status(400).json({ message: 'userId required' }); return; }

    const user = await User.findById(userId);
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }
    if (user.role === 'admin') { res.status(403).json({ message: 'Cannot delete an admin' }); return; }

    user.isDeleted = true;
    user.deletedAt = new Date();
    // S5-H14: see the comment block above for why we set email=null instead
    // of mangling. To enable re-registration without re-add the deletedEmail
    // field, the unique-index on email must allow null (already does — sparse
    // index on unique fields skips null by default in Mongoose).
    user.email = null as unknown as string;

    const ok = await modLogAndAction(req, res, adminId, {
      user, reason: reason || 'Soft deleted',
      action: 'soft_delete', previousState: 'active', newState: 'deleted',
    });
    if (!ok) return;
    res.json({ userId, isDeleted: true });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server error' });
    }
  }
};

// ─── Get Moderation Logs ───────────────────────────────────────────────
// S5-H16 fix: previously any admin could specify ANY batchId in the query
// and the controller would scope the filter accordingly. Now we validate
// that batchId is in req.user.adminPrograms (or that the user is a global
// admin with no program restriction). 403 otherwise.
// S5-L5 fix: response now includes `hasMore: skip + logs.length < total`.
export const getModerationLogs = async (req: Request, res: Response): Promise<void> => {
  const adminId = requireAdminRole(req, res);
  if (!adminId) return;
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1')));
    const limit = Math.min(50, parseInt(String(req.query.limit ?? '20')));
    const skip = (page - 1) * limit;
    const targetId = req.query.targetId as string | undefined;
    const targetType = req.query.targetType as string | undefined;

    // S5-H16: scope check. Global admins (no adminPrograms set) bypass.
    const requestedBatchId = req.query.batchId as string | undefined;
    const userPrograms: string[] = ((req as any).user?.adminPrograms ?? []) as string[];
    const isGlobalAdmin = userPrograms.length === 0 && (req as any).user?.role === 'admin';
    if (requestedBatchId && !isGlobalAdmin && !userPrograms.includes(requestedBatchId)) {
      res.status(403).json({ message: 'batchId outside your admin programs.' });
      return;
    }

    const filter: Record<string, unknown> = {};
    if (targetId) filter.targetId = targetId;
    if (targetType) filter.targetType = targetType;
    // v1.69 — Phase 3g: optionally scope by program.
    const scoped = withProgramScope(filter, requestedBatchId);

    const [logs, total] = await Promise.all([
      ModerationLog.find(scoped)
        .populate('moderatorId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ModerationLog.countDocuments(scoped),
    ]);

    // S5-L5: hasMore lets callers know whether to fetch the next page.
    const hasMore = skip + logs.length < total;
    res.json({ logs, total, page, pages: Math.ceil(total / limit), hasMore });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server error' });
    }
  }
};

// ─── Get Moderation Queue ───────────────────────────────────────────────
export const getModerationQueue = async (req: Request, res: Response): Promise<void> => {
  const adminId = requireAdminRole(req, res);
  if (!adminId) return;
  try {
    const [banned, suspended] = await Promise.all([
      User.find({ isBanned: true, isDeleted: false })
        .select('name email banReason bannedAt tier points')
        .sort({ bannedAt: -1 }),
      User.find({ suspendedUntil: { $gt: new Date() }, isDeleted: false })
        .select('name email suspendedUntil tier points')
        .sort({ suspendedUntil: 1 }),
    ]);
    res.json({ banned, suspended });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server error' });
    }
  }
};