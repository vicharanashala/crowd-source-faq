import { Router } from 'express';
import { protect } from '../../middleware/auth.js';
import {
  getTeaNotifications,
  getTeaUnreadCount,
  markAllTeaAsRead,
  markTeaAsRead,
} from './tea-notification.controller.js';

const router = Router();

// ── Tea ────────────────────────────────────────────────────────────────────────
// GET /api/notifications/tea — Paginated tea feed
router.get('/tea', protect, getTeaNotifications);
// GET /api/notifications/tea/unread-count — Unread tea count
router.get('/tea/unread-count', protect, getTeaUnreadCount);
// PATCH /api/notifications/tea/read-all — Mark all tea as read
router.patch('/tea/read-all', protect, markAllTeaAsRead);
// PATCH /api/notifications/tea/:id/read — Mark one tea as read
router.patch('/tea/:id/read', protect, markTeaAsRead);

export default router;