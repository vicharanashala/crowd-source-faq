import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { ReminderService, ListRemindersQuery } from './reminder.service.js';
import { communityLog } from '../../utils/http/logger.js';

export const listReminders = async (req: Request, res: Response): Promise<void> => {
  try {
    const query: ListRemindersQuery = {
      search: req.query.search as string,
      tag: req.query.tag as string,
      priority: req.query.priority as ListRemindersQuery['priority'],
      sortBy: req.query.sortBy as ListRemindersQuery['sortBy'],
      order: req.query.order as ListRemindersQuery['order'],
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
    };

    const batchId = req.programContext?.batchId
      ? new Types.ObjectId(req.programContext.batchId)
      : null;

    const result = await ReminderService.listReminders(query, batchId);
    res.json(result);
  } catch (error) {
    communityLog.error(`[reminder] listReminders failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getReminderById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const batchId = req.programContext?.batchId
      ? new Types.ObjectId(req.programContext.batchId)
      : null;

    const reminder = await ReminderService.getReminderById(id, batchId);
    if (!reminder) {
      res.status(404).json({ message: 'Reminder not found' });
      return;
    }

    res.json({ reminder });
  } catch (error) {
    communityLog.error(`[reminder] getReminderById failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

export const createReminder = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: 'Not authorized' });
    return;
  }

  try {
    const batchId = req.programContext?.batchId
      ? new Types.ObjectId(req.programContext.batchId)
      : null;

    const reminder = await ReminderService.createReminder(req.body, req.user._id, batchId);
    res.status(201).json({ reminder });
  } catch (error) {
    communityLog.error(`[reminder] createReminder failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateReminder = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: 'Not authorized' });
    return;
  }

  try {
    const id = req.params.id as string;
    const isPrivileged = ['admin', 'moderator'].includes(req.user.role);
    const reminder = await ReminderService.updateReminder(id, req.body, req.user._id, isPrivileged);

    if (!reminder) {
      res.status(404).json({ message: 'Reminder not found' });
      return;
    }

    res.json({ reminder });
  } catch (error) {
    if ((error as Error).message === 'FORBIDDEN') {
      res.status(403).json({ message: 'Forbidden: You cannot edit this reminder' });
      return;
    }
    communityLog.error(`[reminder] updateReminder failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteReminder = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: 'Not authorized' });
    return;
  }

  try {
    const id = req.params.id as string;
    const isPrivileged = ['admin', 'moderator'].includes(req.user.role);
    const success = await ReminderService.deleteReminder(id, req.user._id, isPrivileged);

    if (!success) {
      res.status(404).json({ message: 'Reminder not found' });
      return;
    }

    res.json({ message: 'Reminder deleted successfully' });
  } catch (error) {
    if ((error as Error).message === 'FORBIDDEN') {
      res.status(403).json({ message: 'Forbidden: You cannot delete this reminder' });
      return;
    }
    communityLog.error(`[reminder] deleteReminder failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

export const voteReminder = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: 'Not authorized' });
    return;
  }

  try {
    const id = req.params.id as string;
    const { voteType } = req.body as { voteType: 'up' | 'down' };
    const reminder = await ReminderService.voteReminder(id, req.user._id, voteType);

    if (!reminder) {
      res.status(404).json({ message: 'Reminder not found' });
      return;
    }

    const userIdStr = req.user._id.toString();
    const upvotedByMe = reminder.upvotes.some((u: Types.ObjectId | string) => u.toString() === userIdStr);
    const downvotedByMe = reminder.downvotes.some((d: Types.ObjectId | string) => d.toString() === userIdStr);

    res.json({
      reminder,
      score: reminder.score,
      upvotedByMe,
      downvotedByMe,
    });
  } catch (error) {
    communityLog.error(`[reminder] voteReminder failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

export const toggleReminderBookmark = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: 'Not authorized' });
    return;
  }

  try {
    const id = req.params.id as string;
    const result = await ReminderService.toggleBookmark(id, req.user._id);

    if (!result) {
      res.status(404).json({ message: 'Reminder not found' });
      return;
    }

    res.json(result);
  } catch (error) {
    communityLog.error(`[reminder] toggleReminderBookmark failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getUserBookmarkedReminders = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: 'Not authorized' });
    return;
  }

  try {
    const reminders = await ReminderService.getUserBookmarks(req.user._id);
    res.json({ reminders });
  } catch (error) {
    communityLog.error(`[reminder] getUserBookmarkedReminders failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

export const togglePinReminder = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: 'Not authorized' });
    return;
  }

  try {
    const id = req.params.id as string;
    const reminder = await ReminderService.togglePin(id, req.user._id);
    if (!reminder) {
      res.status(404).json({ message: 'Reminder not found' });
      return;
    }

    res.json({ reminder, isPinned: reminder.isPinned });
  } catch (error) {
    communityLog.error(`[reminder] togglePinReminder failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

export const toggleVerifyReminder = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: 'Not authorized' });
    return;
  }

  try {
    const id = req.params.id as string;
    const reminder = await ReminderService.toggleVerify(id, req.user._id);
    if (!reminder) {
      res.status(404).json({ message: 'Reminder not found' });
      return;
    }

    res.json({ reminder, isVerified: reminder.isVerified });
  } catch (error) {
    communityLog.error(`[reminder] toggleVerifyReminder failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};
