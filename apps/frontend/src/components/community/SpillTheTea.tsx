import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { friendlyError } from '../../utils/api';
import { useAuth } from '../../hooks/useAuth';

type TeaEventType = 'faq_published' | 'post_answered' | 'post_deleted' | 'post_answered_user';

interface ToastState { msg: string; type: 'success' | 'info' }

interface TeaDrop {
  _id: string;
  eventType: TeaEventType;
  // FAQ fields
  faqId?: string;
  faqQuestion?: string;
  // Post fields
  postId?: string;
  postTitle?: string;
  triggeredByName?: string;
  content?: string;
  read: boolean;
  createdAt: string;
}

const EVENT_META: Record<TeaEventType, { label: string; icon: string; color: string; bgColor: string }> = {
  faq_published:     { label: 'new faq',        icon: '📋', color: 'text-purple-600',   bgColor: 'bg-purple-50' },
  post_answered:     { label: 'resolved',        icon: '✅', color: 'text-emerald-600',   bgColor: 'bg-emerald-50' },
  post_deleted:      { label: 'removed',         icon: '🗑',  color: 'text-red-500',       bgColor: 'bg-red-50' },
  post_answered_user:{ label: 'new answer',      icon: '💡', color: 'text-amber-600',     bgColor: 'bg-amber-50' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function SpillTheTea() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [drops, setDrops] = useState<TeaDrop[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSeenIdRef = useRef<string | null>(null);

  const fetchTea = useCallback(async (pageNum = 1, reset = false) => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await api.get<{ drops: TeaDrop[]; hasMore: boolean; unreadCount: number }>(
        `/notifications/tea?page=${pageNum}&limit=20`
      );
      const newDrops = res.data.drops;

      // Background poll (dropdown closed): detect new post_answered events and toast
      if (!open && newDrops.length > 0) {
        const latestDrop = newDrops[0];
        // Only toast for post_answered (Admin/AI resolved) and only if it's a new drop
        if (
          latestDrop.eventType === 'post_answered' &&
          lastSeenIdRef.current !== null &&
          latestDrop._id !== lastSeenIdRef.current
        ) {
          setToast({
            msg: `"${latestDrop.postTitle}" was answered by ${latestDrop.triggeredByName ?? 'the team'}`,
            type: 'success',
          });
          setTimeout(() => setToast(null), 4000);
        }
        lastSeenIdRef.current = latestDrop._id;
      }

      setDrops((prev) => (reset ? newDrops : [...prev, ...newDrops]));
      setUnread(res.data.unreadCount);
      setHasMore(res.data.hasMore);
      setPage(pageNum);
    } catch (e) {
      console.error(friendlyError(e, 'Failed to load notifications.'));
    } finally {
      setLoading(false);
    }
  }, [user, open]);

  // Init lastSeenIdRef on first load so we don't toast on pre-existing data
  useEffect(() => {
    if (!user) return;
    // Initial load only — set lastSeenIdRef without triggering toast logic
    fetchTea(1, true).then(() => {
      // lastSeenIdRef is set inside fetchTea after this resolves
    });
  }, [user]);

  useEffect(() => {
    if (open) {
      fetchTea(1, true);
      pollingRef.current = setInterval(() => fetchTea(1, true), 30_000);
    } else {
      if (pollingRef.current) clearInterval(pollingRef.current);
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [open, fetchTea]);

  // Background poll (dropdown closed): only run when the dropdown is closed so
  // new post_answered events surface as a toast. The 60s cadence is slower than
  // the open-state 30s poll because we don't need a fresh list — fetchTea's
  // !open branch only reads the latest drop id and toasts on a new one. The
  // lastSeenIdRef guard inside fetchTea prevents toasting on pre-existing data.
  useEffect(() => {
    if (!user || open) return;
    const id = setInterval(() => fetchTea(1, true), 60_000);
    return () => clearInterval(id);
  }, [user, open, fetchTea]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleMarkAllRead = async () => {
    try {
      await api.patch('/notifications/tea/read-all');
      setDrops((prev) => prev.map((d) => ({ ...d, read: true })));
      setUnread(0);
    } catch (e) { console.error(friendlyError(e, 'Failed to mark notifications read.')); }
  };

  const handleMarkOneRead = async (id: string) => {
    try {
      await api.patch(`/notifications/tea/${id}/read`);
      setDrops((prev) => prev.map((d) => (d._id === id ? { ...d, read: true } : d)));
      setUnread((u) => Math.max(0, u - 1));
    } catch (e) { console.error(friendlyError(e, 'Failed to mark notification read.')); }
  };

  const handleDropClick = (drop: TeaDrop) => {
    if (!drop.read) handleMarkOneRead(drop._id);
    const search = drop.postTitle ?? drop.faqQuestion ?? '';
    if (search) navigate(`/faq?q=${encodeURIComponent(search)}`);
  };

  if (!user) return null;

  const freshLabel = (drop: TeaDrop, index: number) => {
    const meta = EVENT_META[drop.eventType] ?? EVENT_META['faq_published'];
    return !drop.read && index === 0 ? `${meta.label} ${meta.icon}` : meta.label;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-black/[0.04] transition-colors"
        title="Spill the Tea ☕"
      >
        <span className="text-lg" style={{ fontSize: '1.15rem' }}>☕</span>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-accent text-accent-text text-[9px] font-bold px-1 leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-12 w-80 bg-card rounded-2xl border border-border shadow-float z-50 overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              <span className="text-base">☕</span>
              <span className="text-sm font-semibold text-ink">Spill the Tea</span>
              {unread > 0 && (
                <span className="text-[10px] font-semibold text-accent bg-accent-light px-2 py-0.5 rounded-full">{unread} new</span>
              )}
            </div>
            {unread > 0 && (
              <button onClick={handleMarkAllRead} className="text-[11px] text-ink-faint hover:text-ink transition-colors">Mark all read</button>
            )}
          </div>

          {/* Drop list */}
          <div className="max-h-80 overflow-y-auto">
            {loading && drops.length === 0 ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-12 rounded-xl bg-mist animate-pulse" />)}
              </div>
            ) : drops.length === 0 ? (
              <div className="flex flex-col items-center py-10 px-4 text-center">
                <span className="text-2xl mb-2">👀</span>
                <p className="text-sm font-medium text-ink-soft">No tea yet</p>
                <p className="text-xs text-ink-faint mt-1">Updates on your posts will appear here</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {drops.map((drop, idx) => {
                  const meta = EVENT_META[drop.eventType] ?? EVENT_META['faq_published'];
                  const isFresh = !drop.read && idx === 0;
                  const title = drop.postTitle ?? drop.faqQuestion ?? '';
                  const isDeleted = drop.eventType === 'post_deleted';

                  return (
                    <button
                      key={drop._id}
                      onClick={() => handleDropClick(drop)}
                      className={`w-full text-left px-4 py-3 hover:bg-mist/50 transition-colors ${!drop.read ? `${meta.bgColor}/20` : ''}`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                          isFresh ? 'bg-accent text-accent-text' : 'bg-mist text-ink-faint'
                        }`}>
                          {isFresh ? '☕' : meta.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className={`text-[10px] font-semibold uppercase tracking-wider ${isFresh ? meta.color : 'text-ink-faint'}`}>
                              {freshLabel(drop, idx)}
                            </span>
                            <span className="text-[10px] text-ink-faint">·</span>
                            <span className="text-[10px] text-ink-faint">{timeAgo(drop.createdAt)}</span>
                          </div>
                          <p className={`text-xs leading-snug line-clamp-2 ${isDeleted ? 'italic text-ink-faint' : 'text-ink'}`}>
                            {isDeleted ? `Your post "${title}" was removed` : title}
                          </p>
                          {drop.triggeredByName && !isDeleted && (
                            <p className="text-[10px] text-ink-faint mt-0.5">
                              by {drop.triggeredByName}
                            </p>
                          )}
                        </div>
                        {!drop.read && <div className="flex-shrink-0 w-2 h-2 rounded-full bg-accent mt-1" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Load more */}
          {hasMore && (
            <button
              onClick={() => fetchTea(page + 1)}
              className="w-full px-4 py-2.5 text-xs font-medium text-ink-faint hover:text-ink hover:bg-mist/30 transition-colors border-t border-border/40"
            >
              {loading ? 'Loading…' : 'Load more tea →'}
            </button>
          )}
        </div>
      )}

      {/* Background-poll toast: new post_answered from Admin/AI */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl bg-ink text-accent-text text-sm font-medium shadow-lg flex items-center gap-2 animate-fade-in">
          <span>✅</span>
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}