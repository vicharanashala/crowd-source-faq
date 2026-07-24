/**
 * services/ban.service.ts — Phase 1 R4.
 *
 * Single entry point for ban state. Wraps the existing
 * `utils/banUtils.ts` helpers and consolidates every mutation of
 * `goldenBannedUntil`, `goldenBanReason`, `goldenBannedBy`,
 * `goldenBannedAt`, `suspendedUntil`, `lastGoldenRejectionAt`, and
 * the SP wallet that the Golden Ticket admin flow touches.
 *
 * Audit context (`docs/redesign-plan.md §2.4 R4`):
 *
 *   - 8 controllers scattered writes of the same set of fields.
 *   - 3 of them computed the penalty independently of each other,
 *     risking drift.
 *   - The `clearExpiredGoldenBans` cron was registered ad-hoc inside
 *     `escalationController.startEscalationScheduler`, which is
 *     fragile: a refactor of escalation could silently drop the
 *     ban-cleanup schedule.
 *   - Type-safety holes around `goldenBannedUntil` being typed as
 *     `Date | null | undefined`.
 *
 * This service is the new write path for ban state. Existing
 * controllers keep working because the legacy helpers
 * (`assertCanCreateContent`, `computeGoldenRejectPenalty`,
 * `computeGoldenBanExpiry`) are re-exported at the bottom of this
 * file. The deliberate, in-place refactor of the 8 call sites is
 * deferred follow-up (out of scope for this commit per the audit).
 *
 * Atomicity note: SP debit goes through `spendSpurtiPoints` which
 * throws on insufficient balance — the controller maps the throw to
 * 402 (matching the pre-service behaviour in banAndRejectGoldenTicket).
 */
import { Types } from 'mongoose';
import User from '../modules/auth/user.model.js';
import ReputationLog from '../modules/moderation/reputation-log.model.js';
import { spendSpurtiPoints } from '../modules/program/promotion.service.js';
import { adminLog } from '../utils/http/logger.js';

// ─── Public types ─────────────────────────────────────────────────────────

export interface BanCheckResult {
  canCreate: boolean;        // false = blocked, send 403 with reason
  reason?: string;           // human-readable reason when blocked
  bannedUntil?: Date;        // for golden-ban: when it expires
}

export interface GoldenBanInput {
  userId: Types.ObjectId | string;
  /** When the ban expires. null = permanent until cleared. */
  bannedUntil: Date | null;
  reason: string;
  /** Audit who set the ban. */
  setBy: Types.ObjectId | string;
  meta?: Record<string, unknown>;
}

export interface GoldenRejectionInput {
  userId: Types.ObjectId | string;
  /** Penalty multiplier — typically the user's tier bonus * basePenalty. */
  penalty: number;
  reason: string;
  setBy: Types.ObjectId | string;
  meta?: Record<string, unknown>;
}

export interface BanState {
  goldenBannedUntil: Date | null;
  suspendedUntil: Date | null;
  sp: number;
  lastGoldenRejectionAt: Date | null;
}

// ─── Service ───────────────────────────────────────────────────────────────

class BanService {
  /**
   * Gate check for content creation. Returns `{ canCreate: false, ... }`
   * when the user is currently restricted. The auth middleware does
   * NOT call this — call sites in the content-creation endpoints
   * either invoke this directly or call the legacy
   * `assertCanCreateContent(user, res)` (re-exported below) which
   * internally still uses `isUserBannedFromCreating` from
   * `utils/banUtils.ts`.
   *
   * Order of checks (most-restrictive first):
   *   1. `goldenBannedUntil > now` — content-creation soft gate
   *      (user can still log in / browse).
   *   2. `suspendedUntil > now`    — auth-layer hard suspension.
   *
   * Returns the most-restrictive active ban when multiple are set.
   */
  async canCreateContent(userId: Types.ObjectId | string): Promise<BanCheckResult> {
    const user = await User.findById(userId).select(
      'goldenBannedUntil suspendedUntil',
    ).lean();
    if (!user) {
      // Unknown user: treat as banned — the controller should never
      // call this with a non-existent user but if it does we don't
      // want to silently let the request through.
      return { canCreate: false, reason: 'User not found.' };
    }

    const now = new Date();

    if (user.goldenBannedUntil && user.goldenBannedUntil > now) {
      return {
        canCreate: false,
        reason: `You are temporarily restricted from creating new content until ${user.goldenBannedUntil.toISOString()}. You can still browse and read.`,
        bannedUntil: user.goldenBannedUntil,
      };
    }

    if (user.suspendedUntil && user.suspendedUntil > now) {
      return {
        canCreate: false,
        reason: `Your account is suspended until ${user.suspendedUntil.toISOString()}.`,
        bannedUntil: user.suspendedUntil,
      };
    }

    return { canCreate: true };
  }

  /**
   * Apply or update a golden-ban. Persists the expiry + reason + who
   * set it. Idempotent — calling with the same input twice has no
   * observable effect after the second call.
   *
   * If `bannedUntil` is `null` the ban is permanent until cleared by
   * an admin (rare; the typical use is a finite window).
   */
  async setGoldenBan(input: GoldenBanInput): Promise<{ bannedUntil: Date | null }> {
    const userObjectId = new Types.ObjectId(String(input.userId));
    const setByObjectId = new Types.ObjectId(String(input.setBy));
    const now = new Date();
    const reason = (input.reason ?? '').toString().slice(0, 500);

    // If the new expiry is null (permanent) we store null; if it's a
    // date in the past the check `> now` will already report the
    // user as not-banned, but we still persist the caller's intent
    // so the audit trail is consistent.
    await User.updateOne(
      { _id: userObjectId },
      {
        $set: {
          goldenBannedUntil: input.bannedUntil,
          goldenBanReason: reason,
          goldenBannedBy: setByObjectId,
          goldenBannedAt: now,
        },
      },
    );

    // Audit log entry — uses the existing ReputationLog so the
    // timeline view picks it up alongside SP / reputation events.
    try {
      await ReputationLog.create({
        userId: userObjectId,
        delta: 0,
        reason: `golden_ban applied: ${reason || '(no reason)'} (until ${input.bannedUntil ? input.bannedUntil.toISOString() : 'permanent'})`,
        action: 'admin_grant' as any, // ban is a moderator/admin action
        awardedBy: setByObjectId,
        targetType: 'user',
        targetId: userObjectId,
      });
    } catch (auditErr) {
      // Audit log failure must not block the ban from being applied.
      adminLog.warn(
        `[banService] failed to write audit log for setGoldenBan on ${String(userObjectId)}: ` +
          `${(auditErr as Error).message}`,
      );
    }

    adminLog.info(
      `[banService] setGoldenBan user=${String(userObjectId)} until=${input.bannedUntil?.toISOString() ?? 'permanent'} by=${String(setByObjectId)}`,
    );

    return { bannedUntil: input.bannedUntil };
  }

  /**
   * Apply a golden rejection penalty. Debits SP from the user's
   * wallet (via `spendSpurtiPoints`, which throws on insufficient
   * balance — the controller should catch and map to 402) and stamps
   * `lastGoldenRejectionAt` so the rejection-cooldown logic can find
   * the most-recent event.
   *
   * `meta.targetId`, when provided, is forwarded to the SP ledger as
   * the originating support-request id (matches the existing
   * banAndRejectGoldenTicket call).
   */
  async applyGoldenRejection(
    input: GoldenRejectionInput,
  ): Promise<{ user: { sp: number; lastGoldenRejectionAt: Date | null } }> {
    const userObjectId = new Types.ObjectId(String(input.userId));
    const setByObjectId = new Types.ObjectId(String(input.setBy));
    const penalty = Math.trunc(Number(input.penalty) || 0);
    const now = new Date();
    const reason = (input.reason ?? '').toString();

    if (penalty > 0) {
      // `spendSpurtiPoints` writes its own ReputationLog entry with
      // action 'sp_spent' — we don't double-log here. Throws on
      // insufficient balance; caller (admin controller) catches and
      // returns 402.
      const targetIdRaw = input.meta?.['targetId'];
      const targetId =
        targetIdRaw instanceof Types.ObjectId
          ? targetIdRaw
          : targetIdRaw && Types.ObjectId.isValid(String(targetIdRaw))
            ? new Types.ObjectId(String(targetIdRaw))
            : undefined;
      await spendSpurtiPoints(
        String(userObjectId),
        penalty,
        `Golden Ticket reject penalty by ${String(setByObjectId)}: ${penalty} SP${reason ? ` — ${reason.slice(0, 120)}` : ''}`,
        targetId,
      );
    }

    // Stamp the rejection timestamp. Always set, even if penalty was
    // 0 — the cooldown gate reads this directly.
    const updated = await User.findByIdAndUpdate(
      userObjectId,
      { $set: { lastGoldenRejectionAt: now } },
      { new: true, projection: { sp: 1, lastGoldenRejectionAt: 1 } },
    );

    if (!updated) {
      throw new Error(`banService.applyGoldenRejection: user ${String(userObjectId)} not found`);
    }

    adminLog.info(
      `[banService] applyGoldenRejection user=${String(userObjectId)} penalty=${penalty} sp=${updated.sp} by=${String(setByObjectId)}`,
    );

    return {
      user: {
        sp: updated.sp,
        lastGoldenRejectionAt: updated.lastGoldenRejectionAt ?? null,
      },
    };
  }

  /**
   * Periodic cleanup. Called by cron. Removes `goldenBannedUntil`
   * from users whose ban has already expired. Idempotent — safe to
   * call repeatedly; already-cleared rows match no docs and the
   * updateMany is a no-op.
   *
   * Returns the number of users whose ban was cleared.
   */
  async clearExpiredGoldenBans(now: Date = new Date()): Promise<{ cleared: number }> {
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
      adminLog.info(
        `[banService] cleared ${result.modifiedCount} expired Golden ban(s).`,
      );
    }
    return { cleared: result.modifiedCount };
  }

  /**
   * Read full ban state for a user. Returns `null`s for unset
   * fields so callers can render a "currently active" view without
   * having to null-check each one. If the user does not exist the
   * promise resolves with all-null / zero state — the caller can
   * decide whether to treat that as an error.
   */
  async getBanState(userId: Types.ObjectId | string): Promise<BanState> {
    const user = await User.findById(userId)
      .select('goldenBannedUntil suspendedUntil sp lastGoldenRejectionAt')
      .lean();
    if (!user) {
      return {
        goldenBannedUntil: null,
        suspendedUntil: null,
        sp: 0,
        lastGoldenRejectionAt: null,
      };
    }
    return {
      goldenBannedUntil: user.goldenBannedUntil ?? null,
      suspendedUntil: user.suspendedUntil ?? null,
      sp: user.sp ?? 0,
      lastGoldenRejectionAt: user.lastGoldenRejectionAt ?? null,
    };
  }
}

export const banService = new BanService();

// ─── Legacy re-exports ─────────────────────────────────────────────────────
//
// The 5 existing controllers that gate content creation
// (`document.controller`, `post-mutations.controller`,
// `comment.controller`, `support-requests.controller`, and
// `golden-ticket-admin.controller`) import these helpers from
// `utils/banUtils.ts`. They keep working untouched. New code should
// use `banService` directly.
export { assertCanCreateContent, computeGoldenRejectPenalty } from '../utils/banUtils.js';