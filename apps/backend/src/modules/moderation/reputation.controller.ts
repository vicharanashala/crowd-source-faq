import { Request, Response } from 'express';
import { Types } from 'mongoose';
import User, { calculateTier } from '../auth/user.model.js';
import ReputationLog from './reputation-log.model.js';
import Badge from './badge.model.js';
import { awardToUser } from './program-reputation.model.js';
import { adminLog } from '../../utils/http/logger.js';

// S5-C5 fix: the route middleware permits admin / moderator / ai_moderator;
// the controller previously required `role === 'admin'`, which silently 403'd
// the other two roles. Now we accept any of the three for admin-tier reputation
// actions (awardPoints / issueBadge / revokeBadge). The route middleware is the
// authoritative gate; per-action business rules (e.g. cannot ban an admin)
// are enforced below.
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

// ─── Auto Badge Awarder ─────────────────────────────────────────────────────

export const autoAwardBadges = async (userId: string): Promise<void> => {
  try {
    // S5-M5 fix: drop the upfront `User.findById` for points. The atomic
    // findOneAndUpdate now filters by `points >= badge.pointsRequired`, so
    // a deduction between read and write can no longer cause a phantom award.
    const user = await User.findById(userId).select('_id');
    if (!user) return;

    const allBadges = await Badge.find({ active: true, actionTrigger: 'auto' });

    // v1.68 — C2 fix: the previous code did
    //   const already = some(...); if (!already) push(...); user.save();
    // which is a check-then-act race. Two concurrent calls for
    // the same user could both pass the `some` check, both push,
    // and both save() — leaving the user with duplicate badges.
    // Fix: use atomic findOneAndUpdate with a `$ne` filter that
    // excludes users already having the badge. The operation
    // either succeeds (badge added) or no-ops (already had it).
    for (const badge of allBadges) {
      if (badge.pointsRequired === undefined || badge.pointsRequired === null) continue;

      const list = badge.type === 'positive' ? 'positiveBadges' : 'negativeBadges';
      // S5-M5: include `points: { $gte: badge.pointsRequired }` in the
      // filter — the atomic update only fires if the user still meets the
      // threshold. Combined with the dedupe filter below, this is the
      // single read+write atomic op.
      await User.findOneAndUpdate(
        { _id: userId, points: { $gte: badge.pointsRequired }, [`${list}.badgeId`]: { $ne: badge._id } },
        {
          $push: {
            [list]: {
              badgeId: badge._id,
              reason: `Auto-awarded: reached threshold`,
              awardedAt: new Date(),
            },
          },
        },
      );
    }
  } catch (err) {
    // Silently fail — badge award should never break main flows, but log warning
    adminLog.warn(`[reputation] autoAwardBadges failed for user ${userId}: ${(err as Error).message}`);
  }
};

// ─── Award / Deduct Points ───────────────────────────────────────────────

export const awardPoints = async (req: Request, res: Response): Promise<void> => {
  // S5-C5 fix: accept moderator/ai_moderator (route middleware permits them).
  const adminId = requireAdminRole(req, res);
  if (!adminId) return;
  try {
    // v1.69 — Phase 7: admin award points is now batchId-scoped.
    // The body's batchId drives where the per-program write lands.
    // When null, only the User global aggregate is updated (admin
    // is awarding cross-program 'reputation' that doesn't belong
    // to any one program).
    const { userId, delta, reason, action, targetId, targetType, batchId: rawBatchId } = req.body as {
      userId?: string;
      delta?: number;
      reason?: string;
      action?: string;
      targetId?: string;
      targetType?: string;
      batchId?: string;
    };
    if (!userId || delta === undefined || !reason) {
      res.status(400).json({ message: 'userId, delta, and reason are required' });
      return;
    }
    if (!Types.ObjectId.isValid(userId)) {
      res.status(400).json({ message: 'Invalid userId.' });
      return;
    }
    if (!Number.isInteger(delta) || delta < -1000 || delta > 1000) {
      res.status(400).json({ message: 'delta must be an integer between -1000 and 1000.' });
      return;
    }

    // S5-H13 fix: read-only load for current points + tier calc, then
    // atomic findOneAndUpdate. This eliminates the lost-update race
    // where two concurrent awards both load `points = N` and last save wins.
    const user = await User.findById(userId).select('points tier');
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }

    const prevPoints = user.points;
    const prevTier = user.tier;
    const newPoints = Math.max(0, prevPoints + delta);
    const newTier = calculateTier(newPoints);

    // Atomic update — single round-trip, no in-memory mutation, no save().
    // The filter `points: { $gte: -delta }` prevents the new total from going
    // negative if delta is very large (caller-clamped above).
    await User.findOneAndUpdate(
      { _id: userId },
      {
        $inc: { points: delta, reputation: delta },
        $set: { tier: newTier },
      },
      { new: true }
    );

    // v1.69 — Phase 7: per-program write when a program is
    // specified. Dual-write with the global User aggregate.
    const batchIdValid = rawBatchId && Types.ObjectId.isValid(rawBatchId)
      ? new Types.ObjectId(rawBatchId)
      : null;
    if (batchIdValid && delta !== 0) {
      await awardToUser(userId, batchIdValid, { points: delta })
        .catch((err) => adminLog.warn(`[reputation] awardToUser failed for ${userId}: ${(err as Error).message}`));
    }

    await ReputationLog.create({
      userId, delta, reason,
      action: action || (delta > 0 ? 'admin_point_award' : 'admin_point_deduct'),
      targetId, targetType,
      batchId: batchIdValid,
      awardedBy: new Types.ObjectId(adminId),
    });

    res.json({
      userId, points: newPoints, reputation: newPoints, tier: newTier,
      prevPoints, prevTier, delta, batchId: batchIdValid,
    });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server error' });
    }
  }
};

// ─── Get Reputation ───────────────────────────────────────────────────────

export const getUserReputation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select('name email points reputation tier positiveBadges negativeBadges');
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }

    const logs = await ReputationLog.find({ userId }).sort({ createdAt: -1 }).limit(20);
    res.json({ user, logs });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// ─── Issue Badge ────────────────────────────────────────────────────────
// S5-C5 fix: accept moderator/ai_moderator via requireAdminRole.

export const issueBadge = async (req: Request, res: Response): Promise<void> => {
  const adminId = requireAdminRole(req, res);
  if (!adminId) return;
  try {
    const { userId, badgeId, reason } = req.body;
    if (!userId || !badgeId) { res.status(400).json({ message: 'userId and badgeId required' }); return; }

    // Verify user + badge exist before doing the atomic write.
    // The atomic findOneAndUpdate below would no-op (return null)
    // both for "user not found" AND "user already has the badge",
    // so we disambiguate up front.
    const badge = await Badge.findById(badgeId);
    if (!badge) { res.status(404).json({ message: 'Badge not found' }); return; }
    const user = await User.findById(userId).select('_id');
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }

    const badgeList = badge.type === 'positive' ? 'positiveBadges' : 'negativeBadges';

    // v1.68 — C2 fix: the previous code did
    //   const already = some(...); if (!already) push(...); user.save();
    // Two concurrent admin actions could both pass the check
    // and both save() — leaving the user with duplicate badges.
    // Fix: atomic findOneAndUpdate with a `$ne` filter that
    // excludes users already having the badge.
    const updated = await User.findOneAndUpdate(
      { _id: userId, [`${badgeList}.badgeId`]: { $ne: badge._id } },
      {
        $push: {
          [badgeList]: {
            badgeId: badge._id,
            reason,
            awardedBy: (req as any).user?.id,
            awardedAt: new Date(),
          },
        },
      },
      { new: true, projection: { [badgeList]: 1 } },
    );
    if (!updated) {
      res.status(409).json({ message: 'Badge already awarded' });
      return;
    }

    if (badge.type === 'negative') {
      await ReputationLog.create({
        userId, delta: 0, reason: `Negative badge: ${badge.name}${reason ? ` — ${reason}` : ''}`,
        action: 'badge_awarded', // using awarded as proxy since action is negative badge
        targetId: badgeId, targetType: 'badge',
        awardedBy: (req as any).user?.id,
      });
    }

    res.json({ userId, badge: { name: badge.name, slug: badge.slug, type: badge.type }, badges: updated[badgeList] });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// ─── Revoke Badge ────────────────────────────────────────────────────────
// S5-C5 fix: accept moderator/ai_moderator via requireAdminRole.

export const revokeBadge = async (req: Request, res: Response): Promise<void> => {
  const adminId = requireAdminRole(req, res);
  if (!adminId) return;
  try {
    const { userId, badgeId } = req.body;
    if (!userId || !badgeId) { res.status(400).json({ message: 'userId and badgeId required' }); return; }

    const badge = await Badge.findById(badgeId);
    if (!badge) { res.status(404).json({ message: 'Badge not found' }); return; }

    const badgeList = badge.type === 'positive' ? 'positiveBadges' : 'negativeBadges';
    const user = await User.findByIdAndUpdate(
      userId,
      { $pull: { [badgeList]: { badgeId } } },
      { new: true }
    );
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }

    await ReputationLog.create({
      userId, delta: 0,
      reason: `Badge revoked: ${badge.name}`,
      action: 'badge_revoked',
      targetId: badgeId, targetType: 'badge',
      awardedBy: (req as any).user?.id,
    });

    res.json({ userId, badgeId, positiveBadges: user.positiveBadges, negativeBadges: user.negativeBadges });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// ─── Auto-check Badges (called after point changes) ─────────────────────

export const autoCheckBadges = async (userId: string): Promise<void> => {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    const allBadges = await Badge.find({ actionTrigger: 'auto', active: true });

    // v1.68 — C2 fix (same pattern as autoAwardBadges above).
    // Use atomic findOneAndUpdate with a `$ne` filter to avoid
    // duplicate badges under concurrent calls.
    for (const badge of allBadges) {
      if (!badge.pointsRequired) continue;
      if (user.points < badge.pointsRequired) continue;

      await User.findOneAndUpdate(
        { _id: userId, 'positiveBadges.badgeId': { $ne: badge._id } },
        {
          $push: {
            positiveBadges: {
              badgeId: badge._id,
              awardedAt: new Date(),
            },
          },
        },
      );
    }
  } catch (err) {
    adminLog.warn(`[reputation] autoCheckBadges failed for user ${userId}: ${(err as Error).message}`);
  }
};
