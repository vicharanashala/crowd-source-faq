/**
 * AdminGoldenLogs.tsx — Dedicated Golden Ticket Logs page.
 *
 * v1.71 — Companion to /admin/golden-tickets. Resolved tickets
 * vanish from the queue (the default `status=open` filter
 * excludes them), so without this page admins had no way to find
 * the tickets they'd already resolved and post additional answers.
 *
 * What this page shows:
 *   - Every Golden ticket, regardless of status, scoped to the
 *     active program via the adminApi interceptor.
 *   - For each ticket: the original user query, the full
 *     goldenResolutions[] thread (admin answers), and a
 *     "Send another answer" composer for Resolved tickets.
 *   - Status filter (Pending / Resolved / Rejected / All).
 *   - The page lives at /admin/golden-logs and is reachable from
 *     the AdminSupportLayout nav row, right next to "Golden Queue".
 *
 * SP invariant: every composer here posts via the
 * /admin/golden-tickets/:id/re-resolve endpoint, which the backend
 * has asserted never charges SP. The UI never shows "X SP will be
 * charged" copy.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import adminApi from '../utils/adminApi';

// ─── Types ──────────────────────────────────────────────────────────────

interface GoldenLogsTicket {
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
  resolvedAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string;
  goldenResolutions: GoldenResolution[];
  statusHistory?: Array<{
    status: string;
    note: string;
    updatedByName: string;
    timestamp: string;
  }>;
}

interface GoldenResolution {
  text: string;
  adminId: string;
  adminName: string;
  createdAt: string;
  notificationSent: boolean;
}

interface ListResponse {
  tickets: GoldenLogsTicket[];
  pagination: { total: number; page: number; limit: number; pages: number };
  ticketValidityHours: number;
  banHours: number;
}

// ─── Helpers (copied from AdminGoldenTickets to keep the file
// self-contained — both pages render the same badges) ───────────────────

function StatusBadge({ status }: { status: string }): React.ReactElement {
  const styles: Record<string, string> = {
    Pending: 'bg-warning/10 text-warning',
    'In Review': 'bg-blue-500/10 text-blue-400',
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

// ─── Page ───────────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'open' | 'closed';

export default function AdminGoldenLogs(): React.ReactElement {
  const [searchParams] = useSearchParams();
  const initialStatus = (searchParams.get('status') as StatusFilter | null) ?? 'all';

  const [tickets, setTickets] = useState<GoldenLogsTicket[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const LIMIT = 25;

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = search.trim();
      const url =
        `/admin/golden-tickets?page=${page}&limit=${LIMIT}` +
        (q ? `&q=${encodeURIComponent(q)}` : '') +
        // The list endpoint already accepts `status=open|closed`.
        // `all` → omit the filter so both pools come back.
        (statusFilter === 'all' ? '' : `&status=${statusFilter}`);
      const res = await adminApi.get<ListResponse>(url);
      setTickets(res.data.tickets);
      setPages(res.data.pagination.pages);
      setTotal(res.data.pagination.total);
    } catch (e) {
      setError('Could not load Golden ticket logs.');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    void fetchTickets();
  }, [fetchTickets]);

  useEffect(
    () => () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    },
    []
  );

  const toggleExpanded = useCallback((id: string): void => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const sortedTickets = useMemo(
    () =>
      [...tickets].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [tickets]
  );

  async function sendAnotherAnswer(ticketId: string): Promise<void> {
    const text = (drafts[ticketId] ?? '').trim();
    if (!text) return;
    setSending(ticketId);
    try {
      await adminApi.post(`/admin/golden-tickets/${ticketId}/re-resolve`, { text });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[ticketId];
        return next;
      });
      setNotice('Answer posted. 0 SP charged (user paid once at raise-time). In-app bell only.');
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => setNotice(null), 6000);
      await fetchTickets();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Could not post additional answer.');
    } finally {
      setSending(null);
    }
  }

  // v1.72 — Reopen a Resolved ticket. Status flips back to Pending
  // and the ticket leaves the Golden Logs view (it moves to the
  // Golden Queue). SP is NEVER touched — this is a pure admin
  // workflow action; the user is not notified.
  async function reopenTicket(ticketId: string): Promise<void> {
    if (
      !window.confirm(
        'Reopen this ticket?\n\nThe ticket moves back to the Golden Queue with status "Pending". The previous answers stay in the audit trail but the user is NOT notified — only the next resolve fires the in-app bell.'
      )
    ) {
      return;
    }
    setSending(ticketId);
    try {
      await adminApi.post(`/admin/golden-tickets/${ticketId}/reopen`);
      setNotice(
        'Ticket reopened. It has moved back to the Golden Queue. No SP charged, user not notified.'
      );
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => setNotice(null), 6000);
      await fetchTickets();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Could not reopen ticket.');
    } finally {
      setSending(null);
    }
  }

  // v1.72 — Delete a single prior resolution. Used by admins who
  // reopened a ticket and want to clear stale answers before
  // posting a fresh take. Requires confirmation because the
  // action is irreversible (the audit log entry persists but the
  // answer text is gone).
  async function deleteResolution(ticketId: string, resIdx: number): Promise<void> {
    if (
      !window.confirm(
        `Delete answer #${resIdx + 1}? This cannot be undone (an audit log entry will record what was removed).`
      )
    ) {
      return;
    }
    setSending(ticketId);
    try {
      await adminApi.delete(`/admin/golden-tickets/${ticketId}/resolutions/${resIdx}`);
      setNotice(`Answer #${resIdx + 1} removed.`);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => setNotice(null), 4000);
      await fetchTickets();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Could not delete answer.');
    } finally {
      setSending(null);
    }
  }

  return (
    <div className="space-y-5 max-w-5xl">
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
        <h2 className="text-base font-bold text-ink">Golden ticket logs</h2>
        <p className="text-sm text-ink-faint mt-1">
          Every Golden ticket raised under this program — including resolved and rejected. Click a
          card to read the full thread; resolved tickets accept additional answers (no SP charged,
          in-app bell only).
        </p>
      </header>

      {/* Filter bar */}
      <div className="admin-card-surface p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          {(['all', 'open', 'closed'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setStatusFilter(s);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                statusFilter === s
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-ink-soft hover:text-ink hover:bg-mist/40'
              }`}
            >
              {s === 'all' ? 'All' : s === 'open' ? 'Open' : 'Closed'}
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-[180px]">
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name, email, title, body…"
            className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-ink"
          />
        </div>
        <div className="text-[11px] text-ink-faint whitespace-nowrap">
          {total} ticket{total === 1 ? '' : 's'}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="admin-card-surface p-5 space-y-3 animate-pulse">
              <div className="h-5 w-32 bg-mist rounded" />
              <div className="h-4 w-3/4 bg-mist rounded" />
              <div className="h-4 w-full bg-mist rounded" />
            </div>
          ))}
        </div>
      ) : sortedTickets.length === 0 ? (
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
          <p className="text-sm text-ink-faint font-medium">No Golden tickets yet</p>
          <p className="text-xs text-ink-faint/60 mt-1">
            New Golden tickets will appear here once a user raises one.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedTickets.map((t) => {
            const expanded = expandedIds.has(t._id);
            const isResolved = t.status === 'Resolved';
            const draft = drafts[t._id] ?? '';
            return (
              <div
                key={t._id}
                className="admin-card-surface p-5 hover:border-border-medium transition-colors"
              >
                {/* Header row — clickable to expand */}
                <button
                  type="button"
                  onClick={() => toggleExpanded(t._id)}
                  aria-expanded={expanded}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status={t.status} />
                        {t.spCost > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-accent/10 text-accent">
                            invested {t.spCost} SP
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-mist text-ink-soft">
                          {t.goldenResolutions?.length ?? 0} answer
                          {(t.goldenResolutions?.length ?? 0) === 1 ? '' : 's'}
                        </span>
                        {t.resolvedAt && (
                          <span className="text-[10px] text-ink-faint font-mono">
                            resolved {new Date(t.resolvedAt).toLocaleString()}
                          </span>
                        )}
                        {t.rejectedAt && (
                          <span className="text-[10px] text-danger font-mono">
                            rejected {new Date(t.rejectedAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-ink leading-snug">
                        {t.title || '(no title)'}
                      </p>
                      <p className="text-xs text-ink-faint">
                        {t.user?.name ?? '(unknown user)'} ·{' '}
                        <span className="font-mono text-[10px]">
                          {t.user?._id?.slice(-8) ?? '—'}
                        </span>{' '}
                        · raised {new Date(t.createdAt).toLocaleString()}
                        {t.user && (
                          <>
                            {' '}
                            · <SpBadge sp={t.user.sp} />
                          </>
                        )}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-ink-faint transition-transform duration-200 ${
                        expanded ? 'rotate-90' : ''
                      }`}
                      aria-hidden="true"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </span>
                  </div>
                </button>

                {expanded && (
                  <div className="mt-4 pt-4 border-t border-border space-y-3">
                    {/* Original user query */}
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

                    {/* Rejection reason (if any) */}
                    {t.rejectionReason && (
                      <div className="flex justify-start">
                        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-red-500/10 px-3 py-2 text-sm text-red-900 whitespace-pre-wrap break-words">
                          <p className="text-[10px] uppercase tracking-wider text-red-700 mb-1">
                            Rejection reason
                          </p>
                          {t.rejectionReason}
                        </div>
                      </div>
                    )}

                    {/* Past answers — each rendered with a delete affordance so
                        admins can clear stale answers before posting a
                        fresh take. The button is positioned at the
                        bubble's bottom-right corner so it doesn't
                        shift the bubble text. */}
                    {t.goldenResolutions?.map((r, idx) => (
                      <div key={idx} className="flex justify-end">
                        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-accent/10 px-3 py-2 text-sm text-ink whitespace-pre-wrap break-words relative group">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="text-[10px] uppercase tracking-wider text-accent">
                              {r.adminName} · answer · {new Date(r.createdAt).toLocaleString()}
                            </p>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void deleteResolution(t._id, idx);
                              }}
                              disabled={sending === t._id}
                              title={`Delete answer #${idx + 1}`}
                              aria-label={`Delete answer #${idx + 1} by ${r.adminName}`}
                              className="text-ink-faint hover:text-danger transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6" />
                                <path d="M14 11v6" />
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                              </svg>
                            </button>
                          </div>
                          {r.text}
                        </div>
                      </div>
                    ))}

                    {/* Composer + reopen actions. Only on Resolved
                        tickets — Rejected / closed are terminal.
                        Pending tickets shouldn't appear here (the
                        default filter is closed). */}
                    {isResolved && (
                      <div className="pt-2 space-y-3">
                        <textarea
                          value={draft}
                          onChange={(e) =>
                            setDrafts((prev) => ({ ...prev, [t._id]: e.target.value }))
                          }
                          placeholder="Send another answer (no SP will be charged)…"
                          rows={3}
                          maxLength={2000}
                          className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent/40"
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[10px] text-ink-faint">
                            In-app bell only — no email, no SMS.
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void sendAnotherAnswer(t._id);
                            }}
                            disabled={sending === t._id || !draft.trim()}
                            className="admin-btn-success text-xs px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {sending === t._id ? 'Posting…' : 'Send another answer'}
                          </button>
                        </div>

                        {/* v1.72 — Reopen: moves the ticket back to the
                            Golden Queue. Sits below the composer so
                            admins reach for it after they've
                            finished reviewing the thread. */}
                        <div className="pt-2 border-t border-border">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void reopenTicket(t._id);
                            }}
                            disabled={sending === t._id}
                            className="admin-btn-secondary text-xs px-3 py-1.5 disabled:opacity-50"
                          >
                            {sending === t._id
                              ? 'Reopening…'
                              : 'Reopen ticket → moves to Golden Queue'}
                          </button>
                          <p className="text-[10px] text-ink-faint mt-1.5">
                            No SP charged. User not notified. Previous answers stay in the audit
                            trail.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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
