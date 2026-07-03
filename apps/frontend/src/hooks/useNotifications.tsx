import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

export interface Notification {
  _id: string;
  type: 'post_resolved' | 'comment_replied' | 'faq_match_found' | 'mention' | 'expert_request';
  title: string;
  message: string;
  /** URL to navigate to when clicked, e.g. `/community?post=<id>` or `/faq/<id>` */
  link: string;
  read: boolean;
  createdAt: string;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.notifications);
    } catch {
      // non-critical — show empty on failure
    }
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await api.get('/notifications/unread-count');
      setUnreadCount(res.data.count ?? 0);
    } catch {
      // non-critical
    }
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setUnreadCount(c => Math.max(0, c - 1));
      setNotifications(prev =>
        prev.map(n => (n._id === id ? { ...n, read: true } : n))
      );
    } catch {
      // non-critical
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await api.patch('/notifications/read-all');
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    fetchUnreadCount();

    // H5: poll unread count on a 30s interval so the bell badge stays fresh.
    // Without this, the badge is stuck until the user re-mounts the bell
    // or refreshes the page. The NotificationBell already re-fetches on focus,
    // so the interval only needs to cover backgrounded-tab time.
    const intervalId = window.setInterval(() => {
      fetchUnreadCount();
    }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [fetchNotifications, fetchUnreadCount]);

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead, refresh: fetchNotifications };
}