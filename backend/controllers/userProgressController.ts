import { Request, Response } from 'express';
import User from '../models/User.js';
import ReputationLog from '../models/ReputationLog.js';
import Notification from '../models/Notification.js';
import FAQ from '../models/FAQ.js';
import CommunityPost from '../models/CommunityPost.js';
import { TIER_THRESHOLDS, TIER_ORDER, calculateTier } from '../models/User.js';

// Helper to get next tier and points needed
function getNextTierInfo(currentPoints: number) {
  const currentTier = calculateTier(currentPoints);
  const currentTierIndex = TIER_ORDER.indexOf(currentTier);
  
  if (currentTierIndex === TIER_ORDER.length - 1) {
    // Already at max tier
    return {
      nextTier: currentTier,
      pointsToNextTier: 0,
      nextTierThreshold: TIER_THRESHOLDS[currentTier]
    };
  }
  
  const nextTier = TIER_ORDER[currentTierIndex + 1];
  const nextTierThreshold = TIER_THRESHOLDS[nextTier];
  
  return {
    nextTier,
    pointsToNextTier: nextTierThreshold - currentPoints,
    nextTierThreshold
  };
}

// Helper to get today's start timestamp
function getTodayStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// GET /api/user/daily-progress — Get user's daily progress dashboard data
export const getDailyProgress = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const todayStart = getTodayStart();

    // User must be fetched first — the leaderboard-rank query below needs
    // user.points, so it can't be bundled into the same Promise.all as the
    // query that produces `user` (that was the original bug here: `user`
    // doesn't exist yet while the Promise.all array literal is being built).
    const user = await User.findById(userId).select('points reputation tier positiveBadges acceptedAnswers faqContributions bookmarks').lean();
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    // Fetch everything else in parallel now that we know user.points.
    const [
      unreadNotifications,
      unreadTeaNotifications,
      todaysReputationLogs,
      recentFaqCount,
      recentCommunityPosts,
      leaderboardPosition
    ] = await Promise.all([
      // Notification counts
      Notification.countDocuments({ recipient: userId, read: false }),
      
      // Tea notifications (if they exist)
      (async () => {
        try {
          const { default: TeaNotification } = await import('../models/TeaNotification.js');
          return await TeaNotification.countDocuments({ userId, read: false });
        } catch {
          return 0; // TeaNotification might not exist in all setups
        }
      })(),
      
      // Today's reputation activity
      ReputationLog.find({ 
        userId, 
        createdAt: { $gte: todayStart } 
      }).lean(),
      
      // Recent FAQ contributions (last 7 days)
      FAQ.countDocuments({ 
        createdBy: userId, 
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } 
      }),
      
      // Recent community posts (last 7 days)
      CommunityPost.countDocuments({ 
        author: userId, 
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } 
      }),
      
      // User's rank on leaderboard
      User.countDocuments({ 
        points: { $gt: user.points || 0 }, 
        isDeleted: false, 
        isBanned: false 
      }).then(count => count + 1)
    ]);

    // Calculate today's points earned
    const pointsEarnedToday = todaysReputationLogs
      .filter(log => log.delta > 0)
      .reduce((sum, log) => sum + log.delta, 0);

    // Get next tier info
    const tierInfo = getNextTierInfo(user.points);

    // Calculate badge progress (example: progress to next 100-point milestone)
    const nextBadgeMilestone = Math.ceil((user.points + 1) / 100) * 100;
    const badgeProgress = {
      current: user.points,
      next: nextBadgeMilestone,
      percentage: Math.round(((user.points % 100) / 100) * 100)
    };

    // Generate dynamic challenges based on user data
    const challenges = [
      {
        id: 1,
        title: unreadNotifications > 0 ? "Clear your notifications" : "All notifications cleared!",
        detail: unreadNotifications > 0 
          ? `You have ${unreadNotifications} unread notifications waiting`
          : "You're staying on top of your notifications",
        points: 10,
        category: 'Engagement',
        completed: unreadNotifications === 0,
        actionable: unreadNotifications > 0,
        actionUrl: '/notifications'
      },
      {
        id: 2,
        title: tierInfo.pointsToNextTier > 0 ? `Advance to ${tierInfo.nextTier}` : `You're a ${user.tier}!`,
        detail: tierInfo.pointsToNextTier > 0 
          ? `Earn ${tierInfo.pointsToNextTier} more points to reach ${tierInfo.nextTier} tier`
          : `You've reached the ${user.tier} tier - excellent work!`,
        points: tierInfo.pointsToNextTier,
        category: 'Progress',
        completed: tierInfo.pointsToNextTier === 0,
        actionable: false,
        actionUrl: '/leaderboard'
      },
      {
        id: 3,
        title: recentFaqCount > 0 ? "Great knowledge sharing!" : "Share your knowledge",
        detail: recentFaqCount > 0 
          ? `You've contributed ${recentFaqCount} FAQ${recentFaqCount > 1 ? 's' : ''} this week`
          : "Help others by creating or improving FAQs",
        points: 50,
        category: 'Community',
        completed: recentFaqCount > 0,
        actionable: recentFaqCount === 0,
        actionUrl: '/faq'
      }
    ];

    // Add a fourth challenge if user has been active
    if (pointsEarnedToday > 0 || recentCommunityPosts > 0) {
      challenges.push({
        id: 4,
        title: "Engage with the community",
        detail: `You've been active with ${recentCommunityPosts} post${recentCommunityPosts !== 1 ? 's' : ''} this week`,
        points: 25,
        category: 'Community',
        completed: recentCommunityPosts > 0,
        actionable: recentCommunityPosts === 0,
        actionUrl: '/community'
      });
    }

    // Calculate streak (simplified: days with activity in last 7 days)
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date.toISOString().split('T')[0];
    });

    const activeDays = await ReputationLog.aggregate([
      {
        $match: {
          userId,
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }
        }
      }
    ]);

    const streakDays = activeDays.length;

    res.json({
      user: {
        points: user.points,
        tier: user.tier,
        badges: user.positiveBadges?.length || 0,
        rank: leaderboardPosition
      },
      challenges,
      progress: {
        completedChallenges: challenges.filter(c => c.completed).length,
        totalChallenges: challenges.length,
        pointsEarnedToday,
        streakDays,
        nextTier: tierInfo.nextTier,
        pointsToNextTier: tierInfo.pointsToNextTier,
        badgeProgress
      },
      activity: {
        unreadNotifications,
        unreadTeaNotifications,
        recentFaqCount,
        recentCommunityPosts,
        todaysActions: todaysReputationLogs.length
      }
    });

  } catch (error) {
    console.error('Error fetching daily progress:', error);
    res.status(500).json({ message: 'Server error', error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined });
  }
};