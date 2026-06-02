import { Request, Response } from 'express';
import User, { calculateTier } from '../models/User.js';
import ReputationLog from '../models/ReputationLog.js';
import Badge from '../models/Badge.js';

// ─── Auto Badge Awarder ─────────────────────────────────────────────────────

export const autoAwardBadges = async (userId: string): Promise<void> => {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    const allBadges = await Badge.find({ active: true, actionTrigger: 'auto' });

    for (const badge of allBadges) {
      // Points-based badges
      if (badge.pointsRequired !== undefined && badge.pointsRequired !== null) {
        if (user.points >= badge.pointsRequired) {
          const list = badge.type === 'positive' ? 'positiveBadges' : 'negativeBadges';
          const already = (user[list] as any[]).some(b => b.badgeId.toString() === badge._id.toString());
          if (!already) {
            (user[list] as any[]).push({ badgeId: badge._id.toString(), reason: `Auto-awarded: reached ${user.points} points` });
          }
        }
      }
    }

    await user.save();
  } catch {
    // Silently fail — badge award should never break main flows
  }
};

// ─── Award / Deduct Points ───────────────────────────────────────────────

export const awardPoints = async (req: Request, res: Response): Promise<void> => {
  if (!req.user || (req.user as any).role !== 'admin') {
    res.status(403).json({ message: 'Admin access required' });
    return;
  }
  try {
    const { userId, delta, reason, action, targetId, targetType } = req.body;
    if (!userId || delta === undefined || !reason) {
      res.status(400).json({ message: 'userId, delta, and reason are required' });
      return;
    }

    const user = await User.findById(userId);
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }

    const prevPoints = user.points;
    const prevTier = user.tier;
    user.points = Math.max(0, user.points + delta);
    user.reputation = user.points; // reputation = points for now
    user.tier = calculateTier(user.points);

    await user.save();

    await ReputationLog.create({
      userId, delta, reason,
      action: action || (delta > 0 ? 'admin_point_award' : 'admin_point_deduct'),
      targetId, targetType,
      awardedBy: (req as any).user?.id,
    });

    res.json({
      userId, points: user.points, reputation: user.reputation, tier: user.tier,
      prevPoints, prevTier, delta,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
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

export const issueBadge = async (req: Request, res: Response): Promise<void> => {
  if (!req.user || (req.user as any).role !== 'admin') {
    res.status(403).json({ message: 'Admin access required' });
    return;
  }
  try {
    const { userId, badgeId, reason } = req.body;
    if (!userId || !badgeId) { res.status(400).json({ message: 'userId and badgeId required' }); return; }

    const [user, badge] = await Promise.all([
      User.findById(userId),
      Badge.findById(badgeId),
    ]);
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }
    if (!badge) { res.status(404).json({ message: 'Badge not found' }); return; }

    const badgeList = badge.type === 'positive' ? 'positiveBadges' : 'negativeBadges';
    const already = (user[badgeList] as any[]).some(b => b.badgeId.toString() === badgeId);
    if (already) { res.status(409).json({ message: 'Badge already awarded' }); return; }

    (user[badgeList] as any[]).push({ badgeId, reason, awardedBy: (req as any).user?.id });
    await user.save();

    if (badge.type === 'negative') {
      await ReputationLog.create({
        userId, delta: 0, reason: `Negative badge: ${badge.name}${reason ? ` — ${reason}` : ''}`,
        action: 'badge_awarded', // using awarded as proxy since action is negative badge
        targetId: badgeId, targetType: 'badge',
        awardedBy: (req as any).user?.id,
      });
    }

    res.json({ userId, badge: { name: badge.name, slug: badge.slug, type: badge.type }, badges: user[badgeList] });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// ─── Revoke Badge ────────────────────────────────────────────────────────

export const revokeBadge = async (req: Request, res: Response): Promise<void> => {
  if (!req.user || (req.user as any).role !== 'admin') {
    res.status(403).json({ message: 'Admin access required' });
    return;
  }
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

// ─── Leaderboard ───────────────────────────────────────────────────────

export const getLeaderboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '10')), 50);
    const users = await User.find({ isDeleted: false, isBanned: false })
      .sort({ points: -1, reputation: -1 })
      .limit(limit)
      .select('name points reputation tier positiveBadges createdAt');
    const rank = users.map((u, i) => ({
      rank: i + 1,
      userId: u._id, name: u.name,
      points: u.points, reputation: u.reputation,
      tier: u.tier,
      badges: u.positiveBadges.length,
      joinedAt: u.createdAt,
    }));
    res.json({ leaderboard: rank, total: rank.length });
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

    for (const badge of allBadges) {
      if (!badge.pointsRequired) continue;
      if (user.points >= badge.pointsRequired) {
        const already = user.positiveBadges.some(b => b.badgeId.toString() === badge._id.toString());
        if (!already) {
          user.positiveBadges.push({ badgeId: badge._id });
        }
      }
    }
    await user.save();
  } catch (_) {}
};
