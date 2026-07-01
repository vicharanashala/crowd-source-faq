import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../../hooks/useNotifications';
import api from '../../utils/api';
import { useAuth } from '../../hooks/useAuth';
import { timeAgo } from '../../utils/time';

interface TeaDrop {
  _id: string;
  faqId: string;
  faqQuestion: string;
  faqCategory?: string;
  read: boolean;
  createdAt: string;
}


function BellIcon({ hasUnread }: { hasUnread: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b6b6b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'general' | 'tea'>('general');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, markAsRead, markAllAsRead, refresh } = useNotifications();

  // Tea state
  const [teaDrops, setTeaDrops] = useState<TeaDrop[]>([]);
  const [teaUnread, setTeaUnread] = useState(0);
  const [teaLoading, setTeaLoading] = useState(false);
  const [teaPage, setTeaPage] = useState(1);
  const [teaHasMore, setTeaHasMore] = useState(false);

  const fetchTea = useCallback(async (pageNum = 1, reset = false) => {
    if (!user) return;
    setTeaLoading(true);
    try {
      const res = await api.get<{
        drops: TeaDrop[];
        hasMore: boolean;
        unreadCount: number;
      }>(`/notifications/tea?page=${pageNum}&limit=20`);
      setTeaDrops((prev) => {
        const newDrops = res.data.drops || [];
        return reset ? newDrops : [...prev, ...newDrops];
      });
      setTeaUnread(res.data.unreadCount);
      setTeaHasMore(res.data.hasMore);
      setTeaPage(pageNum);
    } catch (e) {
      // H43: previous pattern was `console.error(friendlyError(...))` which is
      // semantically wrong — friendlyError returns the user-facing message.
      // Log the raw error instead so devs can still debug, but don't fabricate
      // a "user-friendly" message just to console.log it.
      console.error('Failed to load tea notifications:', e);
    } finally {
      setTeaLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!open) return;
    if (tab === 'tea') fetchTea(1, true);
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, tab, fetchTea]);

  useEffect(() => {
    const handleFocus = () => refresh();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refresh]);

  const handleMarkAllTeaRead = async () => {
    try {
      await api.patch('/notifications/tea/read-all');
      setTeaDrops((prev) => prev.map((d) => ({ ...d, read: true })));
      setTeaUnread(0);
    } catch (e) {
      console.error('Failed to mark all tea read:', e);
    }
  };

  const handleNotificationClick = (notif: { _id: string; read: boolean; link: string }) => {
    if (!notif.read) markAsRead(notif._id);
    setOpen(false);
    // Navigate to the notification's link (e.g. /community?post=<id> or /faq/<id>)
    if (notif.link && notif.link !== '#') {
      navigate(notif.link);
    }
  };

  const handleMarkOneTeaRead = async (id: string) => {
    try {
      await api.patch(`/notifications/tea/${id}/read`);
      setTeaDrops((prev) => prev.map((d) => (d._id === id ? { ...d, read: true } : d)));
      setTeaUnread((u) => Math.max(0, u - 1));
    } catch (e) {
      console.error('Failed to mark tea notification read:', e);
    }
  };

  const handleTeaClick = (drop: TeaDrop) => {
    if (!drop.read) handleMarkOneTeaRead(drop._id);
    setOpen(false);
    
    if (drop.faqCategory) {
      navigate(`/faq?category=${encodeURIComponent(drop.faqCategory)}`);
    } else {
      // Fallback if no category is available
      navigate(`/faq?search=${encodeURIComponent(drop.faqQuestion)}`);
    }
  };

  const totalUnread = unreadCount + teaUnread;

  const notifIcon = (type: string) =>
    ({ comment_replied: '💬', post_resolved: '✅', faq_match_found: '🔍', mention: '@', expert_request: '👑' } as Record<string, string>)[type] ?? '🔔';

  const notifLabel = (type: string) =>
    ({ comment_replied: 'Comment', post_resolved: 'Resolved', faq_match_found: 'FAQ', mention: 'Mention', expert_request: 'Expert' } as Record<string, string>)[type] ?? 'Notice';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="hidden lg:flex w-9 h-9 items-center justify-center rounded-full hover:bg-black/[0.04] transition-colors relative cursor-pointer"
        aria-label="Notifications"
      >
        <BellIcon hasUnread={totalUnread > 0} />
        {totalUnread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-accent text-accent-text text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow-md">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-80 bg-card rounded-2xl border border-border shadow-float z-50 overflow-hidden animate-fade-in">
          {/* Tabs */}
          <div className="flex border-b border-border/60">
            <button
              onClick={() => setTab('general')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-3 text-xs font-semibold transition-colors border-b-2 ${
                tab === 'general'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-ink-faint hover:text-ink'
              }`}
            >
              🔔 General
              {unreadCount > 0 && (
                <span className="bg-accent text-accent-text text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => { setTab('tea'); fetchTea(1, true); }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-3 text-xs font-semibold transition-colors border-b-2 ${
                tab === 'tea'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-ink-faint hover:text-ink'
              }`}
            >
              ☕ Spill the Tea
              {teaUnread > 0 && (
                <span className="bg-accent text-accent-text text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                  {teaUnread}
                </span>
              )}
            </button>
          </div>

          {/* ── General tab ── */}
          {tab === 'general' && (
            <>
              {unreadCount > 0 && (
                <div className="px-4 py-2 border-b border-border/40 flex justify-end">
                  <button
                    onClick={markAllAsRead}
                    className="text-[11px] text-accent hover:text-accent-dark font-medium transition-colors"
                  >
                    Mark all read
                  </button>
                </div>
              )}
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm text-ink-soft">No notifications yet</p>
                    <p className="text-xs text-ink-faint mt-1">We&apos;ll notify you when your questions get answered</p>
                  </div>
                ) : (
                  <div>
                    {notifications.slice(0, 10).map(notif => (
                      <button
                        key={notif._id}
                        onClick={() => handleNotificationClick(notif)}
                        className={`w-full text-left px-4 py-3 border-b border-border/30 hover:bg-bg transition-colors ${!notif.read ? 'bg-accent-light/20' : ''}`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs mt-0.5 ${!notif.read ? 'bg-accent text-accent-text' : 'bg-mist text-ink-faint'}`}>
                            {notifIcon(notif.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <p className={`text-sm font-medium leading-snug ${!notif.read ? 'text-ink' : 'text-ink-soft'}`}>
                                {notif.title}
                              </p>
                              {!notif.read && <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />}
                            </div>
                            <p className="text-xs text-ink-faint mt-0.5 line-clamp-2">{notif.message}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] text-ink-faint/60">
                                {new Date(notif.createdAt).toLocaleDateString('en-IN', {
                                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                                })}
                              </span>
                              <span className="text-[10px] font-medium text-accent/70">{notifLabel(notif.type)}</span>
                              {notif.link && notif.link !== '#' && (
                                <span className="ml-auto text-[10px] text-ink-faint/40">→</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Tea tab ── */}
          {tab === 'tea' && (
            <>
              {teaUnread > 0 && (
                <div className="px-4 py-2 border-b border-border/40 flex justify-end">
                  <button
                    onClick={handleMarkAllTeaRead}
                    className="text-[11px] text-accent hover:text-accent-dark font-medium transition-colors"
                  >
                    Mark all read
                  </button>
                </div>
              )}
              <div className="max-h-80 overflow-y-auto">
                {teaLoading && (!teaDrops || teaDrops.length === 0) ? (
                  <div className="p-4 space-y-2">
                    {[1, 2, 3].map((i) => <div key={i} className="h-12 rounded-xl bg-mist animate-pulse" />)}
                  </div>
                ) : (!teaDrops || teaDrops.length === 0) ? (
                  <div className="flex flex-col items-center py-10 px-4 text-center">
                    <span className="text-2xl mb-2">👀</span>
                    <p className="text-sm font-medium text-ink-soft">No tea yet</p>
                    <p className="text-xs text-ink-faint mt-1">New FAQs will appear here as drops</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/40">
                    {teaDrops.map((drop, idx) => (
                      <button
                        key={drop._id}
                        onClick={() => handleTeaClick(drop)}
                        className={`w-full text-left px-4 py-3 hover:bg-mist/50 transition-colors ${!drop.read ? 'bg-accent-light/20' : ''}`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                            !drop.read && idx === 0 ? 'bg-accent text-accent-text' : 'bg-mist text-ink-faint'
                          }`}>
                            {idx === 0 && !drop.read ? '☕' : '🍵'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                                !drop.read && idx === 0 ? 'text-accent' : 'text-ink-faint'
                              }`}>
                                {!drop.read && idx === 0 ? 'fresh tea ☕' : 'tea'}
                              </span>
                              <span className="text-[10px] text-ink-faint">·</span>
                              <span className="text-[10px] text-ink-faint">{timeAgo(drop.createdAt)}</span>
                            </div>
                            <p className="text-xs text-ink leading-snug line-clamp-2">{drop.faqQuestion}</p>
                          </div>
                          {!drop.read && <div className="flex-shrink-0 w-2 h-2 rounded-full bg-accent mt-1" />}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {teaHasMore && (
                <button
                  onClick={() => fetchTea(teaPage + 1)}
                  className="w-full px-4 py-2.5 text-xs font-medium text-ink-faint hover:text-ink hover:bg-mist/30 transition-colors border-t border-border/40"
                >
                  {teaLoading ? 'Loading…' : 'Load more tea →'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}