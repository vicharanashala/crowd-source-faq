import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { ReminderService } from './reminder.service.js';
import { communityLog } from '../../utils/http/logger.js';

export const listImportantLinks = async (req: Request, res: Response): Promise<void> => {
  try {
    const batchId = req.programContext?.batchId
      ? new Types.ObjectId(req.programContext.batchId)
      : null;

    const isPrivileged = req.user ? ['admin', 'moderator'].includes(req.user.role) : false;
    const includeInactive = isPrivileged && req.query.includeInactive === 'true';

    const links = await ReminderService.listImportantLinks(batchId, includeInactive);
    res.json({ links });
  } catch (error) {
    communityLog.error(`[important-link] listImportantLinks failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

export const createImportantLink = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: 'Not authorized' });
    return;
  }

  try {
    const batchId = req.programContext?.batchId
      ? new Types.ObjectId(req.programContext.batchId)
      : null;

    const link = await ReminderService.createImportantLink(req.body, req.user._id, batchId);
    res.status(201).json({ link });
  } catch (error) {
    communityLog.error(`[important-link] createImportantLink failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateImportantLink = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: 'Not authorized' });
    return;
  }

  try {
    const id = req.params.id as string;
    const link = await ReminderService.updateImportantLink(id, req.body);
    if (!link) {
      res.status(404).json({ message: 'Important link not found' });
      return;
    }

    res.json({ link });
  } catch (error) {
    communityLog.error(`[important-link] updateImportantLink failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteImportantLink = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: 'Not authorized' });
    return;
  }

  try {
    const id = req.params.id as string;
    const success = await ReminderService.deleteImportantLink(id);

    if (!success) {
      res.status(404).json({ message: 'Important link not found' });
      return;
    }

    res.json({ message: 'Important link deleted successfully' });
  } catch (error) {
    communityLog.error(`[important-link] deleteImportantLink failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};
