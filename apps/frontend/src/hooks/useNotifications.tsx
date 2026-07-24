import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  // 2-C: in-flight ref for the markAllAsRead idempotency guard.
  const markAllInFlightRef = useRef<boolean>(false);

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
    // 2-C (MEDIUM) fix: previously the function was unprotected
    // against rapid double-clicks. User opens dropdown, clicks
    // 'mark all read', closes the dropdown within the in-flight
    // PATCH window, reopens — the optimistic state already shows 0
    // (cached from the first click) and the second PATCH hits the
    // server with no idempotency key. Use a ref short-circuit so
    // the second click no-ops until the first PATCH settles.
    if (markAllInFlightRef.current) return;
    markAllInFlightRef.current = true;
    try {
      await api.patch('/notifications/read-all');
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch {
      // non-critical
    } finally {
      markAllInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    fetchUnreadCount();

    // H5: poll unread count on a 30s interval so the bell badge stays fresh.
    // Without this, the badge is stuck until the user re-mounts the bell
    // or refreshes the page. The NotificationBell already re-fetches on focus,
    // so the interval only needs to cover backgrounded-tab time.
    // 2-B (MEDIUM) fix: previously the interval fired even when the tab
    // was hidden. With 1000+ active tabs in the background, this
    // wastes thousands of API calls per minute. Skip the fetch when
    // document.visibilityState === 'hidden' — the focus handler
    // already covers "user came back to the tab".
    const intervalId = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchUnreadCount();
    }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [fetchNotifications, fetchUnreadCount]);

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead, refresh: fetchNotifications };
}