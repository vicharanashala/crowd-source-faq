import { Request, Response } from 'express';
import Notification from '../models/Notification.js';
import { logger } from '../utils/logger.js';

export interface CreateNotificationParams {
  recipient: import('mongoose').Types.ObjectId;
  type: 'post_resolved' | 'comment_replied' | 'faq_match_found' | 'mention' | 'expert_request';
  title: string;
  message: string;
  /** Must point to a navigable URL, e.g. /community?post=<id> — no bare '#' */
  link: string;
}

// Internal helper — creates a notification. Does NOT send a response.
export const createNotification = async (params: CreateNotificationParams): Promise<void> => {
  try {
    await Notification.create(params);
  } catch (err) {
    // Non-critical — log but don't break the parent operation
    logger.warn(`[notification] Failed to create notification: ${(err as Error).message}`);
  }
};

// ─── Auth guard helper ─────────────────────────────────────────────────────────
function requireUser(req: Request, res: Response): import('mongoose').Types.ObjectId | null {
  if (!req.user) {
    res.status(401).json({ message: 'Not authorized' });
    return null;
  }
  return req.user._id as import('mongoose').Types.ObjectId;
}

// GET /api/notifications — Get all notifications for the authenticated user
export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const notifications = await Notification.find({ recipient: userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ notifications });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// GET /api/notifications/unread-count — Get unread notification count
export const getUnreadCount = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const count = await Notification.countDocuments({ recipient: userId, read: false });
    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// PATCH /api/notifications/:id/read — Mark a single notification as read
export const markAsRead = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: userId },
      { read: true },
      { new: true }
    );
    if (!notification) {
      res.status(404).json({ message: 'Notification not found.' });
      return;
    }
    res.json({ notification });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// PATCH /api/notifications/read-all — Mark all notifications as read for the user
export const markAllAsRead = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    await Notification.updateMany({ recipient: userId, read: false }, { read: true });
    res.json({ message: 'All notifications marked as read.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// DELETE /api/notifications/:id — Delete a notification
export const deleteNotification = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const notification = await Notification.findOneAndDelete({ _id: req.params.id, recipient: userId });
    if (!notification) {
      res.status(404).json({ message: 'Notification not found.' });
      return;
    }
    res.json({ message: 'Notification deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// ─── Notification Settings ─────────────────────────────────────────────────────
import NotificationSettings from '../models/NotificationSettings.js';

export const getSettings = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    let settings = await NotificationSettings.findOne({ user: userId });
    if (!settings) {
      settings = await NotificationSettings.create({ user: userId });
    }
    res.json({ settings });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

export const updateSettings = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const { newFaq, pendingApproval, newUser, systemAlerts, weeklyReport } = req.body as {
      newFaq?: boolean; pendingApproval?: boolean; newUser?: boolean;
      systemAlerts?: boolean; weeklyReport?: boolean;
    };
    const settings = await NotificationSettings.findOneAndUpdate(
      { user: userId },
      { newFaq, pendingApproval, newUser, systemAlerts, weeklyReport },
      { new: true, upsert: true }
    );
    res.json({ settings });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};