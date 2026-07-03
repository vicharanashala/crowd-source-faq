import { Request, Response } from 'express';
import { Types } from 'mongoose';
import TeaNotification, { type TeaEventType } from './tea-notification.model.js';
import { supportLog } from '../../utils/http/logger.js';

// ─── Reusable tea-drop creator ────────────────────────────────────────────────
// eventType drives the icon/message shown in the SpillTheTea UI.
// Uses upsert to prevent duplicates if called multiple times.
export async function createTeaDrop(params: {
  userId: Types.ObjectId;
  eventType: TeaEventType;
  postId?: Types.ObjectId;
  postTitle?: string;
  faqId?: Types.ObjectId;
  faqQuestion?: string;
  faqCategory?: string;
  triggeredBy?: Types.ObjectId;
  triggeredByName?: string;
  content?: string;
}): Promise<void> {
  try {
    await TeaNotification.findOneAndUpdate(
      {
        userId: params.userId,
        postId: params.postId ?? null,
        faqId: params.faqId ?? null,
        eventType: params.eventType,
      },
      { $setOnInsert: params },
      { upsert: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    supportLog.warn(`[tea] createTeaDrop failed: ${(err as Error).message}`);
  }
}

// ─── Backwards-compatible fan-out for FAQ publications ───────────────────────
// Called by faqController.approveFAQ. Fans out one drop per non-admin user.
export async function createTeaDropsForFAQ(faqId: string, faqQuestion: string, faqCategory?: string): Promise<void> {
  try {
    const User = (await import('../auth/user.model.js')).default;
    const users = await User.find({ role: { $nin: ['admin', 'moderator'] } }).select('_id');
    await Promise.all(
      users.map((u) =>
        createTeaDrop({
          userId: u._id,
          eventType: 'faq_published',
          faqId: new Types.ObjectId(faqId),
          faqQuestion,
          faqCategory,
        })
      )
    );
  } catch (err) {
    supportLog.warn(`[tea] createTeaDropsForFAQ failed: ${(err as Error).message}`);
  }
}

// ─── API endpoints ────────────────────────────────────────────────────────────

// GET /api/notifications/tea — Paginated tea feed
export const getTeaNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const [drops, total, unreadResult] = await Promise.all([
      TeaNotification.find({ userId: req.user!._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      TeaNotification.countDocuments({ userId: req.user!._id }),
      TeaNotification.countDocuments({ userId: req.user!._id, read: false }),
    ]);

    res.json({
      drops,
      total,
      unreadCount: unreadResult,
      page,
      limit,
      pages: Math.ceil(total / limit),
      hasMore: skip + drops.length < total,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// GET /api/notifications/tea/unread-count
export const getTeaUnreadCount = async (req: Request, res: Response): Promise<void> => {
  try {
    const count = await TeaNotification.countDocuments({
      userId: req.user!._id,
      read: false,
    });
    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// PATCH /api/notifications/tea/read-all
export const markAllTeaAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    await TeaNotification.updateMany({ userId: req.user!._id, read: false }, { read: true });
    res.json({ message: 'All tea marked as read.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// PATCH /api/notifications/tea/:id/read
export const markTeaAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const drop = await TeaNotification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user!._id },
      { read: true },
      { new: true }
    );
    if (!drop) {
      res.status(404).json({ message: 'Tea drop not found.' });
      return;
    }
    res.json({ drop });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};