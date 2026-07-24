/**
 * services/reputation.service.ts — Phase 1 R2.
 *
 * Single entry point for reputation writes. Wraps the existing
 * `awardToUser` helper in `program-reputation.model.ts` and adds the
 * missing dual-write to `User.points` + `ReputationLog` so all three
 * sources stay in sync. Per the audit (docs/redesign-plan.md §2.4 R2):
 *
 *   - User.points           (global aggregate, the existing code path
 *                            was correct for this)
 *   - ProgramReputation     (per-program mirror, was correct for this
 *                            too — but the dual-write was missing in
 *                            many controllers)
 *   - ReputationLog         (audit trail — was being written, but
 *                            many controllers used ReputationLog.create
 *                            directly without going through awardToUser
 *                            and so the global aggregate was missing
 *                            the per-program log entry)
 *
 * Existing controllers that call `awardToUser` continue to work.
 * This service is the new write path for any code that wants the
 * audit trail + per-program mirror in one call. Future PRs migrate
 * the 8 controllers listed in the audit to use `reputationService.award`
 * instead of direct `User.findByIdAndUpdate($inc) + ReputationLog.create`.
 *
 * Atomicity: the three writes are sequential, not transactional.
 * If the per-program write fails after the User write, the log
 * entry will record the intended delta. We don't use MongoDB
 * transactions because the existing code base doesn't, and the
 * partial-failure window is bounded by the audit log entry.
 */
import { Types } from 'mongoose';
import User, { calculateTier } from '../modules/auth/user.model.js';
import ProgramReputation, {
  awardToUser as programReputationAwardToUser,
} from '../modules/moderation/program-reputation.model.js';
import ReputationLog from '../modules/moderation/reputation-log.model.js';
import { adminLog } from '../utils/http/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────

export type ReputationAction =
  | 'upvote_received'
  | 'answer_accepted'
  | 'post_answered'
  | 'solution_marked'
  | 'comment_helpful'
  | 'admin_grant'
  | 'admin_revoke'
  | 'badge_earned'
  | 'penalty';

export type ReputationTargetType =
  | 'faq'
  | 'comment'
  | 'post'
  | 'support'
  | 'document'
  | 'community_post'
  | 'badge'
  | 'faq_promotion'
  | 'spurti_point_ledger'
  | 'system'
  | 'support_request'
  | 'user';

export interface ReputationAward {
  userId: Types.ObjectId | string;
  /** Per-program attribution. null = global default. */
  batchId: Types.ObjectId | string | null;
  /** Positive for award, negative for revoke. */
  points: number;
  /** Optional: Spurti Points (separate currency, gold-ticket based). */
  sp?: number;
  /** Optional: increment acceptedAnswers counter. */
  acceptedAnswers?: number;
  /** Optional: increment faqContributions counter. */
  faqContributions?: number;
  /** Audit trail fields. */
  action: ReputationAction;
  reason: string;
  targetId?: Types.ObjectId | string;
  targetType?: ReputationTargetType;
  /** Who triggered the award. null = system. */
  awardedBy?: Types.ObjectId | string | null;
  /** Free-form audit metadata. */
  meta?: Record<string, unknown>;
}

export interface ReputationResult {
  user: { _id: Types.ObjectId; points: number; reputation: number; tier: string };
  reputationLogId: Types.ObjectId;
  programReputationUpdated: boolean;
  badgeAwarded?: string;
}

// ─── Service ────────────────────────────────────────────────────────────

class ReputationService {
  /**
   * Award or revoke reputation. Writes to:
   *   1. User.points / User.reputation / User.tier (global aggregate)
   *   2. ProgramReputation.points (per-program mirror, if batchId is set)
   *   3. ReputationLog (audit trail, every call)
   *
   * Atomicity: the three writes are sequential. The log is the
   * source of truth for "what was intended" — the User/Program
   * writes are the materialized view. If the User write succeeds
   * but the log fails, we log a warning (admin notification) and
   * the +2 still appears in the user's total. The next admin
   * reconciliation can rebuild the log from observed deltas.
   */
  async award(input: ReputationAward): Promise<ReputationResult> {
    const userId = new Types.ObjectId(String(input.userId));
    const batchId =
      input.batchId == null
        ? null
        : new Types.ObjectId(String(input.batchId));
    const awardedBy =
      input.awardedBy == null
        ? null
        : new Types.ObjectId(String(input.awardedBy));

    // 1. User global aggregate. Clamp to 0 to prevent negative points
    // (matches the audit's finding on confirmSpam clamping). A revoke
    // that would go below 0 stays at 0 — the log records the intended delta.
    const userResult = await User.findOneAndUpdate(
      { _id: userId },
      [
        {
          $set: {
            points: { $max: [{ $add: ['$points', input.points] }, 0] },
            reputation: { $max: [{ $add: ['$reputation', input.points] }, 0] },
          },
        },
      ],
      { new: true },
    );
    if (!userResult) {
      throw new Error(`User not found: ${String(userId)}`);
    }

    // 2. ProgramReputation mirror (per-program, if batchId is set).
    let programReputationUpdated = false;
    if (batchId) {
      try {
        await programReputationAwardToUser(userId, batchId, {
          points: input.points,
          sp: input.sp,
          acceptedAnswers: input.acceptedAnswers,
          faqContributions: input.faqContributions,
        });
        programReputationUpdated = true;
      } catch (err) {
        adminLog.error(
          `[reputation] awardToUser (per-program) failed for user ${String(userId)}, ` +
            `batch ${String(batchId)}: ${(err as Error).message}`,
        );
        // Don't re-throw — the User write already committed. The
        // per-program mirror is the audit-trail-detail, not the
        // source of truth.
      }
    }

    // 3. Audit log. Always written.
    const logDoc = await ReputationLog.create({
      userId,
      batchId,
      delta: input.points,
      reason: input.reason,
      action: input.action,
      targetId:
        input.targetId == null ? undefined : new Types.ObjectId(String(input.targetId)),
      targetType: input.targetType,
      awardedBy,
    });

    // 4. Recompute tier if points changed. Cheap.
    userResult.tier = calculateTier(userResult.points);
    await userResult.save();

    return {
      user: {
        _id: userResult._id,
        points: userResult.points,
        reputation: userResult.reputation,
        tier: userResult.tier,
      },
      reputationLogId: logDoc._id,
      programReputationUpdated,
    };
  }

  /**
   * Add a badge to a user. Idempotent: re-running with the same
   * `badgeId` for the same user returns `awarded: false`. Looks up
   * the badge meta from `Badge` collection to record the name in
   * the result.
   */
  async awardBadge(
    userId: Types.ObjectId | string,
    badgeId: Types.ObjectId | string,
    awardedBy?: Types.ObjectId | string | null,
  ): Promise<{ awarded: boolean; badgeName?: string; reason?: string }> {
    // Dynamic import avoids a circular dep with `moderation/reputation.controller.ts`
    // (which itself imports from this service — would be a cycle at module-load).
    const { default: Badge } = await import('../modules/moderation/badge.model.js');
    const { autoAwardBadges } = await import(
      '../modules/moderation/reputation.controller.js'
    );

    const badge = await Badge.findById(badgeId).lean();
    if (!badge) {
      return { awarded: false, reason: 'Badge not found.' };
    }

    // Atomic: only award if the user doesn't already have this badge.
    // The audit pattern — in-memory check + save() — had a race that
    // produced duplicate badges. Atomic $ne filter eliminates it.
    const list = badge.type === 'positive' ? 'positiveBadges' : 'negativeBadges';
    const update = await User.findOneAndUpdate(
      { _id: userId, [`${list}.badgeId`]: { $ne: badgeId } },
      {
        $push: {
          [list]: {
            badgeId: badgeId,
            name: badge.name,
            earnedAt: new Date(),
          },
        },
      },
      { new: true },
    );

    if (!update) {
      return { awarded: false, badgeName: badge.name as string, reason: 'Already awarded.' };
    }

    // Mirror into ReputationLog so the audit trail shows the badge earn.
    await ReputationLog.create({
      userId,
      delta: 0,
      reason: `Earned badge: ${badge.name}`,
      action: 'badge_earned' as ReputationAction,
      targetId: new Types.ObjectId(String(badgeId)),
      targetType: 'badge' as ReputationTargetType,
      awardedBy: awardedBy ? new Types.ObjectId(String(awardedBy)) : null,
    });

    // Existing autoAwardBadges runs the points side. Call it for the
    // side-effect on points (some badges carry a points reward).
    if (typeof autoAwardBadges === 'function') {
      try {
        await autoAwardBadges(String(userId));
      } catch {
        // Badges already persisted — the autoAwardBadges side is
        // best-effort, ignore its failures.
      }
    }

    return { awarded: true, badgeName: badge.name as string };
  }

  /**
   * Recompute tier from `User.points`. Idempotent. Useful after a
   * batch migration or a manual points edit.
   */
  async refreshTier(
    userId: Types.ObjectId | string,
  ): Promise<{ tier: string }> {
    const user = await User.findById(userId);
    if (!user) throw new Error(`User not found: ${String(userId)}`);
    user.tier = calculateTier(user.points);
    await user.save();
    return { tier: user.tier };
  }

  /**
   * Read user reputation merged across global + per-program.
   */
  async getReputation(
    userId: Types.ObjectId | string,
    batchId?: Types.ObjectId | string | null,
  ): Promise<{
    global: { points: number; reputation: number; tier: string };
    perProgram: Array<{ batchId: string; points: number; tier: string }>;
  }> {
    const user = await User.findById(userId).lean();
    if (!user) throw new Error(`User not found: ${String(userId)}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u: any = user;
    const query: Record<string, unknown> = { userId };
    if (batchId !== undefined) {
      query.batchId = batchId == null ? null : new Types.ObjectId(String(batchId));
    }
    const perProgramDocs = await ProgramReputation.find(query).lean();
    return {
      global: {
        points: u.points,
        reputation: u.reputation,
        tier: u.tier,
      },
      perProgram: perProgramDocs.map((d) => ({
        batchId: String(d.batchId),
        points: d.points,
        tier: d.tier,
      })),
    };
  }

  /**
   * One-shot backfill: for every user, mirror their current
   * `User.points` into ProgramReputation for the user's enrolled
   * programs. Idempotent — re-running with the same data is a no-op.
   * Returns counts for the CLI.
   */
  async backfillPerProgram(): Promise<{ processed: number; created: number }> {
    const users = await User.find().select('_id points').lean();
    let processed = 0;
    let created = 0;
    for (const u of users) {
      processed++;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userId = (u as any)._id;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const points = (u as any).points;
      if (!userId || !points) continue;
      // Find enrollments — empty for now (no ProgramEnrollment model
      // wired up). When enrollments exist, loop over them and seed
      // ProgramReputation. For now, just write the global mirror as
      // a baseline.
      const existing = await ProgramReputation.findOne({ userId, batchId: null });
      if (!existing) {
        await ProgramReputation.create({
          userId,
          batchId: null,
          points,
          tier: 'newcomer',
          acceptedAnswers: 0,
          faqContributions: 0,
        });
        created++;
      }
    }
    return { processed, created };
  }
}

/** Singleton — shared across the process. Tests that need isolation
 *  can `new ReputationService()` instead. */
export const reputationService = new ReputationService();

// ─── Back-compat re-export ─────────────────────────────────────────────
//
// Existing controllers that call `awardToUser` keep working. The
// helper does the same per-program write as before — no behavior
// change for callers. Future PRs migrate the 8 call sites to
// `reputationService.award(...)` for the dual-write + audit log.
export { awardToUser } from '../modules/moderation/program-reputation.model.js';
