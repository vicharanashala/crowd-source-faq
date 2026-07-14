/**
 * supportGoldenController.ts — Golden Ticket admin actions
 * (v1.65, additive).
 *
 * Routes (from routes/support.ts):
 *   POST   /api/admin/support/requests/:id/convert-to-golden   (admin)
 *   POST   /api/admin/support/requests/:id/unconvert-golden   (admin)
 *   POST   /api/admin/support/users/:userId/award-sp          (admin)
 *   GET    /api/support/me/sp                                  (any authed user)
 *
 * Every handler is a thin wrapper around the SP helpers in
 * promotionService.ts and the lifecycle transitions in
 * supportCore.ts. No existing controller was touched — the new
 * routes register under a fresh `supportGolden*` export surface.
 *
 * Backward-compat: the underlying SupportRequest and User schemas
 * already grew the additive Golden fields in v1.65; legacy tickets
 * (and legacy users) read as non-Golden / sp=0 through the
 * `isGoldenTicket()` / `user.sp ?? 0` guards. No data migration is
 * needed.
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import SupportRequest from './support-request.model.js';
import {
  getAuthedUserId,
  getAuthedUserRole,
  stripAdminOnlyFields,
  logAdminAction,
  notifyUser,
  isGoldenTicket,
  requireFeatureOn,
  escapeRegex,
} from './support-core.controller.js';
import { awardSpurtiPoints, spendSpurtiPoints, refundSpurtiPoints } from '../program/promotion.service.js';
// L1 fix (v1.68): use the named `adminLog` for admin-action
// error logging so it carries the [admin] category tag. The
// `getMySpurtiPoints` error path is a user-self read — `authLog`
// fits there.
import { adminLog, authLog } from '../../utils/http/logger.js';

function asStringParam(v: any): string | undefined {
  if (Array.isArray(v)) return typeof v[0] === 'string' ? v[0] : undefined;
  if (typeof v === 'string') return v;
  return undefined;
}

function requireAdmin(req: Request, res: Response): { userId: Types.ObjectId } | null {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Authentication required.' });
    return null;
  }
  const role = getAuthedUserRole(req);
  if (role !== 'admin' && role !== 'moderator') {
    res.status(403).json({ message: 'Admin only.' });
    return null;
  }
  return { userId };
}

// ─── Convert existing ticket to Golden (admin) ───────────────────────────

/**
 * POST /api/admin/support/requests/:id/convert-to-golden
 *
 * Body: { spCost?: number, note?: string }
 *
 * Marks the ticket Golden and records provenance. If `spCost` is
 * provided and > 0, the SP is debited from the user's wallet
 * (spendSpurtiPoints). The SP helpers throw on insufficient balance,
 * so a 402-ish failure surfaces here as 400.
 *
 * Idempotent: converting an already-Golden ticket is a no-op (returns
 * the existing ticket). This lets admin UIs wire the "Convert" button
 * without tracking client-side state.
 */
export async function convertToGolden(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req, res);
  if (!auth) return;

  const id = asStringParam(req.params.id);
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid request id.' });
    return;
  }

  const body = (req.body ?? {}) as { spCost?: number; note?: string };
  const spCost = Number.isFinite(body.spCost) ? Math.max(0, Math.trunc(Number(body.spCost))) : 0;
  const note = String(body.note || '').trim().slice(0, 2000);

  try {
    const request = await SupportRequest.findById(id);
    if (!request) {
      res.status(404).json({ message: 'Support request not found.' });
      return;
    }

    // Idempotent: already Golden — return as-is.
    if (isGoldenTicket(request)) {
      res.json({ request: stripAdminOnlyFields(request.toObject(), true) });
      return;
    }

    const { default: User } = await import('../auth/user.model.js');
    const admin = await User.findById(auth.userId).select('name').lean();
    if (!admin) {
      res.status(401).json({ message: 'Admin not found.' });
      return;
    }

    // Debit SP if a cost was specified. The helper throws on
    // insufficient balance — we catch and surface as 400 so admins
    // get a clear "wallet too low" message instead of a 500.
    if (spCost > 0) {
      try {
        await spendSpurtiPoints(
          request.userId.toString(),
          spCost,
          `Golden Ticket conversion by admin ${admin.name}`,
          request._id,
        );
      } catch (spErr) {
        res.status(400).json({
          message: (spErr as Error).message || 'Insufficient Spurti Points.',
        });
        return;
      }
    }

    const now = new Date();
    const historyEntry = {
      status: request.status,
      note: note || `Promoted to Golden by ${admin.name}${spCost > 0 ? ` (-${spCost} SP)` : ''}.`,
      updatedBy: auth.userId,
      updatedByName: admin.name,
      timestamp: now,
    };
    // v1.68 — H3 fix: was in-memory mutate + save(). Replace
    // with a single atomic findOneAndUpdate so a concurrent
    // convert-to-golden on the same ticket doesn't lose the
    // other's fields via a trailing save() clobbering in-memory
    // state. statusHistory uses \$push (atomic) instead of
    // in-memory .push.
    await SupportRequest.findOneAndUpdate(
      { _id: request._id },
      {
        $set: {
          isGolden: true,
          spCost,
          goldenConvertedAt: now,
          goldenConvertedBy: auth.userId,
          goldenConvertedByName: admin.name,
          updatedAt: now,
        },
        $push: { statusHistory: historyEntry },
      },
      { new: true },
    );

    await logAdminAction(
      auth.userId,
      admin.name,
      'golden_converted',
      request._id,
      `Converted to Golden${spCost > 0 ? ` (SP cost: ${spCost})` : ''}${note ? ` | ${note.slice(0, 100)}` : ''}`,
    );

    // Tell the student their ticket is now Golden-priority.
    await notifyUser(request.userId, {
      title: 'Your support request was promoted to Golden',
      message: spCost > 0
        ? `An admin converted your ticket to a Golden Ticket (${spCost} SP applied). It will be reviewed with priority.`
        : 'An admin converted your ticket to a Golden Ticket. It will be reviewed with priority.',
      link: '/support/' + request._id.toString(),
      metadata: {
        supportRequestId: request._id.toString(),
        issueType: request.issueType,
        status: request.status,
        isGolden: true,
        spCost,
      },
    });

    res.json({ request: stripAdminOnlyFields(request.toObject(), true) });
  } catch (err) {
    adminLog.error('convertToGolden failed', { error: (err as Error).message });
    res.status(500).json({ message: 'Failed to convert ticket to Golden.' });
  }
}

// ─── Roll back a Golden conversion (admin) ─────────────────────────────────

/**
 * POST /api/admin/support/requests/:id/unconvert-golden
 *
 * Reverses convertToGolden. Refunds the SP debit (if any), clears
 * the Golden flag, and stamps the audit trail. Only valid on tickets
 * that are still Golden AND not yet Resolved / closed.
 */
export async function unconverGolden(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req, res);
  if (!auth) return;

  const id = asStringParam(req.params.id);
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid request id.' });
    return;
  }

  const body = (req.body ?? {}) as { note?: string };
  const note = String(body.note || '').trim().slice(0, 2000);

  try {
    const request = await SupportRequest.findById(id);
    if (!request) {
      res.status(404).json({ message: 'Support request not found.' });
      return;
    }
    if (!isGoldenTicket(request)) {
      // Idempotent in the other direction.
      res.json({ request: stripAdminOnlyFields(request.toObject(), true) });
      return;
    }
    if (request.status === 'Resolved' || request.status === 'closed') {
      res.status(409).json({
        message: `Cannot roll back a Golden conversion on a ticket in terminal state '${request.status}'.`,
      });
      return;
    }

    const { default: User } = await import('../auth/user.model.js');
    const admin = await User.findById(auth.userId).select('name').lean();
    if (!admin) {
      res.status(401).json({ message: 'Admin not found.' });
      return;
    }

    if (request.spCost > 0) {
      try {
        await refundSpurtiPoints(
          request.userId.toString(),
          request.spCost,
          `Golden Ticket conversion rolled back by admin ${admin.name}`,
          request._id,
        );
      } catch (spErr) {
        // Refund failed (e.g. user already deleted) — log and continue
        // with the rollback so the ticket state is consistent. The audit
        // trail still records the rollback; an admin can re-credit via
        // /award-sp if needed.
        adminLog.warn('refund failed during rollback', { error: (spErr as Error).message });
      }
    }

    const now = new Date();
    const refundAmount = request.spCost;
    const historyEntry = {
      status: request.status,
      note: note || `Golden conversion rolled back by ${admin.name}${refundAmount > 0 ? ` (${refundAmount} SP refunded)` : ''}.`,
      updatedBy: auth.userId,
      updatedByName: admin.name,
      timestamp: now,
    };
    // v1.68 — H3 fix: same atomic-update pattern as the
    // convertToGolden call above. In-memory mutate + save() is
    // a race waiting to happen; findOneAndUpdate with $set +
    // $push is atomic.
    await SupportRequest.findOneAndUpdate(
      { _id: request._id },
      {
        $set: {
          isGolden: false,
          spCost: 0,
          goldenConvertedAt: null,
          goldenConvertedBy: null,
          goldenConvertedByName: '',
          updatedAt: now,
        },
        $push: { statusHistory: historyEntry },
      },
      { new: true },
    );

    await logAdminAction(
      auth.userId,
      admin.name,
      'golden_unconverted',
      request._id,
      `Rolled back Golden conversion${refundAmount > 0 ? ` (refunded ${refundAmount} SP)` : ''}${note ? ` | ${note.slice(0, 100)}` : ''}`,
    );

    res.json({ request: stripAdminOnlyFields(request.toObject(), true) });
  } catch (err) {
    adminLog.error('unconverGolden failed', { error: (err as Error).message });
    res.status(500).json({ message: 'Failed to roll back Golden conversion.' });
  }
}

// ─── Award Spurti Points to a user (admin) ─────────────────────────────────

/**
 * POST /api/admin/support/users/:userId/award-sp
 *
 * Body: { amount: number, reason: string }
 *
 * Awards `amount` SP to a user (positive = credit, negative = manual
 * admin debit / correction). Logs to ReputationLog via the
 * `sp_awarded` action. The amount must be a non-zero integer.
 */
export async function awardSpurtiPointsAdmin(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req, res);
  if (!auth) return;

  const userId = asStringParam(req.params.userId);
  if (!userId || !Types.ObjectId.isValid(userId)) {
    res.status(400).json({ message: 'Invalid user id.' });
    return;
  }

  const body = (req.body ?? {}) as { amount?: number; reason?: string };
  const amount = Number(body.amount);
  const reason = String(body.reason || '').trim().slice(0, 500);
  if (!Number.isFinite(amount) || amount === 0 || !Number.isInteger(amount)) {
    res.status(400).json({ message: 'amount must be a non-zero integer.' });
    return;
  }
  if (!reason) {
    res.status(400).json({ message: 'reason is required.' });
    return;
  }

  try {
    const { default: User } = await import('../auth/user.model.js');
    const admin = await User.findById(auth.userId).select('name').lean();
    if (!admin) {
      res.status(401).json({ message: 'Admin not found.' });
      return;
    }

    let newBalance: number;
    try {
      const result = await awardSpurtiPoints(
        userId,
        amount,
        'sp_awarded',
        `Admin ${admin.name}: ${reason}`,
        auth.userId,
      );
      newBalance = result.newBalance;
    } catch (spErr) {
      res.status(400).json({
        message: (spErr as Error).message || 'SP adjustment failed.',
      });
      return;
    }

    await logAdminAction(
      auth.userId,
      admin.name,
      amount > 0 ? 'sp_awarded' : 'sp_deducted',
      new Types.ObjectId(userId),
      `SP ${amount > 0 ? '+' : ''}${amount} | ${reason}`,
    );

    res.json({ userId, newBalance });
  } catch (err) {
    adminLog.error('awardSpurtiPointsAdmin failed', { error: (err as Error).message });
    res.status(500).json({ message: 'Failed to adjust Spurti Points.' });
  }
}

// ─── Self-service: read my own Spurti Points ───────────────────────────────

/**
 * GET /api/support/me/sp
 * Returns the authenticated user's current SP balance + their
 * Golden Ticket cooldown + ban status (so the frontend can render
 * the countdown / banned banner without making a second request).
 * Cheap — single indexed read, no joins.
 *
 * v1.65.1 — feature flag check is awaited INSIDE the handler (not
 * on the route) so the response actually reaches the client.
 */
export async function getMySpurtiPoints(req: Request, res: Response): Promise<void> {
  if (!(await requireFeatureOn(req, res, 'goldenTicket'))) return;
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ message: 'Authentication required.' }); return; }

  try {
    const { default: User } = await import('../auth/user.model.js');
    const { readSetting } = await import('../program/app-setting.model.js');
    const [user, cooldownHours] = await Promise.all([
      User.findById(userId).select('sp lastGoldenRejectionAt').lean(),
      readSetting('goldenCooldownHours', 48),
    ]);
    if (!user) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    // v1.65.3 — Cooldown semantics: `User.lastGoldenRejectionAt` stores
    // the END date of the active cooldown (i.e. now + goldenCooldownHours
    // at the time the stamp was set). Stamped on successful Golden
    // submission (not on admin action — that path no longer fires the
    // user-level cooldown). The readers below use the field DIRECTLY as
    // the END date; the previous "+ cooldownHours" math was a 2x bug
    // left over from when the field stored the event timestamp.
    const lastRej = user.lastGoldenRejectionAt as Date | string | null;
    const cooldownEndsAt = lastRej && cooldownHours > 0
      ? new Date(lastRej).toISOString()
      : null;
    const canSubmitGolden = !cooldownEndsAt || new Date(cooldownEndsAt).getTime() <= Date.now();
    res.json({
      sp: user.sp ?? 0,
      cooldownHours,
      cooldownEndsAt: canSubmitGolden ? null : cooldownEndsAt,
      canSubmitGolden,
    });
  } catch (err) {
    authLog.error('getMySpurtiPoints failed', { error: (err as Error).message });
    res.status(500).json({ message: 'Failed to load Spurti Points.' });
  }
}

// ─── Public Escalation Queue (anonymous to non-admins) ─────────────────────
//
// v1.65 — the new Golden Ticket landing page shows a live feed of
// recent Golden tickets so users see what kinds of escalations are
// being made. To protect the requester's identity, regular users see
// the username redacted to 'ANONYMOUS'; admins see the real name
// (since they're already trusted). The list excludes the requester's
// own tickets from their view so the form-submit UX doesn't have the
// user staring at their own card on the right.

/**
 * GET /api/support/golden/queue
 * Query: ?limit=10 (default 10, capped at 50)
 * Public to all authed users. Returns the most recent Golden
 * tickets ordered newest-first. Non-admin callers see the
 * `userName` / `userId` fields redacted to anonymous equivalents.
 *
 * v1.65.1 — feature flag check is awaited INSIDE the handler (not
 * on the route) so the response actually reaches the client.
 */
export async function getGoldenQueue(req: Request, res: Response): Promise<void> {
  if (!(await requireFeatureOn(req, res, 'goldenTicket'))) return;
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ message: 'Authentication required.' }); return; }

  const role = getAuthedUserRole(req);
  const isAdmin = role === 'admin' || role === 'moderator';

  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '10')) || 10));

  try {
    // 1. Determine if the user has an active Golden Ticket and what their position is
    const myActiveTicket = await SupportRequest.findOne({
      isGolden: true,
      status: { $in: ['Pending', 'In Review', 'open'] },
      userId: userId
    }).select('spCost createdAt').lean();

    let myQueuePosition: number | undefined;
    let ticketsAhead: number | undefined;
    let mySpCost: number | undefined;

    if (myActiveTicket) {
      ticketsAhead = await SupportRequest.countDocuments({
        isGolden: true,
        status: { $in: ['Pending', 'In Review', 'open'] },
        $or: [
          { spCost: { $gt: myActiveTicket.spCost } },
          { spCost: myActiveTicket.spCost, createdAt: { $lt: myActiveTicket.createdAt } }
        ]
      });
      myQueuePosition = ticketsAhead + 1;
      mySpCost = myActiveTicket.spCost;
    }

    const filter: Record<string, any> = { 
      isGolden: true,
      status: { $in: ['Pending', 'In Review', 'open'] }
    };
    
    const q = asStringParam(req.query.q);
    if (q) {
      const regex = new RegExp(escapeRegex(q).slice(0, 120), 'i');
      filter.$or = [
        { userName: regex },
        { userEmail: regex },
        { title: regex },
        { details: regex }
      ];
    }

    // 2. Fetch the top `limit` pending Golden Tickets
    const docs = await SupportRequest.find(filter)
      .sort({ spCost: -1, createdAt: 1 })
      .limit(limit)
      .select('userId userName title details spCost status createdAt')
      .lean();

    const items = docs
      .filter((d) => isAdmin || d.userId.toString() !== userId.toString())
      .map((d) => {
        const isOwn = d.userId.toString() === userId.toString();
        return {
          _id: d._id,
          isOwn,
          userName: isOwn ? d.userName : (isAdmin ? d.userName : 'ANONYMOUS'),
          title: d.title,
          details: d.details,
          spCost: d.spCost ?? 0,
          status: d.status,
          createdAt: d.createdAt,
        };
      });

    res.json({ items, myQueuePosition, ticketsAhead, mySpCost });
  } catch (err) {
    adminLog.error('getGoldenQueue failed', { error: (err as Error).message });
    res.status(500).json({ message: 'Failed to load Golden queue.' });
  }
}

// ─── User Golden Ticket history (v1.73, additive) ─────────────────────────
//
// Closes the gap where resolved/rejected Golden tickets vanish from
// the live Escalation Queue and users had no way to revisit the
// admin answer. Surfaces the caller's own past Golden tickets, the
// active ban window (if any), and a chronological activity feed
// reconstructed from each ticket's statusHistory[].

/**
 * GET /api/support/golden/history
 *
 * Returns the caller's OWN Golden tickets (resolved + rejected +
 * in-flight), the active ban window derived from
 * `user.goldenBannedUntil`, and a chronological activity log
 * composed from each ticket's statusHistory entries plus any
 * re-resolve events.
 *
 * Auth: any logged-in user. The `userId` filter is read from
 * `req.user._id`, NEVER from the query string, so a caller cannot
 * request another user's history.
 *
 * Pagination: `?page=&limit=`, defaults to page=1 limit=25, capped
 * at 50.
 *
 * Feature gate: `goldenTicket` (matches `/golden/queue`).
 */
export async function getMyGoldenHistory(req: Request, res: Response): Promise<void> {
  if (!(await requireFeatureOn(req, res, 'goldenTicket'))) return;
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ message: 'Authentication required.' }); return; }

  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1')) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '25')) || 25));
    const skip = (page - 1) * limit;

    // 1. Caller's own Golden tickets (latest first).
    const filter = { userId, isGolden: true };
    const { default: User } = await import('../auth/user.model.js');
    const [total, tickets, callerUser] = await Promise.all([
      SupportRequest.countDocuments(filter),
      SupportRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-__v')
        .lean(),
      User.findById(userId).select('goldenBannedUntil isBanned').lean(),
    ]);

    // 2. Map tickets into the public response shape. Non-admins see
    //    their own real name on their OWN history (no redaction).
    //    goldenResolutions default to [] defensively for legacy rows.
    const history = tickets.map((t) => ({
      _id: t._id.toString(),
      title: t.title,
      details: t.details,
      status: t.status,
      spCost: t.spCost ?? 0,
      userName: t.userName,
      createdAt: t.createdAt,
      resolvedAt: t.resolvedAt ?? null,
      rejectedAt: t.rejectedAt ?? null,
      rejectionReason: t.rejectionReason ?? '',
      goldenResolutions: Array.isArray(t.goldenResolutions) ? t.goldenResolutions : [],
      bannedUntil: callerUser?.goldenBannedUntil ?? null,
      isBanned: callerUser?.isBanned ?? false,
    }));

    // 3. Ban window — derived from User-level goldenBannedUntil
    //    (the canonical source of ban dates). When the user is
    //    inside the window we surface a `banned` array with one
    //    entry carrying the end timestamp + a flag.
    const now = new Date();
    const bannedUntilRaw = callerUser?.goldenBannedUntil;
    const bannedUntil =
      bannedUntilRaw && new Date(bannedUntilRaw).getTime() > now.getTime()
        ? new Date(bannedUntilRaw).toISOString()
        : null;
    const banned = bannedUntil
      ? [
          {
            userId: userId.toString(),
            bannedUntil,
            isActiveBan: true,
            banHours: 72, // matches §5 of the admin spec; constant for now
          },
        ]
      : [];

    // 4. Activity log reconstructed from each ticket's statusHistory.
    //    We emit one event per (raise, resolve, reject, re-resolve)
    //    and sort newest-first so the user gets a single
    //    chronological view of their golden ticket activity.
    const activity: Array<{
      type: 'ticket_raised' | 'resolved' | 'rejected' | 're_resolved';
      ticketId: string;
      title: string;
      at: string;
      status: string;
      details: string;
    }> = [];
    for (const t of tickets) {
      const base = {
        ticketId: t._id.toString(),
        title: t.title,
      };
      // Raise event — one per ticket, sourced from createdAt.
      activity.push({
        ...base,
        type: 'ticket_raised',
        at: new Date(t.createdAt).toISOString(),
        status: 'Pending',
        details: `Submitted as Golden (${t.spCost ?? 0} SP)`,
      });
      if (t.resolvedAt) {
        activity.push({
          ...base,
          type: 'resolved',
          at: new Date(t.resolvedAt).toISOString(),
          status: 'Resolved',
          details: t.resolutionSummary || 'Resolved by admin',
        });
      }
      if (t.rejectedAt) {
        activity.push({
          ...base,
          type: 'rejected',
          at: new Date(t.rejectedAt).toISOString(),
          status: 'Rejected',
          details: t.rejectionReason || 'Rejected by admin',
        });
      }
      // Re-resolve events — one per `goldenResolutions` entry.
      if (Array.isArray(t.goldenResolutions)) {
        for (const r of t.goldenResolutions) {
          activity.push({
            ...base,
            type: 're_resolved',
            at: new Date(r.createdAt).toISOString(),
            status: 'Resolved',
            details: `${r.adminName}: ${String(r.text || '').slice(0, 120)}`,
          });
        }
      }
    }
    activity.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    res.json({
      history,
      banned,
      activity,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    adminLog.error(`getMyGoldenHistory failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load Golden history.' });
  }
}

/**
 * GET /api/support/golden/:id
 *
 * Single Golden ticket scoped to its OWNER (or any admin). Mirrors
 * the authorization shape of `getSupportRequest` in
 * support-requests.controller.ts — a non-admin caller can only
 * fetch their own ticket, and we 404 (not 403) when the ticket
 * belongs to someone else so we don't leak existence.
 *
 * Returns the full ticket including `goldenResolutions[]`. This is
 * the endpoint the in-app bell notification deep-links to when an
 * admin resolves a Golden ticket, so the user lands on a view that
 * actually renders the answer (the regular Session Support thread
 * page does not).
 */
export async function getMyGoldenTicket(req: Request, res: Response): Promise<void> {
  if (!(await requireFeatureOn(req, res, 'goldenTicket'))) return;
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ message: 'Authentication required.' }); return; }

  const id = asStringParam(req.params.id);
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid ticket id.' });
    return;
  }

  const role = getAuthedUserRole(req);
  const isAdmin = role === 'admin' || role === 'moderator';

  try {
    const request = await SupportRequest.findById(id).select('-__v').lean();
    if (!request || !isGoldenTicket(request)) {
      res.status(404).json({ message: 'Golden ticket not found.' });
      return;
    }
    if (!isAdmin && request.userId.toString() !== userId.toString()) {
      // Don't leak existence — return 404, not 403.
      res.status(404).json({ message: 'Golden ticket not found.' });
      return;
    }
    res.json({
      ticket: {
        ...request,
        goldenResolutions: Array.isArray(request.goldenResolutions)
          ? request.goldenResolutions
          : [],
      },
    });
  } catch (err) {
    adminLog.error(`getMyGoldenTicket failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load Golden ticket.' });
  }
}
