import { Router } from 'express';
import {
  listReminders,
  getReminderById,
  createReminder,
  updateReminder,
  deleteReminder,
  voteReminder,
  toggleReminderBookmark,
  getUserBookmarkedReminders,
  togglePinReminder,
  toggleVerifyReminder,
} from './reminder.controller.js';
import { protect, authorize } from '../../middleware/auth.js';
import { validateObjectId } from '../../middleware/validateObjectId.js';
import { validateBody } from '../../utils/auth/validation.js';
import {
  createReminderSchema,
  updateReminderSchema,
  voteReminderSchema,
} from '@csfaq/validation';

const router = Router();

// Public / Protected Reads
router.get('/bookmarks', protect, getUserBookmarkedReminders);
router.get('/', listReminders);
router.get('/:id', validateObjectId('id'), getReminderById);

// Protected Mutations
router.post('/', protect, validateBody(createReminderSchema), createReminder);
router.patch('/:id', protect, validateObjectId('id'), validateBody(updateReminderSchema), updateReminder);
router.delete('/:id', protect, validateObjectId('id'), deleteReminder);

// Voting & Bookmarking
router.post('/:id/vote', protect, validateObjectId('id'), validateBody(voteReminderSchema), voteReminder);
router.post('/:id/bookmark', protect, validateObjectId('id'), toggleReminderBookmark);

// Admin Moderation
router.post('/:id/pin', protect, authorize('admin', 'moderator'), validateObjectId('id'), togglePinReminder);
router.post('/:id/verify', protect, authorize('admin', 'moderator'), validateObjectId('id'), toggleVerifyReminder);

export default router;
