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

import { useCallback, useEffect, useState } from 'react';
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
    Pending:   'bg-warning/10 text-warning',
    'In Review': 'bg-blue-500/10 text-blue-400',
    open:      'bg-warning/10 text-warning',
    Resolved:  'bg-success/10 text-success',
    Rejected:  'bg-danger/10 text-danger',
    closed:    'bg-mist text-ink-faint',
  };
  const labels: Record<string, string> = {
    Pending:   'Pending',
    'In Review': 'In Review',
    open:      'Open',
    Resolved:  'Resolved',
    Rejected:  'Rejected',
    closed:    'Closed',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${styles[status] ?? 'bg-mist text-ink-faint'}`}>
      {labels[status] ?? status}
    </span>
  );
}

function TimerBadge({ tr, validityHours }: { tr: GoldenTicket['timeRemaining']; validityHours: number }): React.ReactElement {
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
    <span className={`inline-flex items-center gap-1 text-[10px] font-mono ${tone}`} title={`Ticket validity: ${validityHours}h`}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-3 0v-6A1.5 1.5 0 0 1 12 6zm0 11.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z"/></svg>
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
  const [tickets, setTickets] = useState<GoldenTicket[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [banConfirmId, setBanConfirmId] = useState<string | null>(null);
  const [banReason, setBanReason] = useState('');
  const [rejectConfirmId, setRejectConfirmId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [validityHours, setValidityHours] = useState(48);
  const [banHours, setBanHours] = useState(72);

  const LIMIT = 25;

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.get<ListResponse>(`/admin/golden-tickets?page=${page}&limit=${LIMIT}`);
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
  }, [page]);

  useEffect(() => { void fetchTickets(); }, [fetchTickets]);

  // Auto-refresh every 60s so the time-remaining badges stay fresh
  // and any SP-driven re-sort is reflected without a manual reload.
  useEffect(() => {
    const t = setInterval(() => { void fetchTickets(); }, 60_000);
    return () => clearInterval(t);
  }, [fetchTickets]);

  async function doResolve(id: string): Promise<void> {
    setActionLoading(id);
    try {
      await adminApi.post(`/admin/golden-tickets/${id}/resolve`);
      await fetchTickets();
    } catch (e) {
      setError('Could not resolve ticket.');
    } finally {
      setActionLoading(null);
    }
  }

  async function doReject(id: string, reason: string): Promise<void> {
    setActionLoading(id);
    try {
      const res = await adminApi.post<{ penalty: number }>(`/admin/golden-tickets/${id}/reject`, { reason });
      setRejectConfirmId(null);
      setRejectReason('');
      const p = res.data.penalty;
      if (p > 0) {
        // eslint-disable-next-line no-alert
        window.alert(`Ticket rejected. 1.25x penalty of ${p} SP debited.`);
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
        { reason },
      );
      setBanConfirmId(null);
      setBanReason('');
      // eslint-disable-next-line no-alert
      window.alert(`Ticket banned+rejected. Penalty: ${res.data.penalty} SP. 72h ban until ${new Date(res.data.bannedUntil).toLocaleString()}.`);
      await fetchTickets();
    } catch (e) {
      setError('Could not ban and reject ticket.');
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <header>
        <p className="text-sm text-ink-faint -mt-2">
          Golden tickets live separately from the Support inbox. Sorted by the user's Spurti Points balance — high-priority triage first.
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
          {Array.from({ length: 4 }).map((_, i) => <GoldenTicketCardSkeleton key={i} />)}
        </div>
      ) : tickets.length === 0 ? (
        <div className="admin-empty admin-card-surface rounded-xl border border-border">
          <svg className="mx-auto mb-3 text-ink-faint" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 2l2.4 5 5.6.8-4 3.9.9 5.5L12 14.8 7.1 17.2l.9-5.5-4-3.9 5.6-.8L12 2z"/>
          </svg>
          <p className="text-sm text-ink-faint font-medium">No active Golden tickets</p>
          <p className="text-xs text-ink-faint/60 mt-1">New Golden tickets will appear here automatically.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map(t => {
            const isPending = !['Resolved', 'Rejected', 'closed'].includes(t.status);
            const isRejectModal = rejectConfirmId === t._id;
            const isBanModal = banConfirmId === t._id;
            return (
              <div key={t._id} className="admin-card-surface p-5 hover:border-border-medium transition-colors">
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
                    <p className="text-sm font-semibold text-ink leading-snug">{t.title || '(no title)'}</p>

                    {/* Details preview */}
                    {t.details && (
                      <p className="text-sm text-ink/85 leading-relaxed line-clamp-3">
                        {t.details.length > 240 ? `${t.details.slice(0, 240)}…` : t.details}
                      </p>
                    )}

                    {/* User row */}
                    <div className="flex items-center gap-3 pt-1 flex-wrap text-xs text-ink-faint">
                      <div className="flex items-center gap-1.5">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                          <circle cx="12" cy="7" r="4"/>
                        </svg>
                        <span className="text-ink-soft font-medium">{t.user?.name ?? '(unknown user)'}</span>
                        <span className="text-ink-faint/60 font-mono">·</span>
                        <span className="font-mono text-[10px]" title={t.user?._id}>{t.user?._id?.slice(-8) ?? '—'}</span>
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
                        onClick={() => { void doResolve(t._id); }}
                        disabled={actionLoading === t._id}
                        className="admin-btn-success text-xs px-3 py-1.5"
                      >
                        Approve / Resolve
                      </button>
                      {!isRejectModal && !isBanModal && (
                        <button
                          onClick={() => { setRejectConfirmId(t._id); setRejectReason(''); }}
                          disabled={actionLoading === t._id}
                          className="admin-btn-secondary text-xs px-3 py-1.5"
                        >
                          Reject
                        </button>
                      )}
                      {!isRejectModal && !isBanModal && (
                        <button
                          onClick={() => { setBanConfirmId(t._id); setBanReason(''); }}
                          disabled={actionLoading === t._id}
                          className="admin-btn-danger text-xs px-3 py-1.5"
                        >
                          Ban User + Reject
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Reject inline form */}
                {isRejectModal && (
                  <div className="mt-4 p-4 rounded-lg border border-border bg-bg/50 space-y-3">
                    <p className="text-xs font-semibold text-ink-soft">Reject this ticket?</p>
                    <p className="text-xs text-ink-faint">A 1.25× penalty of <strong>{Math.ceil((t.spCost || 0) * 1.25)} SP</strong> will be debited from the user. The invested {t.spCost} SP stays debited.</p>
                    <textarea
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      placeholder="Reason (optional, shown to user)"
                      rows={2}
                      className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent/40"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { void doReject(t._id, rejectReason); }}
                        disabled={actionLoading === t._id}
                        className="admin-btn-secondary text-xs px-3 py-1.5"
                      >
                        Confirm Reject
                      </button>
                      <button
                        onClick={() => { setRejectConfirmId(null); setRejectReason(''); }}
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
                      The ticket will be rejected and a <strong>{banHours}h content-creation ban</strong> applied.
                      Penalty: <strong>{Math.ceil((t.spCost || 0) * 1.25)} SP</strong> debited + the invested {t.spCost} SP kept.
                      The user can still log in and browse, but cannot raise tickets, post, comment, or upload documents.
                    </p>
                    <textarea
                      value={banReason}
                      onChange={e => setBanReason(e.target.value)}
                      placeholder="Reason (optional, shown to user)"
                      rows={2}
                      className="w-full px-3 py-2 text-sm rounded-md border border-border bg-card text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent/40"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { void doBan(t._id, banReason); }}
                        disabled={actionLoading === t._id}
                        className="admin-btn-danger text-xs px-3 py-1.5"
                      >
                        Confirm Ban + Reject
                      </button>
                      <button
                        onClick={() => { setBanConfirmId(null); setBanReason(''); }}
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

      {/* Pagination */}
      {pages > 1 && (
        <div className="admin-pagination admin-card-surface rounded-xl">
          <span>Page {page} of {pages} · {total} ticket{total === 1 ? '' : 's'}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="admin-pagination-btn">← Prev</button>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages} className="admin-pagination-btn">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
