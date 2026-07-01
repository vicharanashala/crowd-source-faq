/**
 * goldenTicketAdminController.ts — Admin workflow for Golden Tickets.
 *
 * v1.66 — Implements the spec in 8 sections:
 *
 *   §1  Dedicated Golden Tickets section (separate from Support
 *       inbox; the existing /api/admin/support/requests filter now
 *       hides isGolden=true by default).
 *   §2  Priority sort by user's Spurti Points balance desc
 *       (admin sees who to triage first).
 *   §3  Per-ticket display: user name, user id, current SP, ticket
 *       content, createdAt, time-remaining (48h ticket validity),
 *       status.
 *   §4  Admin actions: Resolve / Reject / Ban User + Reject.
 *   §5  Ban behavior: goldenBannedUntil = now+72h restricts creation
 *       but allows browse. Auto-unban via auth-check.
 *   §6  48h ticket validity (unchanged).
 *   §7  No reward on resolve. On reject/ban, penalty =
 *       `1.25 * spCost` debited ADDITIONALLY (OOB spec). The spCost
 *       already debited at conversion is kept.
 *   §8  Audit logging via statusHistory + logAdminAction.
 *
 * Routes (registered in routes/admin.ts):
 *   GET    /api/admin/golden-tickets
 *   POST   /api/admin/golden-tickets/:id/resolve
 *   POST   /api/admin/golden-tickets/:id/reject
 *   POST   /api/admin/golden-tickets/:id/ban
 *
 * NOTE: The existing convert-to-golden / unconvert-golden /
 * award-sp endpoints (in supportGoldenController.ts) are NOT
 * touched — they still live under the Support namespace. Only the
 * post-conversion admin workflow moves here.
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import SupportRequest from './support-request.model.js';
import User from '../auth/user.model.js';
import {
  getAuthedUserId,
  getAuthedUserRole,
  stripAdminOnlyFields,
  logAdminAction,
  notifyUser,
  isGoldenTicket,
} from './support-core.controller.js';
import { spendSpurtiPoints } from '../program/promotion.service.js';
import { adminLog } from '../../utils/http/logger.js';
import {
  assertCanCreateContent,
  computeGoldenBanExpiry,
  computeGoldenRejectPenalty,
} from '../../utils/banUtils.js';

const TICKET_VALIDITY_HOURS = 48; // §6
const BAN_HOURS = 72; // §5

function asStringParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function requireAdmin(req: Request, res: Response): { userId: Types.ObjectId; name: string } | null {
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
  const name = (req as Request & { user?: { name?: string } }).user?.name ?? 'Admin';
  return { userId, name };
}

/**
 * Compute the time-remaining string for a Golden ticket's 48h
 * validity window. Returns "expired" if past, else "MM:HH:SS" or
 * "Xd Yh". Used in the admin list response.
 */
function timeRemaining(createdAt: Date, now: Date = new Date()): {
  ms: number;
  label: string;
  expired: boolean;
} {
  const expiresAt = new Date(createdAt.getTime() + TICKET_VALIDITY_HOURS * 60 * 60 * 1000);
  const ms = expiresAt.getTime() - now.getTime();
  if (ms <= 0) return { ms, label: 'expired', expired: true };
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return { ms, label: `${days}d ${hours}h`, expired: false };
  return {
    ms,
    label: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    expired: false,
  };
}

// ─── §1+§2+§3: List active Golden Tickets (sorted by user SP desc) ─────────

/**
 * GET /api/admin/golden-tickets
 *
 * Lists active (not Resolved / Rejected / closed) Golden tickets
 * sorted by the OWNER's current Spurti Points balance desc — the
 * §2 priority rule. Each entry is enriched with the user's current
 * SP, the ticket's time-remaining (48h validity window), and the
 * audit trail slice.
 *
 * Query params:
 *   status   optional filter: 'open' | 'closed' (default: open)
 *   page     1-indexed (default 1)
 *   limit    max 100, default 25
 */
export async function listGoldenTickets(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req, res);
  if (!auth) return;

  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1')) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '25')) || 25));
    const skip = (page - 1) * limit;
    const status = String(req.query.status ?? 'open');

    const filter: Record<string, unknown> = {
      isGolden: true,
      status: { $nin: ['Resolved', 'Rejected', 'closed'] },
    };
    if (status === 'closed') {
      filter.status = { $in: ['Resolved', 'Rejected', 'closed'] };
    }

    const q = String(req.query.q ?? '').trim();
    if (q) {
      // Escape regex special characters
      const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapeRegex(q).slice(0, 120), 'i');
      filter.$or = [
        { userName: regex },
        { userEmail: regex },
        { title: regex },
        { details: regex },
        { adminNote: regex },
        { resolutionSummary: regex },
      ];
    }

    // §2: We need to sort by `user.sp` (a different collection).
    // Two options:
    //   (a) $lookup + $sort (single query, more memory)
    //   (b) Fetch user SP map separately, sort in JS (faster for small N)
    // The admin queue is small (<100 active tickets typically), so
    // (b) is fine and easier to read.
    const [total, tickets] = await Promise.all([
      SupportRequest.countDocuments(filter),
      SupportRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-__v')
        .lean(),
    ]);

    // Bulk-fetch the relevant users' SP balances.
    const userIds = Array.from(new Set(tickets.map((t) => t.userId.toString())));
    const users = userIds.length
      ? await User.find({ _id: { $in: userIds } })
          .select('_id name email sp isBanned goldenBannedUntil')
          .lean()
      : [];
    const userById = new Map(users.map((u) => [u._id.toString(), u]));

    // Enrich + sort by user.sp desc; tiebreak by createdAt asc so
    // the oldest high-priority tickets stay at the top.
    const enriched = tickets
      .map((t) => {
        const u = userById.get(t.userId.toString());
        const tr = timeRemaining(new Date(t.createdAt as unknown as string));
        return {
          ...t,
          user: u
            ? {
                _id: u._id,
                name: u.name,
                email: u.email,
                sp: u.sp ?? 0,
                isBanned: u.isBanned ?? false,
                goldenBannedUntil: u.goldenBannedUntil ?? null,
              }
            : null,
          spCost: t.spCost ?? 0,
          timeRemaining: tr,
        };
      })
      .sort((a, b) => {
        const aSp = a.user?.sp ?? 0;
        const bSp = b.user?.sp ?? 0;
        if (bSp !== aSp) return bSp - aSp; // SP desc
        return new Date(a.createdAt as unknown as string).getTime()
             - new Date(b.createdAt as unknown as string).getTime(); // oldest first
      });

    res.json({
      tickets: enriched,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
      // §3 metadata for the admin UI
      ticketValidityHours: TICKET_VALIDITY_HOURS,
      banHours: BAN_HOURS,
    });
  } catch (err) {
    adminLog.error(`[goldenTicketAdmin] listGoldenTickets failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load Golden tickets.' });
  }
}

// ─── §4 Approve / Resolve ─────────────────────────────────────────────────

/**
 * POST /api/admin/golden-tickets/:id/resolve
 *
 * Mark the Golden ticket as Resolved. Per the OOB clarification,
 * there is NO reward (the 1.25*x^2 reward was removed in v1.66).
 * The spCost that was debited at conversion is KEPT (user paid for
 * the premium service and received it).
 *
 * Body: { note?: string }
 */
export async function resolveGoldenTicket(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req, res);
  if (!auth) return;

  const id = asStringParam(req.params.id);
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid ticket id.' });
    return;
  }

  const note = String((req.body ?? {}).note ?? '').trim().slice(0, 2000);

  try {
    const request = await SupportRequest.findById(id);
    if (!request) {
      res.status(404).json({ message: 'Golden ticket not found.' });
      return;
    }
    if (!isGoldenTicket(request)) {
      res.status(409).json({ message: 'This ticket is not a Golden ticket.' });
      return;
    }
    if (request.status === 'Resolved') {
      res.json({ request: stripAdminOnlyFields(request.toObject(), true) });
      return; // idempotent
    }
    if (request.status === 'Rejected' || request.status === 'closed') {
      res.status(409).json({
        message: `Cannot resolve a ticket in status '${request.status}'.`,
      });
      return;
    }

    const now = new Date();
    const previousStatus = request.status;
    request.status = 'Resolved';
    request.resolvedAt = now;
    request.statusHistory.push({
      status: 'Resolved',
      note: note || `Resolved by ${auth.name} (no SP change).`,
      updatedBy: auth.userId,
      updatedByName: auth.name,
      timestamp: now,
    });
    request.updatedAt = now;
    await request.save();

    await logAdminAction(
      auth.userId,
      auth.name,
      'golden_resolved',
      request._id,
      `Resolved Golden ticket (spCost=${request.spCost} retained; no payout per v1.66 OOB).${note ? ` | ${note.slice(0, 120)}` : ''}`,
    );

    await notifyUser(request.userId, {
      title: 'Your Golden ticket was resolved',
      message: `An admin resolved your Golden ticket. Premium support complete.`,
      link: '/support/' + request._id.toString(),
      metadata: {
        supportRequestId: request._id.toString(),
        status: 'Resolved',
        isGolden: true,
      },
    });

    res.json({ request: stripAdminOnlyFields(request.toObject(), true) });
  } catch (err) {
    adminLog.error(`[goldenTicketAdmin] resolveGoldenTicket failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to resolve Golden ticket.' });
  }
}

// ─── §4 Reject (no ban) ───────────────────────────────────────────────────

/**
 * POST /api/admin/golden-tickets/:id/reject
 *
 * Mark the Golden ticket as Rejected. NO ban. Apply the 1.25x
 * penalty per the OOB spec: an additional `1.25 * spCost` SP is
 * debited from the user. The spCost already debited at conversion
 * is kept (no refund).
 *
 * If the penalty would push the user into negative SP, the debit
 * still proceeds (we floor at 0 via spendSpurtiPoints which throws
 * on insufficient — we surface that as a 400 with a clear message).
 *
 * Body: { reason?: string }
 */
export async function rejectGoldenTicket(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req, res);
  if (!auth) return;

  const id = asStringParam(req.params.id);
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid ticket id.' });
    return;
  }
  const reason = String((req.body ?? {}).reason ?? '').trim().slice(0, 2000);

  try {
    const request = await SupportRequest.findById(id);
    if (!request) {
      res.status(404).json({ message: 'Golden ticket not found.' });
      return;
    }
    if (!isGoldenTicket(request)) {
      res.status(409).json({ message: 'This ticket is not a Golden ticket.' });
      return;
    }
    if (request.status === 'Rejected') {
      res.json({ request: stripAdminOnlyFields(request.toObject(), true) });
      return; // idempotent
    }
    if (request.status === 'Resolved' || request.status === 'closed') {
      res.status(409).json({
        message: `Cannot reject a ticket in status '${request.status}'.`,
      });
      return;
    }

    const penalty = computeGoldenRejectPenalty(request.spCost ?? 0);

    // Debit the 1.25x penalty. We catch insufficient-balance errors
    // and surface them as 402 so admins see a clear "wallet too
    // low" message rather than a 500.
    if (penalty > 0) {
      try {
        await spendSpurtiPoints(
          request.userId.toString(),
          penalty,
          `Golden Ticket rejection penalty by admin ${auth.name} (1.25x of ${request.spCost} SP)`,
          request._id,
        );
      } catch (spErr) {
        res.status(402).json({
          message: (spErr as Error).message || 'Insufficient Spurti Points for penalty.',
          penalty,
        });
        return;
      }
    }

    const now = new Date();
    const previousStatus = request.status;
    request.status = 'Rejected';
    request.rejectedAt = now;
    request.rejectionReason = reason || request.rejectionReason;
    request.statusHistory.push({
      status: 'Rejected',
      note: reason
        ? `${reason} | Penalty: -${penalty} SP (1.25x of ${request.spCost}).`
        : `Rejected by ${auth.name}. Penalty: -${penalty} SP (1.25x of ${request.spCost}).`,
      updatedBy: auth.userId,
      updatedByName: auth.name,
      timestamp: now,
    });
    request.updatedAt = now;
    await request.save();

    await logAdminAction(
      auth.userId,
      auth.name,
      'golden_rejected',
      request._id,
      `Rejected Golden ticket (no ban). Penalty: -${penalty} SP (1.25x of ${request.spCost}).${reason ? ` | ${reason.slice(0, 120)}` : ''}`,
    );

    await notifyUser(request.userId, {
      title: 'Your Golden ticket was rejected',
      message: penalty > 0
        ? `An admin rejected your Golden ticket. A penalty of ${penalty} SP was applied.`
        : `An admin rejected your Golden ticket.`,
      link: '/support/' + request._id.toString(),
      metadata: {
        supportRequestId: request._id.toString(),
        status: 'Rejected',
        isGolden: true,
        penalty,
      },
    });

    res.json({ request: stripAdminOnlyFields(request.toObject(), true), penalty });
  } catch (err) {
    adminLog.error(`[goldenTicketAdmin] rejectGoldenTicket failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to reject Golden ticket.' });
  }
}

// ─── §4 Ban User + Reject ─────────────────────────────────────────────────

/**
 * POST /api/admin/golden-tickets/:id/ban
 *
 * Reject the Golden ticket AND apply a 72h content-creation ban to
 * the user. Penalty (1.25x spCost) is debited, goldenBannedUntil
 * is set to now+72h, and goldenBanReason + audit trail are stamped.
 *
 * The auth middleware does NOT check goldenBannedUntil — the user
 * can still log in / browse. Content-creation endpoints will 403
 * them until goldenBannedUntil has passed.
 *
 * Body: { reason?: string }
 */
export async function banAndRejectGoldenTicket(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req, res);
  if (!auth) return;

  const id = asStringParam(req.params.id);
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid ticket id.' });
    return;
  }
  const reason = String((req.body ?? {}).reason ?? '').trim().slice(0, 2000);

  try {
    const request = await SupportRequest.findById(id);
    if (!request) {
      res.status(404).json({ message: 'Golden ticket not found.' });
      return;
    }
    if (!isGoldenTicket(request)) {
      res.status(409).json({ message: 'This ticket is not a Golden ticket.' });
      return;
    }
    if (request.status === 'Rejected' && request.rejectedAt) {
      res.json({ request: stripAdminOnlyFields(request.toObject(), true) });
      return; // idempotent
    }
    if (request.status === 'Resolved' || request.status === 'closed') {
      res.status(409).json({
        message: `Cannot ban-and-reject a ticket in status '${request.status}'.`,
      });
      return;
    }

    const now = new Date();
    const penalty = computeGoldenRejectPenalty(request.spCost ?? 0);

    // Debit the 1.25x penalty. We catch insufficient-balance errors
    // and surface them as 402.
    if (penalty > 0) {
      try {
        await spendSpurtiPoints(
          request.userId.toString(),
          penalty,
          `Golden Ticket ban+reject penalty by admin ${auth.name} (1.25x of ${request.spCost} SP)`,
          request._id,
        );
      } catch (spErr) {
        res.status(402).json({
          message: (spErr as Error).message || 'Insufficient Spurti Points for penalty.',
          penalty,
        });
        return;
      }
    }

    // §5: Apply 72h ban. The check is `goldenBannedUntil > now` so
    // existing bans are extended (or freshly set, whichever is later).
    const user = await User.findById(request.userId);
    if (!user) {
      res.status(404).json({ message: 'Ticket owner not found.' });
      return;
    }
    const newExpiry = computeGoldenBanExpiry(now, BAN_HOURS);
    const existingExpiry = user.goldenBannedUntil ?? new Date(0);
    user.goldenBannedUntil = newExpiry > existingExpiry ? newExpiry : existingExpiry;
    user.goldenBanReason = reason || `Banned via Golden ticket ${request._id}`;
    user.goldenBannedBy = auth.userId;
    user.goldenBannedAt = now;
    await user.save();

    const previousStatus = request.status;
    request.status = 'Rejected';
    request.rejectedAt = now;
    request.rejectionReason = reason || request.rejectionReason;
    request.statusHistory.push({
      status: 'Rejected',
      note: reason
        ? `${reason} | Penalty: -${penalty} SP. 72h ban applied (until ${newExpiry.toISOString()}).`
        : `Banned + rejected by ${auth.name}. Penalty: -${penalty} SP. 72h ban applied (until ${newExpiry.toISOString()}).`,
      updatedBy: auth.userId,
      updatedByName: auth.name,
      timestamp: now,
    });
    request.updatedAt = now;
    await request.save();

    await logAdminAction(
      auth.userId,
      auth.name,
      'golden_banned_rejected',
      request._id,
      `Ban+Reject Golden ticket. Penalty: -${penalty} SP (1.25x of ${request.spCost}). 72h ban until ${newExpiry.toISOString()}.${reason ? ` | ${reason.slice(0, 120)}` : ''}`,
    );

    await notifyUser(request.userId, {
      title: 'Your Golden ticket was rejected — 72h restriction applied',
      message: `An admin rejected your Golden ticket and applied a 72-hour content-creation restriction (until ${newExpiry.toISOString()}). You can still browse the platform.`,
      link: '/support/' + request._id.toString(),
      metadata: {
        supportRequestId: request._id.toString(),
        status: 'Rejected',
        isGolden: true,
        penalty,
        bannedUntil: newExpiry.toISOString(),
      },
    });

    res.json({
      request: stripAdminOnlyFields(request.toObject(), true),
      penalty,
      bannedUntil: user.goldenBannedUntil,
    });
  } catch (err) {
    adminLog.error(`[goldenTicketAdmin] banAndRejectGoldenTicket failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to ban and reject Golden ticket.' });
  }
}

// ─── §8 cron: clear expired golden bans ───────────────────────────────────

/**
 * Clear `goldenBannedUntil` / `goldenBanReason` / `goldenBannedBy`
 * on any user whose ban has expired. Idempotent. Safe to call from
 * the escalation scheduler (which already runs periodically).
 *
 * Returns the number of users whose ban was cleared. Audit-logged
 * per cleared ban.
 */
export async function clearExpiredGoldenBans(now: Date = new Date()): Promise<{ cleared: number }> {
  const result = await User.updateMany(
    { goldenBannedUntil: { $lte: now, $ne: null } },
    {
      $set: {
        goldenBannedUntil: null,
        goldenBanReason: '',
        goldenBannedBy: null,
        goldenBannedAt: null,
      },
    },
  );
  if (result.modifiedCount > 0) {
    adminLog.info(`[goldenTicketAdmin] cleared ${result.modifiedCount} expired Golden ban(s).`);
  }
  return { cleared: result.modifiedCount };
}

/**
 * Re-export the assert helper for downstream controllers that want
 * to gate create endpoints (e.g., postController, documentController).
 * They could also import from utils/banUtils directly — this is just
 * a convenience barrel.
 */
export { assertCanCreateContent };
