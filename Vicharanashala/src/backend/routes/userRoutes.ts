import { Router } from 'express';
import { prisma } from '../services/db.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Rank tier calculations
export function getRankTier(sp: number): string {
  if (sp < 100) return 'Seeker';
  if (sp < 300) return 'Scholar';
  if (sp < 600) return 'Sage';
  return 'Oracle';
}

// Badge evaluator helper
export async function evaluateBadges(userId: string): Promise<string[]> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return [];

    let currentBadges: string[] = [];
    try {
      currentBadges = JSON.parse(user.badges);
    } catch (e) {
      currentBadges = [];
    }

    const newBadges = [...currentBadges];
    let badgeAdded = false;

    // Check "Bookworm" (10 bookmarks)
    if (!newBadges.includes('Bookworm')) {
      const bookmarksCount = await prisma.bookmark.count({ where: { userId } });
      if (bookmarksCount >= 10) {
        newBadges.push('Bookworm');
        badgeAdded = true;
        // Award bonus SP (+50 SP)
        await prisma.user.update({
          where: { id: userId },
          data: { spurtiPoints: { increment: 50 } },
        });
        await prisma.activityLog.create({
          data: { userId, action: 'Achievement Unlocked: Bookworm', xpEarned: 50 },
        });
        await prisma.notification.create({
          data: { userId, message: '🏆 Badge Unlocked: Bookworm! (Saved 10 FAQs). Received +50 SP.' },
        });
      }
    }

    // Check "Yaksha's Favorite" (50 Yaksha messages)
    if (!newBadges.includes("Yaksha's Favorite")) {
      const chatMessagesCount = await prisma.chatMessage.count({ where: { userId } });
      if (chatMessagesCount >= 50) {
        newBadges.push("Yaksha's Favorite");
        badgeAdded = true;
        // Award bonus SP (+100 SP)
        await prisma.user.update({
          where: { id: userId },
          data: { spurtiPoints: { increment: 100 } },
        });
        await prisma.activityLog.create({
          data: { userId, action: "Achievement Unlocked: Yaksha's Favorite", xpEarned: 100 },
        });
        await prisma.notification.create({
          data: { userId, message: '🏆 Badge Unlocked: Yaksha\'s Favorite! (Sent 50 messages to Yaksha). Received +100 SP.' },
        });
      }
    }

    // Check "FAQ Hunter" (read all 24 FAQs)
    if (!newBadges.includes('FAQ Hunter')) {
      const logs = await prisma.activityLog.findMany({
        where: {
          userId,
          action: { startsWith: 'Read FAQ:' },
        },
        select: { action: true },
      });
      const uniqueReadFaqs = new Set(logs.map(l => l.action));
      // There are 24 FAQs total
      if (uniqueReadFaqs.size >= 24) {
        newBadges.push('FAQ Hunter');
        badgeAdded = true;
        // Award bonus SP (+150 SP)
        await prisma.user.update({
          where: { id: userId },
          data: { spurtiPoints: { increment: 150 } },
        });
        await prisma.activityLog.create({
          data: { userId, action: 'Achievement Unlocked: FAQ Hunter', xpEarned: 150 },
        });
        await prisma.notification.create({
          data: { userId, message: '🏆 Badge Unlocked: FAQ Hunter! (Read all 24 official FAQs). Received +150 SP.' },
        });
      }
    }

    // If new badges were unlocked, save them
    if (badgeAdded) {
      await prisma.user.update({
        where: { id: userId },
        data: { badges: JSON.stringify(newBadges) },
      });
    }

    return newBadges;
  } catch (error) {
    console.error('Error evaluating badges:', error);
    return [];
  }
}

// GET /api/user/spurti
router.get('/spurti', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        spurtiPoints: true,
        streak: true,
        badges: true,
        name: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    // Trigger evaluation to ensure any pending badges are rewarded
    const evaluatedBadges = await evaluateBadges(userId);

    // Fetch activity logs
    const logs = await prisma.activityLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 15,
    });

    const currentSp = user.spurtiPoints;
    const rank = getRankTier(currentSp);

    // Determine bounds for XP bar
    let prevLimit = 0;
    let nextLimit = 100;

    if (rank === 'Scholar') {
      prevLimit = 100;
      nextLimit = 300;
    } else if (rank === 'Sage') {
      prevLimit = 300;
      nextLimit = 600;
    } else if (rank === 'Oracle') {
      prevLimit = 600;
      nextLimit = 1000; // soft cap indicator
    }

    res.json({
      spurtiPoints: currentSp,
      streak: user.streak,
      rank,
      badges: evaluatedBadges,
      logs,
      limits: {
        prevLimit,
        nextLimit,
        percentage: Math.min(100, Math.max(0, ((currentSp - prevLimit) / (nextLimit - prevLimit)) * 100)),
      },
    });
  } catch (error) {
    console.error('Spurti dashboard fetch error:', error);
    res.status(500).json({ error: 'Server error loading Spurti details.' });
  }
});

// POST /api/user/activity (log user interactions like reading FAQ or upvoting)
router.post('/activity', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  const { action, faqId } = req.body;

  if (!userId || !action) {
    res.status(400).json({ error: 'User activity action is required.' });
    return;
  }

  try {
    let xpEarned = 0;
    let finalAction = action;

    if (action.startsWith('Read FAQ')) {
      xpEarned = 5;
      if (faqId) {
        // Prevent duplicate read FAQ points by checking if user already read this specific FAQ
        const existingLog = await prisma.activityLog.findFirst({
          where: {
            userId,
            action: `Read FAQ: ${faqId}`,
          },
        });
        if (existingLog) {
          res.json({ message: 'FAQ already read, no points awarded.', xpEarned: 0 });
          return;
        }
        finalAction = `Read FAQ: ${faqId}`;
      }
    } else if (action === 'Ask Yaksha') {
      xpEarned = 10;
    } else {
      res.status(400).json({ error: 'Unsupported action type.' });
      return;
    }

    // Award XP
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: { spurtiPoints: user.spurtiPoints + xpEarned },
    });

    await prisma.activityLog.create({
      data: {
        userId,
        action: finalAction,
        xpEarned,
      },
    });

    await prisma.notification.create({
      data: {
        userId,
        message: `Activity logged: ${finalAction}. Earned +${xpEarned} SP.`,
      },
    });

    // Evaluate badges immediately
    await evaluateBadges(userId);

    res.json({ message: 'Activity logged successfully.', xpEarned });
  } catch (error) {
    console.error('Log activity error:', error);
    res.status(500).json({ error: 'Server error logging activity.' });
  }
});

// GET /api/user/bookmarks (returns details of all bookmarked FAQs)
router.get('/bookmarks', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }

  try {
    const bookmarks = await prisma.bookmark.findMany({
      where: { userId },
      include: {
        faq: true,
      },
    });

    const formatted = bookmarks.map(b => ({
      ...b.faq,
      tags: JSON.parse(b.faq.tags),
      related: JSON.parse(b.faq.related),
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching bookmarks:', error);
    res.status(500).json({ error: 'Server error fetching bookmarks.' });
  }
});

// GET /api/user/notifications
router.get('/notifications', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }

  try {
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Server error fetching notifications.' });
  }
});

// POST /api/user/notifications/read (mark all notifications as read)
router.post('/notifications/read', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }

  try {
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    res.json({ message: 'Notifications marked as read.' });
  } catch (error) {
    console.error('Error marking notifications read:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

export default router;
