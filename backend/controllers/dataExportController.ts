/**
 * Data Export Controller
 *
 * Allows users to export a machine-readable copy of their account data.
 * Covers: profile, authored content, moderation history, notifications.
 *
 * Route: GET /api/auth/export  (protected)
 * Returns: JSON blob
 */

import { Request, Response } from 'express';
import User from '../models/User.js';
import CommunityPost from '../models/CommunityPost.js';
import Notification from '../models/Notification.js';
import { sanitizeHtml } from '../utils/sanitize.js';
import { logger } from '../utils/logger.js';

export const exportUserData = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: 'Not authorized.' });
    return;
  }

  const userId = req.user._id.toString();
  const requestId = (req as Request & { id: string }).id;

  try {
    // Fetch all data in parallel
    const [user, posts, notifications, notificationsCount] = await Promise.all([
      User.findById(userId).select('-password').lean(),
      CommunityPost.find({ author: userId }).sort({ createdAt: -1 }).limit(500).lean(),
      Notification.find({ recipient: userId }).sort({ createdAt: -1 }).limit(200).lean(),
      Notification.countDocuments({ recipient: userId }),
    ]);

    if (!user) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }

    logger.audit?.('data_export', {
      userId,
      requestId,
      postCount: posts.length,
      notificationCount: notificationsCount,
    });

    const exportData = {
      exportedAt: new Date().toISOString(),
      schemaVersion: '1.0',
      user: {
        id: (user as any)._id?.toString(),
        name: sanitizeHtml((user as any).name),
        email: (user as any).email,
        role: (user as any).role,
        reputation: (user as any).reputation,
        points: (user as any).points,
        tier: (user as any).tier,
        createdAt: (user as any).createdAt,
        twoFactorEnabled: (user as any).twoFactorEnabled ?? false,
      },
      content: {
        communityPosts: posts.map((p: any) => ({
          id: p._id.toString(),
          title: sanitizeHtml(p.title),
          body: sanitizeHtml(p.body ?? ''),
          status: p.status,
          upvoteCount: p.upvotes?.length ?? 0,
          answer: p.answer ? sanitizeHtml(p.answer) : null,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
        totalPosts: posts.length,
      },
      notifications: {
        records: notifications.map((n: any) => ({
          id: n._id.toString(),
          type: n.type,
          title: sanitizeHtml(n.title),
          message: sanitizeHtml(n.message),
          link: n.link,
          read: n.read,
          createdAt: n.createdAt,
        })),
        totalNotifications: notificationsCount,
      },
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="yaksha-export-${userId.slice(-8)}.json"`);
    res.json(exportData);
  } catch (error) {
    logger.error('Data export failed', { /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ }, requestId);
    res.status(500).json({ message: 'Export failed. Please try again.' });
  }
};