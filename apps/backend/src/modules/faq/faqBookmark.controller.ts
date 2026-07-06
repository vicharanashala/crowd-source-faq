/**
 * faqBookmark.controller — FAQ bookmark toggle + list
 *
 * GET  /api/faq/bookmarks           — list bookmarked FAQs (paginated)
 * POST /api/faq/:id/bookmark        — toggle bookmark on/off
 *
 * v1.72
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import FAQ from './faq.model.js';
import User from '../auth/user.model.js';
import { dispatchNotification } from '../../utils/http/notificationDispatcher.js';

/** GET /api/faq/bookmarks — list current user's bookmarked FAQs */
export async function getFaqBookmarks(req: Request, res: Response): Promise<void> {
  if (!req.user?._id) { res.status(401).json({ error: 'Unauthorized' }); return; }

  try {
    const user = await User.findById(req.user._id).lean();
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const faqIds = (user.faqBookmarks ?? []).filter(id => id != null);
    if (faqIds.length === 0) { res.json({ bookmarks: [], total: 0 }); return; }

    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10)));
    const skip = (page - 1) * limit;

    const [faqs, total] = await Promise.all([
      FAQ.find({ _id: { $in: faqIds }, status: 'approved' })
        .select('_id question answer category categoryNumber questionNumber status')
        .skip(skip)
        .limit(limit)
        .lean(),
      FAQ.countDocuments({ _id: { $in: faqIds }, status: 'approved' }),
    ]);

    res.json({ bookmarks: faqs, total, page, limit });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load FAQ bookmarks' });
  }
}

/**
 * POST /api/faq/:id/bookmark — toggle bookmark on an FAQ.
 * Idempotent via atomic findOneAndUpdate (same pattern as community bookmark).
 * Also dispatches a 'faq_bookmarked' notification on successful add.
 */
export async function toggleFaqBookmark(req: Request, res: Response): Promise<void> {
  if (!req.user?._id) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const faqId = req.params.id as string;
  const userId = req.user._id;

  if (!faqId || !mongoose.Types.ObjectId.isValid(faqId)) {
    res.status(400).json({ error: 'Invalid FAQ ID.' }); return;
  }

  try {
    const faq = await FAQ.findById(faqId).select('_id question category').lean();
    if (!faq) { res.status(404).json({ error: 'FAQ not found' }); return; }

    const user = await User.findById(userId).select('faqBookmarks').lean();
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const objectFaqId = new mongoose.Types.ObjectId(faqId);

    // Atomic idempotent toggle:
    //   already bookmarked → pull (remove)
    //   not bookmarked     → addToSet (add)
    const alreadyBookmarked = (user.faqBookmarks ?? [])
      .some(b => b.toString() === faqId);

    if (alreadyBookmarked) {
      await User.findOneAndUpdate(
        { _id: userId, faqBookmarks: objectFaqId },
        { $pull: { faqBookmarks: objectFaqId } },
      );
      res.json({ bookmarked: false, faqId });
    } else {
      await User.findOneAndUpdate(
        { _id: userId, faqBookmarks: { $ne: objectFaqId } },
        { $addToSet: { faqBookmarks: objectFaqId } },
      );

      // Fire-and-forget notification — user bookmarked an FAQ (informational only)
      dispatchNotification({
        recipientId: userId,
        eventType: 'faq_bookmarked',
        link: `/faq/${faqId}`,
        title: 'FAQ Bookmarked',
      }).catch(() => {});

      res.json({ bookmarked: true, faqId });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to update FAQ bookmark' });
  }
}