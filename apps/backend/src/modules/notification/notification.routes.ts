import { Router } from 'express';
import { protect } from '../../middleware/auth.js';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getSettings,
  updateSettings,
} from './notification.controller.js';

const router = Router();

// All notification routes require authentication
router.use(protect);

router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/:id/read', markAsRead);
router.patch('/read-all', markAllAsRead);
router.delete('/:id', deleteNotification);

// Notification preference settings
router.get('/settings', getSettings);
router.patch('/settings', updateSettings);

export default router;