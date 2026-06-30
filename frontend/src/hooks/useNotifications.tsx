import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useAuth } from './useAuth';

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
  const { isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.notifications);
    } catch {
      // non-critical — show empty on failure
    }
  }, [isAuthenticated]);

  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await api.get('/notifications/unread-count');
      setUnreadCount(res.data.count ?? 0);
    } catch {
      // non-critical
    }
  }, [isAuthenticated]);

  const markAsRead = useCallback(async (id: string) => {
    if (!isAuthenticated) return;
    try {
      await api.patch(`/notifications/${id}/read`);
      setUnreadCount(c => Math.max(0, c - 1));
      setNotifications(prev =>
        prev.map(n => (n._id === id ? { ...n, read: true } : n))
      );
    } catch {
      // non-critical
    }
  }, [isAuthenticated]);

  const markAllAsRead = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      await api.patch('/notifications/read-all');
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch {
      // non-critical
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    fetchNotifications();
    fetchUnreadCount();
  }, [isAuthenticated, fetchNotifications, fetchUnreadCount]);

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead, refresh: fetchNotifications };
}