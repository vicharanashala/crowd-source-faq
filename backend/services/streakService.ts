import { Types } from 'mongoose';
import Streak, { IStreak } from '../models/Streak.js';
import User from '../models/User.js';
import Badge from '../models/Badge.js';
import { adminLog } from '../utils/http/logger.js';

/**
 * Recalculate and update the user's streak on daily learning/posting activity.
 * Triggered on login, FAQ reading, or community posts.
 */
export async function trackUserActivity(
  userId: string | Types.ObjectId,
  activityType: 'login' | 'faq_read' | 'answer'
): Promise<void> {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    let streak = await Streak.findOne({ userId });

    if (!streak) {
      // First activity recorded
      streak = new Streak({
        userId,
        currentStreak: 1,
        bestStreak: 1,
        lastActiveDate: now,
        activityHistory: [todayStr],
      });
      await streak.save();
    } else {
      const lastActiveStr = streak.lastActiveDate.toISOString().split('T')[0];

      if (todayStr === lastActiveStr) {
        // Already active today, just update exact timestamp
        streak.lastActiveDate = now;
        if (!streak.activityHistory.includes(todayStr)) {
          streak.activityHistory.push(todayStr);
        }
      } else {
        const msInDay = 24 * 60 * 60 * 1000;
        const d1 = new Date(todayStr);
        const d2 = new Date(lastActiveStr);
        const diffDays = Math.round((d1.getTime() - d2.getTime()) / msInDay);

        if (diffDays === 1) {
          // Active on consecutive days
          streak.currentStreak += 1;
          if (streak.currentStreak > streak.bestStreak) {
            streak.bestStreak = streak.currentStreak;
          }
        } else if (diffDays > 1) {
          // Break in activity, reset current streak
          streak.currentStreak = 1;
        }

        streak.lastActiveDate = now;
        if (!streak.activityHistory.includes(todayStr)) {
          streak.activityHistory.push(todayStr);
        }
      }

      // Filter activity history to keep only the last 7 calendar days
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
      streak.activityHistory = streak.activityHistory.filter((d) => d >= sevenDaysAgoStr);

      await streak.save();
    }

    // Award badges for milestones (3, 7, 30 days)
    const milestoneSlugs: Record<number, string> = {
      3: '3-day-streak',
      7: '7-day-streak',
      30: '30-day-streak',
    };

    const targetSlug = milestoneSlugs[streak.currentStreak];
    if (targetSlug) {
      const badge = await Badge.findOne({ slug: targetSlug, active: true });
      if (badge) {
        await User.findOneAndUpdate(
          { _id: userId, 'positiveBadges.badgeId': { $ne: badge._id } },
          {
            $push: {
              positiveBadges: {
                badgeId: badge._id,
                reason: `Streak milestone achieved: active for ${streak.currentStreak} days!`,
                awardedAt: new Date(),
              },
            },
          }
        );
      }
    }
  } catch (err) {
    adminLog.warn(`[streak] trackUserActivity failed for user ${userId}: ${(err as Error).message}`);
  }
}
