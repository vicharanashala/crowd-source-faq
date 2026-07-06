/**
 * AdminGoldenTickets.tsx — Golden Ticket admin workflow.
 *
 * v1.66 — Implements the spec in 8 sections:
 *   §1  Dedicated section (this page) — Golden tickets are
 *       hidden from the Support inbox by default.
 *   §2  Priority sort by user's Spurti Points balance desc
 *       (server-side; the list reorders whenever SP changes).
 *   §3  Per-ticket columns: user name, user id, current SP,
 *       ticket content, createdAt, time-remaining (48h ticket
 *       validity), status.
 *   §4  Actions: Approve/Resolve, Reject, Ban User + Reject.
 *   §5  Ban: server sets `goldenBannedUntil = now+72h`. User can
 *       still log in / browse but cannot create content.
 *   §6  48h ticket validity (constant).
 *   §7  No reward on resolve. On reject / ban, 1.25x penalty
 *       debited (OOB spec).
 *   §8  Audit log on every action.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import adminApi from '../utils/adminApi';

interface GoldenTicket {
  _id: string;
  title: string;
  details: string;
  status: string;
  spCost: number;
  userId: string;
  user: {
    _id: string;
    name: string;
    email: string;
    sp: number;
    isBanned: boolean;
    goldenBannedUntil: string | null;
  } | null;
  createdAt: string;
  timeRemaining: { ms: number; label: string; expired: boolean };
  // v1.70 — list endpoint includes the re-resolve trail so the card
  // can render past bubbles inline without a second fetch. Old rows
  // missing the field default to [] on the server.
  goldenResolutions: GoldenResolution[];
}

interface GoldenResolution {
  text: string;
  adminId: string;
  adminName: string;
  createdAt: string;
  notificationSent: boolean;
}

interface ListResponse {
  tickets: GoldenTicket[];
  pagination: { total: number; page: number; limit: number; pages: number };
  ticketValidityHours: number;
  banHours: number;
}

function SpBadge({ sp }: { sp: number }): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-600">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2c.5 0 1 .3 1.2.7l1.4 2.8 3.1.5c.6.1.9.8.5 1.3l-2.2 2.1.5 3.1c.1.6-.5 1-1.1.8L12 11.9l-2.7 1.4c-.6.2-1.2-.2-1.1-.8l.5-3.1L6.5 7.3c-.4-.5-.1-1.2.5-1.3l3.1-.5L11.5 2.7c.2-.4.7-.7 1.2-.7z" />
      </svg>
      {sp} SP
    </span>
  );
}

function StatusBadge({ status }: { status: string }): React.ReactElement {
  const styles: Record<string, string> = {
    Pending: 'bg-warning/10 text-warning',
    'In Review': 'bg-accent/10 text-accent',
    open: 'bg-warning/10 text-warning',
    Resolved: 'bg-success/10 text-success',
    Rejected: 'bg-danger/10 text-danger',
    closed: 'bg-mist text-ink-faint',
  };
  const labels: Record<string, string> = {
    Pending: 'Pending',
    'In Review': 'In Review',
    open: 'Open',
    Resolved: 'Resolved',
    Rejected: 'Rejected',
    closed: 'Closed',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${styles[status] ?? 'bg-mist text-ink-faint'}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

function TimerBadge({
  tr,
  validityHours,
}: {
  tr: GoldenTicket['timeRemaining'];
  validityHours: number;
}): React.ReactElement {
  if (tr.expired) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-danger/10 text-danger">
        expired
      </span>
    );
  }
  const totalHours = tr.ms / (1000 * 60 * 60);
  const pct = Math.max(0, Math.min(100, (totalHours / validityHours) * 100));
  const tone = pct < 20 ? 'text-danger' : pct < 50 ? 'text-warning' : 'text-ink-soft';
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-mono ${tone}`}
      title={`Ticket validity: ${validityHours}h`}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      {tr.label}
    </span>
  );
}

function BanChip({ until }: { until: string | null }): React.ReactElement | null {
  if (!until) return null;
  const exp = new Date(until);
  if (exp.getTime() < Date.now()) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/15 text-red-600">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-3 0v-6A1.5 1.5 0 0 1 12 6zm0 11.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z" />
      </svg>
      banned until {exp.toLocaleString()}
    </span>
  );
}

function GoldenTicketCardSkeleton(): React.ReactElement {
  return (
    <div className="admin-card-surface p-5 space-y-3 animate-pulse">
      <div className="h-5 w-32 bg-mist rounded" />
      <div className="h-4 w-3/4 bg-mist rounded" />
      <div className="h-4 w-full bg-mist rounded" />
    </div>
  );
}

export default function AdminGoldenTickets(): React.ReactElement {
  const [searchParams] = useSearchParams();
  const q = searchParams.get('q') || '';

  const [tickets, setTickets] = useState<GoldenTicket[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // H23: success/info notice (replaces window.alert). Same colour treatment
  // as `error` but tuned for positive info.
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [banConfirmId, setBanConfirmId] = useState<string | null>(null);
  const [banReason, setBanReason] = useState('');
  const [rejectConfirmId, setRejectConfirmId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  // Expanded details — Set of ticket ids whose full message body is
  // currently visible. Default state is collapsed (clamped to ~3
  // lines) so the queue list stays compact; admins tap "Show full
  // message" to read the entire user-typed content. The Set lets
  // multiple cards expand independently without interfering.
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set());
  const toggleDetails = useCallback((id: string): void => {
    setExpandedDetails((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  // v1.70 — logs (resolution thread) expansion. Independent from
  // expandedDetails so admins can keep the user query collapsed
  // while the resolution thread is open, or vice versa.
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const toggleLogs = useCallback((id: string): void => {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  // Re-resolve draft text per ticket. The Set keeps which cards
  // have a pending draft so the button can be enabled only when
  // the textarea has content.
  const [reResolveDrafts, setReResolveDrafts] = useState<Record<string, string>>({});
  const [reResolveSending, setReResolveSending] = useState<string | null>(null);
  // v1.71 — modal-first resolve flow. `resolveModalId` holds the
  // ticket currently being resolved (null when no modal is open).
  // `resolveAnswer` is the textarea content.
  const [resolveModalId, setResolveModalId] = useState<string | null>(null);
  const [resolveAnswer, setResolveAnswer] = useState('');
  const [validityHours, setValidityHours] = useState(48);
  const [banHours, setBanHours] = useState(72);

  const LIMIT = 25;

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.get<ListResponse>(
        `/admin/golden-tickets?page=${page}&limit=${LIMIT}${q ? `&q=${encodeURIComponent(q)}` : ''}`
      );
      setTickets(res.data.tickets);
      setPages(res.data.pagination.pages);
      setTotal(res.data.pagination.total);
      setValidityHours(res.data.ticketValidityHours);
      setBanHours(res.data.banHours);
    } catch (e) {
      setError('Could not load Golden tickets.');
    } finally {
      setLoading(false);
    }
  }, [page, q]);

  useEffect(() => {
    void fetchTickets();
  }, [fetchTickets]);

  // Auto-refresh every 60s so the time-remaining badges stay fresh
  // and any SP-driven re-sort is reflected without a manual reload.
  useEffect(() => {
    const t = setInterval(() => {
      void fetchTickets();
    }, 60_000);
    return () => clearInterval(t);
  }, [fetchTickets]);

  // v1.71 — modal-first resolve. The admin types the answer BEFORE
  // the ticket flips to Resolved; both happen in one POST. SP is
  // never charged again. Empty text is allowed (the ticket can
  // resolve without a written answer if the admin prefers).
  async function doResolveWithAnswer(id: string, text: string): Promise<void> {
    setActionLoading(id);
    try {
      await adminApi.post(`/admin/golden-tickets/${id}/resolve`, {
        text: text.trim(),
      });
      setResolveModalId(null);
      setResolveAnswer('');
      setNotice(
        text.trim()
          ? 'Ticket resolved and answer posted. SP was not charged again. Find this ticket in Golden Logs.'
          : 'Ticket resolved. SP was not charged again. Find this ticket in Golden Logs.'
      );
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => setNotice(null), 6000);
      await fetchTickets();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Could not resolve ticket.');
    } finally {
      setActionLoading(null);
    }
  }

  async function doReject(id: string, reason: string): Promise<void> {
    setActionLoading(id);
    try {
      const res = await adminApi.post<{ penalty: number }>(`/admin/golden-tickets/${id}/reject`, {
        reason,
      });
      setRejectConfirmId(null);
      setRejectReason('');
      const p = res.data.penalty;
      if (p > 0) {
        // H23: replaced window.alert with inline notice banner.
        setNotice(`Ticket rejected. 1.25x penalty of ${p} SP debited.`);
        if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = setTimeout(() => setNotice(null), 5000);
      }
      await fetchTickets();
    } catch (e) {
      setError('Could not reject ticket.');
    } finally {
      setActionLoading(null);
    }
  }

  async function doBan(id: string, reason: string): Promise<void> {
    setActionLoading(id);
    try {
      const res = await adminApi.post<{ penalty: number; bannedUntil: string }>(
        `/admin/golden-tickets/${id}/ban`,
        { reason }
      );
      setBanConfirmId(null);
      setBanReason('');
      // H23: replaced window.alert with inline notice banner.
      setNotice(
        `Ticket banned+rejected. Penalty: ${res.data.penalty} SP. 72h ban until ${new Date(res.data.bannedUntil).toLocaleString()}.`
      );
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => setNotice(null), 5000);
      await fetchTickets();
    } catch (e) {
      setError('Could not ban and reject ticket.');
    } finally {
      setActionLoading(null);
    }
  }

  // v1.70 — re-resolve. Append an additional admin answer to an
  // already-Resolved Golden ticket. SP is NOT charged again (the
  // user paid at raise-time); the user gets exactly one in-app bell
  // notification per entry, no email/SMS.
  async function doReResolve(id: string, text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Answer text cannot be empty.');
      return;
    }
    setReResolveSending(id);
    try {
      const res = await adminApi.post<{
        ok: boolean;
        noSpCharged: boolean;
        entry: { text: string; adminName: string; createdAt: string };
      }>(`/admin/golden-tickets/${id}/re-resolve`, { text: trimmed });
      // Clear the draft and confirm via the existing notice banner.
      setReResolveDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setNotice(
        `Answer posted. 0 SP charged (user paid once at raise-time). The user was notified via in-app bell only.`
      );
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => setNotice(null), 5000);
      void res; // silence unused warning when only the side-effect matters
      await fetchTickets();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Could not post additional answer.');
    } finally {
      setReResolveSending(null);
    }
  }

  // Cleanup notice timer on unmount.
  useEffect(
    () => () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    },
    []
  );

  return (
    <div className="space-y-5 max-w-5xl">
      {/* H23 — success/info notice banner (replaces window.alert). */}
      {notice && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {notice}
        </div>
      )}
      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          {error}
        </div>
      )}
      <header>
        <p className="text-sm text-ink-faint -mt-2">
          Golden tickets live separately from the Support inbox. Sorted by the user's Spurti Points
          balance — high-priority triage first.
        </p>
      </header>

      {/* Spec banner — links to the rules */}
      <div className="admin-card-surface p-4 flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full font-semibold bg-amber-500/10 text-amber-600">
            {validityHours}h
          </span>
          <span className="text-ink-faint">ticket validity</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full font-semibold bg-red-500/10 text-red-600">
            {banHours}h
          </span>
          <span className="text-ink-faint">ban duration (Ban User + Reject)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full font-semibold bg-accent/10 text-accent">
            1.25× SP
          </span>
          <span className="text-ink-faint">penalty on reject / ban</span>
        </div>
      </div>

      {error && (
        <div className="admin-card-surface p-3 text-sm text-danger border border-danger/30 bg-danger/5 rounded-lg">
          {error}
        </div>
      )}

      {/* Ticket list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <GoldenTicketCardSkeleton key={i} />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <div className="admin-empty admin-card-surface rounded-xl border border-border">
          <svg
            className="mx-auto mb-3 text-ink-faint"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M12 2l2.4 5 5.6.8-4 3.9.9 5.5L12 14.8 7.1 17.2l.9-5.5-4-3.9 5.6-.8L12 2z" />
          </svg>
          <p className="text-sm text-ink-faint font-medium">No active Golden tickets</p>
          <p className="text-xs text-ink-faint/60 mt-1">
            New Golden tickets will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => {
            const isPending = !['Resolved', 'Rejected', 'closed'].includes(t.status);
            const isRejectModal = rejectConfirmId === t._id;
            const isBanModal = banConfirmId === t._id;
            return (
              <div
                key={t._id}
                className="admin-card-surface p-5 hover:border-border-medium transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-2.5">
                    {/* Badges row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={t.status} />
                      {t.spCost > 0 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-accent/10 text-accent">
                          invested {t.spCost} SP
                        </span>
                      )}
                      <TimerBadge tr={t.timeRemaining} validityHours={validityHours} />
                      {t.user && <BanChip until={t.user.goldenBannedUntil} />}
                    </div>

                    {/* Title */}
                    <p className="text-sm font-semibold text-ink leading-snug">
                      {t.title || '(no title)'}
                    </p>

                    {/* Details — collapsible. Default is collapsed (3-line
                        clamp) so the queue list stays compact; admins tap
                        "Show full message" to read the entire user-typed
                        body. Newlines + whitespace are preserved so
                        multi-paragraph messages render the way the user
                        typed them. */}
                    {t.details &&
                      (() => {
                        const expanded = expandedDetails.has(t._id);
                        return (
                          <div className="space-y-1.5">
                            <p
                              className={`text-sm text-ink/85 leading-relaxed whitespace-pre-wrap break-words ${
                                expanded ? '' : 'line-clamp-3'
                              }`}
                            >
                              {t.details}
                            </p>
                            <button
                              type="button"
                              onClick={() => toggleDetails(t._id)}
                              aria-expanded={expanded}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:text-accent/80 transition-colors"
                            >
                              {expanded ? (
                                <>
                                  <svg
                                    width="11"
                                    height="11"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    aria-hidden="true"
                                  >
                                    <polyline points="18 15 12 9 6 15" />
                                  </svg>
                                  Show less
                                </>
                              ) : (
                                <>
                                  <svg
                                    width="11"
                                    height="11"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    aria-hidden="true"
                                  >
                                    <polyline points="6 9 12 15 18 9" />
                                  </svg>
                                  Show full message
                                </>
                              )}
                            </button>
                          </div>
                        );
                      })()}

                    {/* User row */}
                    <div className="flex items-center gap-3 pt-1 flex-wrap text-xs text-ink-faint">
                      <div className="flex items-center gap-1.5">
                        <svg
                          width="11"
                          height="11"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="shrink-0"
                        >
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                        <span className="text-ink-soft font-medium">
                          {t.user?.name ?? '(unknown user)'}
                        </span>
                        <span className="text-ink-faint/60 font-mono">·</span>
                        <span className="font-mono text-[10px]" title={t.user?._id}>
                          {t.user?._id?.slice(-8) ?? '—'}
                        </span>
                      </div>
                      {t.user && <SpBadge sp={t.user.sp} />}
                      <span className="text-ink-faint/60">·</span>
                      <span>raised {new Date(t.createdAt).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  {isPending && (
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        onClick={() => {
                          // v1.71 — modal-first resolve: open the
                          // answer modal so the admin types their
                          // response before the ticket is marked
                          // Resolved. Tickets disappear from the
                          // queue on resolve, so the answer has to
                          // be captured here (otherwise the admin
                          // can't find the ticket again to type
                          // anything).
                          setResolveModalId(t._id);
                          setResolveAnswer('');
                        }}
                        disabled={actionLoading === t._id}
                        className="admin-btn-success text-xs px-3 py-1.5"
                      >
                        Approve / Resolve
                      </button>
                      {!isRejectModal && !isBanModal && (
                        <button
                          onClick={() => {
                            setRejectConfirmId(t._id);
                            setRejectReason('');
                          }}
                          disabled={actionLoading === t._id}
                          className="admin-btn-secondary text-xs px-3 py-1.5"
                        >
                          Reject
                        </button>
                      )}
                      {!isRejectModal && !isBanModal && (
                        <button
                          onClick={() => {
                            setBanConfirmId(t._id);
                            setBanReason('');
                          }}
                          disabled={actionLoading === t._id}
                          className="admin-btn-danger text-xs px-3 py-1.5"
                        >
                          Ban User + Reject
                        </button>
                      )}
                    </div>
                  )}
                  {/* v1.70 — Resolved tickets get a "View logs / Re-resolve"
                      action button on the right rail. Rejected / closed
                      tickets stay read-only (terminal state). */}
                  {t.status === 'Resolved' && (
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        onClick={() => toggleLogs(t._id)}
                        aria-expanded={expandedLogs.has(t._id)}
                        className="admin-btn-secondary text-xs px-3 py-1.5"
                      >
                        {expandedLogs.has(t._id) ? 'Hide logs' : 'View logs'}
                      </button>
                    </div>
                  )}
                </div>

                {/* v1.70 — Resolution thread (logs + re-resolve input).
                    Visible on Resolved tickets only when the admin clicks
                    "View logs". Shows the original user query as a
                    left-aligned read-only bubble, then every past
                    resolution as a right-aligned admin bubble, then a
                    textarea for posting another answer. SP is never
                    charged; the user gets a single in-app bell per
                    answer. */}
                {t.status === 'Resolved' && expandedLogs.has(t._id) && (
                  <div className="mt-4 p-4 rounded-lg border border-border bg-bg/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-ink-soft">
                        Resolution thread ({t.goldenResolutions?.length ?? 0} follow-up
                        {t.goldenResolutions?.length === 1 ? '' : 's'})
                      </p>
                      <span className="text-[10px] font-mono text-ink-faint">
                        SP charged once at raise · 0 SP per follow-up
                      </span>
                    </div>

                    {/* Original user query — read-only bubble (left). */}
                    {t.details && (
                      <div className="flex justify-start">
                        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-mist px-3 py-2 text-sm text-ink whitespace-pre-wrap break-words">
                          <p className="text-[10px] uppercase tracking-wider text-ink-faint mb-1">
                            {t.user?.name ?? 'User'} · original query
                          </p>
                          {t.details}
                        </div>
                      </div>
                    )}

                    {/* Past re-resolutions — admin bubbles (right). */}
                    {t.goldenResolutions?.map((r, idx) => (
                      <div key={idx} className="flex justify-end">
                        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-accent/10 px-3 py-2 text-sm text-ink whitespace-pre-wrap break-words">
                          <p className="text-[10px] uppercase tracking-wider text-accent mb-1">
                            {r.adminName} · follow-up · {new Date(r.createdAt).toLocaleString()}
                          </p>
                          {r.text}
                        </div>
                      </div>
                    ))}

                    {/* Re-resolve composer. */}
                    <div className="pt-1 space-y-2">
                      <textarea
                        value={reResolveDrafts[t._id] ?? ''}
                        onChange={(e) =>
                          setReResolveDrafts((prev) => ({ ...prev, [t._id]: e.target.value }))
                        }
                        placeholder="Send another answer (no SP will be charged)…"
                        rows={3}
                        maxLength={2000}
                        className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent/40"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-ink-faint">
                          The user will get exactly one in-app bell notification. No email, no SMS.
                        </span>
                        <button
                          onClick={() => {
                            const text = reResolveDrafts[t._id] ?? '';
                            void doReResolve(t._id, text);
                          }}
                          disabled={
                            reResolveSending === t._id || !(reResolveDrafts[t._id] ?? '').trim()
                          }
                          className="admin-btn-success text-xs px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {reResolveSending === t._id ? 'Posting…' : 'Send another answer'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Reject inline form */}
                {isRejectModal && (
                  <div className="mt-4 p-4 rounded-lg border border-border bg-bg/50 space-y-3">
                    <p className="text-xs font-semibold text-ink-soft">Reject this ticket?</p>
                    <p className="text-xs text-ink-faint">
                      A 1.25× penalty of <strong>{Math.ceil((t.spCost || 0) * 1.25)} SP</strong>{' '}
                      will be debited from the user. The invested {t.spCost} SP stays debited.
                    </p>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Reason (optional, shown to user)"
                      rows={2}
                      className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent/40"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          void doReject(t._id, rejectReason);
                        }}
                        disabled={actionLoading === t._id}
                        className="admin-btn-secondary text-xs px-3 py-1.5"
                      >
                        Confirm Reject
                      </button>
                      <button
                        onClick={() => {
                          setRejectConfirmId(null);
                          setRejectReason('');
                        }}
                        disabled={actionLoading === t._id}
                        className="text-xs px-3 py-1.5 rounded-md text-ink-faint hover:text-ink transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Ban inline form */}
                {isBanModal && (
                  <div className="mt-4 p-4 rounded-lg border border-red-500/30 bg-red-500/5 space-y-3">
                    <p className="text-xs font-semibold text-red-600">Ban User + Reject?</p>
                    <p className="text-xs text-ink-faint">
                      The ticket will be rejected and a{' '}
                      <strong>{banHours}h content-creation ban</strong> applied. Penalty:{' '}
                      <strong>{Math.ceil((t.spCost || 0) * 1.25)} SP</strong> debited + the invested{' '}
                      {t.spCost} SP kept. The user can still log in and browse, but cannot raise
                      tickets, post, comment, or upload documents.
                    </p>
                    <textarea
                      value={banReason}
                      onChange={(e) => setBanReason(e.target.value)}
                      placeholder="Reason (optional, shown to user)"
                      rows={2}
                      className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent/40"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          void doBan(t._id, banReason);
                        }}
                        disabled={actionLoading === t._id}
                        className="admin-btn-danger text-xs px-3 py-1.5"
                      >
                        Confirm Ban + Reject
                      </button>
                      <button
                        onClick={() => {
                          setBanConfirmId(null);
                          setBanReason('');
                        }}
                        disabled={actionLoading === t._id}
                        className="text-xs px-3 py-1.5 rounded-md text-ink-faint hover:text-ink transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* v1.71 — Resolve-with-answer modal. Triggered by clicking
          "Approve / Resolve" on a Pending card. The admin types the
          answer first; on submit the ticket flips to Resolved AND
          the answer is stored as the first goldenResolutions[] entry
          (so the /admin/golden-logs page has it to display). Empty
          text is allowed — that just resolves without a written
          answer. SP is never charged. */}
      {resolveModalId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            // Backdrop click cancels the modal — same UX as the
            // existing reject/ban modals. Esc handled below.
            if (e.target === e.currentTarget) {
              setResolveModalId(null);
              setResolveAnswer('');
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="resolve-modal-title"
        >
          <div
            className="admin-card-surface rounded-xl w-full max-w-lg p-5 space-y-4"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setResolveModalId(null);
                setResolveAnswer('');
              }
            }}
          >
            <div>
              <h3 id="resolve-modal-title" className="text-base font-bold text-ink">
                Resolve Golden ticket
              </h3>
              <p className="text-xs text-ink-faint mt-1">
                Type your answer to the user. The ticket moves from{' '}
                <span className="font-mono">Pending</span> to{' '}
                <span className="font-mono">Resolved</span> on submit. SP is <strong>not</strong>{' '}
                charged again — the user paid once at raise-time. You'll find the ticket in{' '}
                <a
                  href="/admin/golden-logs"
                  className="text-accent underline"
                  onClick={(e) => {
                    // Let the modal close naturally; just navigate.
                    e.preventDefault();
                    setResolveModalId(null);
                    setResolveAnswer('');
                    window.location.assign('/admin/golden-logs');
                  }}
                >
                  Golden Logs
                </a>{' '}
                after this.
              </p>
            </div>
            <textarea
              autoFocus
              value={resolveAnswer}
              onChange={(e) => setResolveAnswer(e.target.value)}
              placeholder="Answer the user's question…"
              rows={6}
              maxLength={2000}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent/40"
            />
            <div className="flex items-center justify-between text-[11px] text-ink-faint">
              <span>{resolveAnswer.length}/2000</span>
              <span>
                {resolveAnswer.trim().length === 0
                  ? 'Empty answer allowed — ticket will still resolve'
                  : `${resolveAnswer.trim().length} chars will be sent`}
              </span>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setResolveModalId(null);
                  setResolveAnswer('');
                }}
                disabled={actionLoading === resolveModalId}
                className="text-xs px-3 py-1.5 rounded-md text-ink-faint hover:text-ink transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (resolveModalId) {
                    void doResolveWithAnswer(resolveModalId, resolveAnswer);
                  }
                }}
                disabled={actionLoading === resolveModalId}
                className="admin-btn-success text-xs px-3 py-1.5 disabled:opacity-50"
              >
                {actionLoading === resolveModalId ? 'Resolving…' : 'Confirm Resolve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="admin-pagination admin-card-surface rounded-xl">
          <span>
            Page {page} of {pages} · {total} ticket{total === 1 ? '' : 's'}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="admin-pagination-btn"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages}
              className="admin-pagination-btn"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
