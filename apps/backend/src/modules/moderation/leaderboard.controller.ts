import { Request, Response } from 'express';
import mongoose from 'mongoose';
import User from '../auth/user.model.js';
import ProgramReputation from './program-reputation.model.js';
import ReputationLog from './reputation-log.model.js';
import LeaderboardSnapshot from './leaderboard-snapshot.model.js';
import { LRUCache } from 'lru-cache';

const PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const leaderboardCache = new LRUCache<string, any>({ max: 50, ttl: CACHE_TTL_MS });

function cacheKey(batchId: string | undefined, period: string, page: number): string {
  return `lb:${batchId ?? 'global'}:${period}:${page}`;
}

// ─── GET /leaderboard ──────────────────────────────────────────────────────
// Query params: batchId?, page?, limit?, period? (all | week | month)
export async function getLeaderboard(req: Request, res: Response): Promise<void> {
  try {
    const { batchId, page: rawPage, limit: rawLimit, period = 'all' } = req.query;

    const page = Math.max(1, Number(rawPage) || 1);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(rawLimit) || PAGE_SIZE));
    const skip = (page - 1) * limit;

    const cacheKeyValue = cacheKey(batchId as string | undefined, period as string, page);
    const cached = leaderboardCache.get(cacheKeyValue);
    if (cached) {
      res.json(cached);
      return;
    }

    let rankings: Array<{
      userId: mongoose.Types.ObjectId;
      points: number;
      acceptedAnswers: number;
      faqContributions: number;
    }> = [];
    let total = 0;

    if (batchId && period === 'all') {
      // Per-program leaderboard from ProgramReputation (pre-computed, fast)
      const [docs, count] = await Promise.all([
        ProgramReputation.find({ batchId })
          .sort({ points: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        ProgramReputation.countDocuments({ batchId }),
      ]);
      rankings = docs.map((d) => ({
        userId: d.userId,
        points: d.points,
        acceptedAnswers: d.acceptedAnswers,
        faqContributions: d.faqContributions,
      }));
      total = count;
    } else if (period !== 'all') {
      // Time-filtered: sum ReputationLog deltas within the window
      const now = new Date();
      const since = new Date(
        period === 'week'
          ? now.getTime() - 7 * 24 * 60 * 60 * 1000
          : now.getTime() - 30 * 24 * 60 * 60 * 1000
      );

      const matchStage: Record<string, any> = {
        createdAt: { $gte: since },
        delta: { $gt: 0 },
      };
      if (batchId) matchStage.batchId = new mongoose.Types.ObjectId(batchId as string);

      const agg = await ReputationLog.aggregate([
        { $match: matchStage },
        { $group: { _id: '$userId', points: { $sum: '$delta' } } },
        { $sort: { points: -1 } },
        { $skip: skip },
        { $limit: limit },
      ]);

      const countAgg = await ReputationLog.aggregate([
        { $match: matchStage },
        { $group: { _id: '$userId' } },
        { $count: 'total' },
      ]);

      rankings = agg.map((a) => ({
        userId: a._id,
        points: a.points,
        acceptedAnswers: 0,
        faqContributions: 0,
      }));
      total = countAgg[0]?.total ?? 0;
    } else {
      // Global all-time from User.points (pre-computed, fast)
      const [users, count] = await Promise.all([
        User.find({ isDeleted: { $ne: true }, isBanned: { $ne: true } })
          .sort({ points: -1 })
          .skip(skip)
          .limit(limit)
          .select('points acceptedAnswers faqContributions')
          .lean(),
        User.countDocuments({ isDeleted: { $ne: true }, isBanned: { $ne: true } }),
      ]);
      rankings = users.map((u) => ({
        userId: u._id,
        points: u.points,
        acceptedAnswers: u.acceptedAnswers,
        faqContributions: u.faqContributions,
      }));
      total = count;
    }

    // Fetch user details for this page
    const userIds = rankings.map((r) => r.userId);
    const users = await User.find({ _id: { $in: userIds } })
      .select('name avatar tier positiveBadges')
      .lean();

    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    // Get rank change from latest snapshot
    const rankChangeMap = new Map<string, number>();
    if (batchId || !batchId) {
      const latestSnapshot = await LeaderboardSnapshot.findOne(
        batchId ? { batchId: new mongoose.Types.ObjectId(batchId as string) } : { batchId: null }
      )
        .sort({ snapshotDate: -1 })
        .lean();

      if (latestSnapshot) {
        const prevRankMap = new Map(
          latestSnapshot.entries.map((e) => [e.userId.toString(), e.rank])
        );
        for (let i = 0; i < rankings.length; i++) {
          const currentRank = skip + i + 1;
          const prevRank = prevRankMap.get(rankings[i].userId.toString());
          if (prevRank !== undefined) {
            rankChangeMap.set(rankings[i].userId.toString(), prevRank - currentRank);
          }
        }
      }
    }

    // Get current user's rank if authenticated
    let me: { rank: number; points: number; tier: string } | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader) {
      try {
        const jwt = await import('jsonwebtoken');
        const token = authHeader.replace('Bearer ', '');
        const decoded = jwt.default.verify(token, process.env.JWT_SECRET || 'yaksha_secret') as { id: string };
        const meUser = await User.findById(decoded.id).select('points tier').lean();
        if (meUser) {
          let myRank: number;
          if (batchId && period === 'all') {
            const myDoc = await ProgramReputation.findOne({
              batchId: new mongoose.Types.ObjectId(batchId as string),
              userId: meUser._id,
            }).lean();
            myRank = myDoc
              ? (await ProgramReputation.countDocuments({
                  batchId: new mongoose.Types.ObjectId(batchId as string),
                  points: { $gt: myDoc.points },
                })) + 1
              : total + 1;
          } else {
            myRank =
              (await User.countDocuments({
                points: { $gt: meUser.points },
                isDeleted: { $ne: true },
                isBanned: { $ne: true },
              })) + 1;
          }
          me = { rank: myRank, points: meUser.points, tier: meUser.tier };
        }
      } catch {
        // Invalid token — not logged in, continue without `me`
      }
    }

    const response = {
      rankings: rankings.map((r, i) => {
        const u = userMap.get(r.userId.toString());
        const badges = (u?.positiveBadges || []).slice(0, 3).map((b: any) => ({
          badgeId: b.badgeId,
          awardedAt: b.awardedAt,
        }));
        return {
          rank: skip + i + 1,
          userId: r.userId,
          name: u?.name ?? 'Unknown',
          avatar: u?.avatar?.url ?? null,
          tier: u?.tier ?? 'newcomer',
          points: r.points,
          acceptedAnswers: r.acceptedAnswers,
          faqContributions: r.faqContributions,
          badges,
          rankChange: rankChangeMap.get(r.userId.toString()) ?? 0,
        };
      }),
      me,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };

    leaderboardCache.set(cacheKeyValue, response);
    res.json(response);
  } catch (err) {
    console.error('[Leaderboard] Error:', err);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
}

// ─── POST /leaderboard/snapshot ────────────────────────────────────────────
// Admin-only: creates a weekly snapshot for rank change tracking
export async function createSnapshot(_req: Request, res: Response): Promise<void> {
  try {
    const now = new Date();

    // Global snapshot
    const globalUsers = await User.find({ isDeleted: { $ne: true }, isBanned: { $ne: true } })
      .sort({ points: -1 })
      .limit(500)
      .select('points')
      .lean();

    const globalEntries = globalUsers.map((u, i) => ({
      userId: u._id,
      rank: i + 1,
      points: u.points,
    }));

    if (globalEntries.length > 0) {
      await LeaderboardSnapshot.findOneAndUpdate(
        { batchId: null, snapshotDate: { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } },
        { batchId: null, snapshotDate: now, entries: globalEntries },
        { upsert: true, new: true }
      );
    }

    // Per-program snapshots
    const programs = await ProgramReputation.distinct('batchId');
    for (const batchId of programs) {
      const progUsers = await ProgramReputation.find({ batchId })
        .sort({ points: -1 })
        .limit(500)
        .lean();

      const entries = progUsers.map((u, i) => ({
        userId: u.userId,
        rank: i + 1,
        points: u.points,
      }));

      if (entries.length > 0) {
        await LeaderboardSnapshot.findOneAndUpdate(
          { batchId, snapshotDate: { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } },
          { batchId, snapshotDate: now, entries },
          { upsert: true, new: true }
        );
      }
    }

    // Cleanup old snapshots (keep last 12 weeks)
    const cutoff = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);
    await LeaderboardSnapshot.deleteMany({ snapshotDate: { $lt: cutoff } });

    leaderboardCache.clear();
    res.json({ ok: true, message: 'Leaderboard snapshots created' });
  } catch (err) {
    console.error('[Leaderboard Snapshot] Error:', err);
    res.status(500).json({ error: 'Failed to create snapshot' });
  }
}
