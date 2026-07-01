import { Request, Response } from 'express';
import CommunityPost from './community-post.model.js';
import { communityLog } from '../../utils/http/logger.js';

/** GET /api/community/stats — public community health metrics */
export async function getCommunityStats(_req: Request, res: Response): Promise<void> {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalPosts,
      answeredPosts,
      postsThisWeek,
      contributorsThisWeek,
    ] = await Promise.all([
      CommunityPost.countDocuments(),
      CommunityPost.countDocuments({ status: 'answered' }),
      CommunityPost.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      CommunityPost.aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo } } },
        { $group: { _id: '$author' } },
        { $count: 'count' },
      ]),
    ]);

    const responseRate = totalPosts > 0
      ? Math.round((answeredPosts / totalPosts) * 100)
      : 0;

    const activeContributors = contributorsThisWeek[0]?.count ?? 0;

    res.json({
      totalPosts,
      answeredPosts,
      unansweredPosts: totalPosts - answeredPosts,
      responseRate,
      solvedRate: responseRate,
      newQuestionsThisWeek: postsThisWeek,
      activeContributors,
    });
  } catch (err) {
    communityLog.error(`getCommunityStats: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to load community stats' });
  }
}