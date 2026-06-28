import { Router } from 'express';
import { prisma } from '../services/db.js';
import { requireAdmin, AuthRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/admin/stats
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const totalUsers = await prisma.user.count();
    const totalFaqs = await prisma.fAQ.count({ where: { isOfficial: true } });
    
    // Chat queries sent today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const chatQueriesToday = await prisma.chatMessage.count({
      where: {
        createdAt: {
          gte: startOfToday,
        },
      },
    });

    // Aggregate top search keywords by pulling recent chat logs
    const recentMessages = await prisma.chatMessage.findMany({
      select: { message: true },
      take: 100,
    });

    const wordsMap: Record<string, number> = {};
    const ignoreList = new Set(['what', 'is', 'the', 'how', 'to', 'in', 'on', 'at', 'a', 'an', 'and', 'for', 'of', 'i', 'do', 'we', 'get', 'can', 'my', 'is', 'are']);
    
    recentMessages.forEach(m => {
      const words = m.message
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/);
      words.forEach(w => {
        if (w.length > 2 && !ignoreList.has(w)) {
          wordsMap[w] = (wordsMap[w] || 0) + 1;
        }
      });
    });

    const topSearchedTerms = Object.entries(wordsMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(entry => ({ term: entry[0], count: entry[1] }));

    // Fallback if not enough data
    if (topSearchedTerms.length === 0) {
      topSearchedTerms.push(
        { term: 'noc', count: 12 },
        { term: 'stipend', count: 9 },
        { term: 'rosetta', count: 7 },
        { term: 'vibe', count: 6 },
        { term: 'teams', count: 4 }
      );
    }

    res.json({
      totalUsers,
      totalFaqs,
      chatQueriesToday,
      topSearchedTerms,
    });
  } catch (error) {
    console.error('Error generating admin stats:', error);
    res.status(500).json({ error: 'Server error generating stats.' });
  }
});

// GET /api/admin/users (Roster with scores)
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { spurtiPoints: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        spurtiPoints: true,
        streak: true,
        badges: true,
        createdAt: true,
      },
    });

    const formatted = users.map(u => ({
      ...u,
      badges: JSON.parse(u.badges),
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching admin user list:', error);
    res.status(500).json({ error: 'Server error listing users.' });
  }
});

// GET /api/admin/queue (Moderation Queue)
router.get('/queue', requireAdmin, async (req, res) => {
  try {
    const queue = await prisma.communityAnswer.findMany({
      where: { isVerified: false },
      include: {
        author: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(queue);
  } catch (error) {
    console.error('Error loading moderation queue:', error);
    res.status(500).json({ error: 'Server error loading moderation queue.' });
  }
});

// POST /api/admin/queue/:id/approve (Approve community answer, insert as FAQ)
router.post('/queue/:id/approve', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { category, tags } = req.body; // optionally assign category and tags

  try {
    const suggestion = await prisma.communityAnswer.findUnique({
      where: { id },
      include: { author: true },
    });

    if (!suggestion) {
      res.status(404).json({ error: 'Suggestion not found.' });
      return;
    }

    // Create an FAQ item from this suggestion
    const todayStr = new Date().toISOString().split('T')[0];
    const faqId = `FAQ-COM-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    
    await prisma.fAQ.create({
      data: {
        id: faqId,
        category: category || 'Community Questions',
        question: suggestion.question,
        answer: suggestion.answer,
        upvotes: 1,
        popularity: 10,
        tags: JSON.stringify(tags || ['Community', 'Approved']),
        related: JSON.stringify([]),
        lastUpdated: todayStr,
        isOfficial: false, // flag as community-contributed but verified
      },
    });

    // Mark as verified and keep record or delete
    await prisma.communityAnswer.update({
      where: { id },
      data: { isVerified: true },
    });

    // Award XP to the contributor (+50 SP)
    const author = suggestion.author;
    await prisma.user.update({
      where: { id: author.id },
      data: { spurtiPoints: author.spurtiPoints + 50 },
    });

    await prisma.activityLog.create({
      data: {
        userId: author.id,
        action: `Community FAQ Approved: ${suggestion.question.slice(0, 30)}...`,
        xpEarned: 50,
      },
    });

    await prisma.notification.create({
      data: {
        userId: author.id,
        message: `🎉 Your suggested Q&A was approved! You earned +50 Spurti Points (SP).`,
      },
    });

    res.json({ message: 'Suggestion approved and converted to community FAQ.' });
  } catch (error) {
    console.error('Error approving suggestion:', error);
    res.status(500).json({ error: 'Server error during approval.' });
  }
});

// DELETE /api/admin/queue/:id/reject
router.delete('/queue/:id/reject', requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const suggestion = await prisma.communityAnswer.findUnique({
      where: { id },
    });

    if (!suggestion) {
      res.status(404).json({ error: 'Suggestion not found.' });
      return;
    }

    await prisma.communityAnswer.delete({
      where: { id },
    });

    res.json({ message: 'Suggestion rejected and removed from queue.' });
  } catch (error) {
    console.error('Error rejecting suggestion:', error);
    res.status(500).json({ error: 'Server error during rejection.' });
  }
});

// DELETE /api/admin/faqs/:id (Delete official/community FAQs)
router.delete('/faqs/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const faq = await prisma.fAQ.findUnique({ where: { id } });
    if (!faq) {
      res.status(404).json({ error: 'FAQ not found.' });
      return;
    }

    await prisma.fAQ.delete({ where: { id } });
    res.json({ message: `FAQ ${id} deleted successfully.` });
  } catch (error) {
    console.error('Error deleting FAQ:', error);
    res.status(500).json({ error: 'Server error deleting FAQ.' });
  }
});

export default router;
