import { Router } from 'express';
import { prisma } from '../services/db.js';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Helper to award Spurti Points
async function awardXP(userId: string, action: string, xp: number) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    await prisma.user.update({
      where: { id: userId },
      data: { spurtiPoints: user.spurtiPoints + xp },
    });

    await prisma.activityLog.create({
      data: {
        userId,
        action,
        xpEarned: xp,
      },
    });

    await prisma.notification.create({
      data: {
        userId,
        message: `Earned +${xp} SP for: ${action}.`,
      },
    });
  } catch (error) {
    console.error('Error awarding XP:', error);
  }
}

// GET /api/faqs (public)
router.get('/', async (req, res) => {
  try {
    const faqs = await prisma.fAQ.findMany({
      orderBy: { popularity: 'desc' },
    });

    // Parse JSON string arrays
    const formatted = faqs.map(faq => ({
      ...faq,
      tags: JSON.parse(faq.tags),
      related: JSON.parse(faq.related),
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching FAQs:', error);
    res.status(500).json({ error: 'Server error fetching FAQs.' });
  }
});

// POST /api/faqs (admin only)
router.post('/', requireAdmin, async (req, res) => {
  const { id, category, question, answer, tags, related } = req.body;

  if (!id || !category || !question || !answer) {
    res.status(400).json({ error: 'ID, Category, Question, and Answer are required.' });
    return;
  }

  try {
    const existing = await prisma.fAQ.findUnique({ where: { id } });
    if (existing) {
      res.status(400).json({ error: `An FAQ with ID ${id} already exists.` });
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const newFaq = await prisma.fAQ.create({
      data: {
        id,
        category,
        question,
        answer,
        upvotes: 0,
        downvotes: 0,
        popularity: 100, // starting popularity
        tags: JSON.stringify(tags || []),
        related: JSON.stringify(related || []),
        lastUpdated: todayStr,
        isOfficial: true,
      },
    });

    res.status(201).json({
      ...newFaq,
      tags: JSON.parse(newFaq.tags),
      related: JSON.parse(newFaq.related),
    });
  } catch (error) {
    console.error('Error creating FAQ:', error);
    res.status(500).json({ error: 'Server error creating FAQ.' });
  }
});

// PATCH /api/faqs/:id (admin only)
router.patch('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { category, question, answer, tags, related, isOfficial } = req.body;

  try {
    const existing = await prisma.fAQ.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'FAQ not found.' });
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const updated = await prisma.fAQ.update({
      where: { id },
      data: {
        category: category ?? existing.category,
        question: question ?? existing.question,
        answer: answer ?? existing.answer,
        tags: tags ? JSON.stringify(tags) : existing.tags,
        related: related ? JSON.stringify(related) : existing.related,
        isOfficial: isOfficial !== undefined ? isOfficial : existing.isOfficial,
        lastUpdated: todayStr,
      },
    });

    res.json({
      ...updated,
      tags: JSON.parse(updated.tags),
      related: JSON.parse(updated.related),
    });
  } catch (error) {
    console.error('Error updating FAQ:', error);
    res.status(500).json({ error: 'Server error updating FAQ.' });
  }
});

// POST /api/faqs/:id/vote (public or authenticated)
router.post('/:id/vote', requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { type } = req.body; // 'upvote' or 'downvote'
  const userId = req.user?.id;

  if (type !== 'upvote' && type !== 'downvote') {
    res.status(400).json({ error: 'Vote type must be either upvote or downvote.' });
    return;
  }

  try {
    const faq = await prisma.fAQ.findUnique({ where: { id } });
    if (!faq) {
      res.status(404).json({ error: 'FAQ not found.' });
      return;
    }

    let upvotes = faq.upvotes;
    let downvotes = faq.downvotes;

    if (type === 'upvote') {
      upvotes += 1;
    } else {
      downvotes += 1;
    }

    // Popularity score = (upvotes * 10) - (downvotes * 3)
    const popularity = upvotes * 10 - downvotes * 3;

    const updated = await prisma.fAQ.update({
      where: { id },
      data: { upvotes, downvotes, popularity },
    });

    if (userId && type === 'upvote') {
      // Award +2 SP for upvoting
      await awardXP(userId, `Upvoted ${id}`, 2);
    }

    res.json({
      id: updated.id,
      upvotes: updated.upvotes,
      downvotes: updated.downvotes,
      popularity: updated.popularity,
    });
  } catch (error) {
    console.error('Error voting FAQ:', error);
    res.status(500).json({ error: 'Server error voting FAQ.' });
  }
});

// POST /api/faqs/:id/bookmark (JWT required)
router.post('/:id/bookmark', requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }

  try {
    const faq = await prisma.fAQ.findUnique({ where: { id } });
    if (!faq) {
      res.status(404).json({ error: 'FAQ not found.' });
      return;
    }

    const existing = await prisma.bookmark.findUnique({
      where: {
        userId_faqId: { userId, faqId: id },
      },
    });

    if (existing) {
      // Remove bookmark
      await prisma.bookmark.delete({
        where: { id: existing.id },
      });
      res.json({ bookmarked: false, message: 'Bookmark removed.' });
    } else {
      // Add bookmark
      await prisma.bookmark.create({
        data: { userId, faqId: id },
      });

      // Award +3 SP for bookmarking
      await awardXP(userId, `Bookmarked ${id}`, 3);

      res.json({ bookmarked: true, message: 'Bookmark added.' });
    }
  } catch (error) {
    console.error('Error toggling bookmark:', error);
    res.status(500).json({ error: 'Server error toggling bookmark.' });
  }
});

// POST /api/faqs/suggest (authenticated users submit suggestions)
router.post('/suggest', requireAuth, async (req: AuthRequest, res) => {
  const { question, answer } = req.body;
  const authorId = req.user?.id;

  if (!question || !answer || !authorId) {
    res.status(400).json({ error: 'Question and answer are required.' });
    return;
  }

  try {
    const suggestion = await prisma.communityAnswer.create({
      data: {
        question,
        answer,
        authorId,
        isVerified: false,
      },
    });

    res.status(201).json({
      message: 'FAQ suggestion submitted to the moderation queue.',
      suggestion,
    });
  } catch (error) {
    console.error('Error suggesting FAQ:', error);
    res.status(500).json({ error: 'Server error submitting suggestion.' });
  }
});

export default router;
