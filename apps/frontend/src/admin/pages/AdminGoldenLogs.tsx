/**
 * AdminGoldenLogs.tsx — Dedicated Golden Ticket Logs page.
 *
 * v1.71 — Companion to /admin/golden-tickets. Resolved tickets
 * vanish from the queue (the default `status=open` filter
 * excludes them), so without this page admins had no way to find
 * the tickets they'd already resolved and post additional answers.
 *
 * v1.75 — Page is now split into three stacked sections so the
 * admin can triage + post answers without clicking a filter:
 *   - "All"     — every Golden ticket regardless of status
 *   - "Open"    — only Pending / In Review (the live queue)
 *   - "Closed"  — only Resolved / Rejected (the audit log)
 * Each section has its own fetch, count, and Load-more pager so
 * the page size stays bounded even when one bucket grows large.
 *
 * What each card shows:
 *   - The original user query, the full goldenResolutions[] thread
 *     (admin answers), and a "Send another answer" composer for
 *     Resolved tickets.
 *   - Status filter (Pending / Resolved / Rejected / All).
 *   - The page lives at /admin/golden-logs and is reachable from
 *     the AdminSupportLayout nav row, right next to "Golden Queue".
 *
 * SP invariant: every composer here posts via the
 * /admin/golden-tickets/:id/re-resolve endpoint, which the backend
 * has asserted never charges SP. The UI never shows "X SP will be
 * charged" copy.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { adminBtnSecondary, adminBtnSuccess } from '../../styles/style_config';
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

function SpBadge({ sp }: { sp: number }): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-warning/10 text-warning">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2c.5 0 1 .3 1.2.7l1.4 2.8 3.1.5c.6.1.9.8.5 1.3l-2.2 2.1.5 3.1c.1.6-.5 1-1.1.8L12 11.9l-2.7 1.4c-.6.2-1.2-.2-1.1-.8l.5-3.1L6.5 7.3c-.4-.5-.1-1.2.5-1.3l3.1-.5L11.5 2.7c.2-.4.7-.7 1.2-.7z" />
      </svg>
      {sp} SP
    </span>
  );
}

// ─── Ticket card (shared by all three sections) ───────────────────────

interface TicketCardProps {
  ticket: GoldenLogsTicket;
  expanded: boolean;
  onToggle: () => void;
  draft: string;
  onDraftChange: (next: string) => void;
  sending: boolean;
  onSendAnother: () => void;
  onReopen: () => void;
  onDeleteAnswer: (resIdx: number) => void;
}

function TicketCard({
  ticket: t,
  expanded,
  onToggle,
  draft,
  onDraftChange,
  sending,
  onSendAnother,
  onReopen,
  onDeleteAnswer,
}: TicketCardProps): React.ReactElement {
  const isResolved = t.status === 'Resolved';
  return (
    <div className="admin-card-surface p-5 hover:border-border-medium transition-colors">
      {/* Header row — clickable to expand */}
      <button
        type="button"
        onClick={onToggle}
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
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-danger/10 px-3 py-2 text-sm text-danger whitespace-pre-wrap break-words">
                <p className="text-[10px] uppercase tracking-wider text-danger mb-1">
                  Rejection reason
                </p>
                {t.rejectionReason}
              </div>
            </div>
          )}

          {/* Past answers */}
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
                      onDeleteAnswer(idx);
                    }}
                    disabled={sending}
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
              tickets — Rejected / closed are terminal. */}
          {isResolved && (
            <div className="pt-2 space-y-3">
              <textarea
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
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
                    onSendAnother();
                  }}
                  disabled={sending || !draft.trim()}
                  className={`${adminBtnSuccess} text-xs px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {sending ? 'Posting…' : 'Send another answer'}
                </button>
              </div>

              {/* Reopen: moves the ticket back to the Golden Queue. */}
              <div className="pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReopen();
                  }}
                  disabled={sending}
                  className={`${adminBtnSecondary} text-xs px-3 py-1.5 disabled:opacity-50`}
                >
                  {sending
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
}

// ─── Section primitive (one fetch bucket) ──────────────────────────────

type SectionKind = 'all' | 'open' | 'closed';

interface SectionState {
  tickets: GoldenLogsTicket[];
  page: number;
  pages: number;
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

const SECTION_LIMIT = 25;

function initialSection(): SectionState {
  return {
    tickets: [],
    page: 1,
    pages: 1,
    total: 0,
    loading: true,
    loadingMore: false,
    error: null,
  };
}

interface SectionProps {
  title: string;
  /** Endpoint status query value. `null` → omit (the "All" bucket). */
  status: SectionKind;
  state: SectionState;
  expandedIds: Set<string>;
  drafts: Record<string, string>;
  sendingId: string | null;
  onFetchPage: (page: number) => Promise<void>;
  onLoadMore: () => void;
  onToggleExpanded: (id: string) => void;
  onDraftChange: (id: string, text: string) => void;
  onSendAnother: (id: string) => void;
  onReopen: (id: string) => void;
  onDeleteAnswer: (id: string, resIdx: number) => void;
}

function Section({
  title,
  status,
  state,
  expandedIds,
  drafts,
  sendingId,
  onFetchPage,
  onLoadMore,
  onToggleExpanded,
  onDraftChange,
  onSendAnother,
  onReopen,
  onDeleteAnswer,
}: SectionProps): React.ReactElement {
  const empty = !state.loading && state.tickets.length === 0;
  return (
    <section
      aria-label={`Golden tickets — ${title}`}
      data-section={status}
      className="space-y-3"
    >
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">
          {title}
          <span className="ml-2 text-[11px] font-normal text-ink-faint">
            ({state.total} ticket{state.total === 1 ? '' : 's'})
          </span>
        </h3>
        {state.loading && (
          <span className="text-[10px] text-ink-faint">Loading…</span>
        )}
      </header>

      {state.error && (
        <div className="admin-card-surface rounded-lg border border-danger/30 bg-danger-light px-3 py-2 text-xs text-danger">
          {state.error}
        </div>
      )}

      {empty && !state.loading && (
        <div className="admin-empty admin-card-surface rounded-xl border border-border">
          <p className="text-sm text-ink-faint font-medium">No tickets in this section</p>
          <p className="text-xs text-ink-faint/60 mt-1">
            {status === 'open'
              ? 'No Golden tickets are currently in the live queue.'
              : status === 'closed'
              ? 'No Golden tickets have been resolved or rejected yet.'
              : 'No Golden tickets have been raised yet.'}
          </p>
        </div>
      )}

      {state.tickets.map((t) => (
        <TicketCard
          key={`${status}:${t._id}`}
          ticket={t}
          expanded={expandedIds.has(t._id)}
          onToggle={() => onToggleExpanded(t._id)}
          draft={drafts[t._id] ?? ''}
          onDraftChange={(next) => onDraftChange(t._id, next)}
          sending={sendingId === t._id}
          onSendAnother={() => onSendAnother(t._id)}
          onReopen={() => onReopen(t._id)}
          onDeleteAnswer={(idx) => onDeleteAnswer(t._id, idx)}
        />
      ))}

      {state.page < state.pages && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={state.loadingMore}
            className="admin-card-surface px-4 py-1.5 text-xs font-medium text-ink-soft hover:text-ink hover:bg-mist/40 rounded-lg border border-border disabled:opacity-50"
          >
            {state.loadingMore ? 'Loading…' : `Load more (${state.tickets.length}/${state.total})`}
          </button>
        </div>
      )}
    </section>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────

export default function AdminGoldenLogs(): React.ReactElement {
  const [searchParams] = useSearchParams();
  // Back-compat: ?status=open|closed|all scrolls to that section.
  const initialScroll = (searchParams.get('status') as SectionKind | null) ?? null;

  // Three independent sections, each with its own paginated fetch.
  const [allSection, setAllSection] = useState<SectionState>(initialSection);
  const [openSection, setOpenSection] = useState<SectionState>(initialSection);
  const [closedSection, setClosedSection] = useState<SectionState>(initialSection);
  // Expansion + composer drafts are SHARED across sections so an
  // admin can keep typing in one ticket even after it changes
  // section on a refresh (e.g. a Resolved ticket being reopened).
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs so per-section fetchers always see the latest search
  // query without re-binding on every keystroke.
  const searchRef = useRef('');
  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  useEffect(
    () => () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    },
    []
  );

  // Initial-render scroll to a deep-linked section.
  useEffect(() => {
    if (!initialScroll) return;
    // Wait a tick so the DOM nodes exist.
    const t = setTimeout(() => {
      const el = document.querySelector(`[data-section="${initialScroll}"]`);
      if (el && 'scrollIntoView' in el) {
        (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
    return () => clearTimeout(t);
  }, [initialScroll]);

  const buildUrl = useCallback(
    (status: SectionKind, page: number): string => {
      const q = searchRef.current.trim();
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(SECTION_LIMIT));
      // `all` → omit the status filter (backend returns the full
      // set including Resolved / Rejected / closed). `open` and
      // `closed` → drive the backend's filter.
      if (status !== 'all') params.set('status', status);
      if (q) params.set('q', q);
      return `/admin/golden-tickets?${params.toString()}`;
    },
    []
  );

  const fetchSection = useCallback(
    async (status: SectionKind, page: number) => {
      const setSection =
        status === 'all' ? setAllSection : status === 'open' ? setOpenSection : setClosedSection;
      const isFirst = page === 1;
      setSection((prev) => ({
        ...prev,
        loading: isFirst,
        loadingMore: !isFirst,
        error: null,
      }));
      try {
        const res = await adminApi.get<ListResponse>(buildUrl(status, page));
        setSection((prev) => ({
          tickets: isFirst
            ? res.data.tickets
            : [...prev.tickets, ...res.data.tickets],
          page: res.data.pagination.page,
          pages: res.data.pagination.pages,
          total: res.data.pagination.total,
          loading: false,
          loadingMore: false,
          error: null,
        }));
      } catch (e) {
        setSection((prev) => ({
          ...prev,
          loading: false,
          loadingMore: false,
          error: 'Could not load this section. Try again or refresh.',
        }));
      }
    },
    [buildUrl]
  );

  // One initial fetch per section. Re-fetches when the search box
  // changes (debounced via the searchRef pattern above so the
  // endpoint isn't re-bound on every keystroke).
  useEffect(() => {
    void fetchSection('all', 1);
    void fetchSection('open', 1);
    void fetchSection('closed', 1);
  }, [fetchSection, search]);

  const toggleExpanded = useCallback((id: string): void => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDraftChange = useCallback((id: string, text: string): void => {
    setDrafts((prev) => ({ ...prev, [id]: text }));
  }, []);

  async function sendAnotherAnswer(ticketId: string): Promise<void> {
    const text = (drafts[ticketId] ?? '').trim();
    if (!text) return;
    setSendingId(ticketId);
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
      // Refresh all three sections so the new entry + the bumped
      // totals land consistently.
      await Promise.all([
        fetchSection('all', 1),
        fetchSection('open', 1),
        fetchSection('closed', 1),
      ]);
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Could not post additional answer.');
    } finally {
      setSendingId(null);
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
    setSendingId(ticketId);
    try {
      await adminApi.post(`/admin/golden-tickets/${ticketId}/reopen`);
      setNotice(
        'Ticket reopened. It has moved back to the Golden Queue. No SP charged, user not notified.'
      );
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => setNotice(null), 6000);
      await Promise.all([
        fetchSection('all', 1),
        fetchSection('open', 1),
        fetchSection('closed', 1),
      ]);
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Could not reopen ticket.');
    } finally {
      setSendingId(null);
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
    setSendingId(ticketId);
    try {
      await adminApi.delete(`/admin/golden-tickets/${ticketId}/resolutions/${resIdx}`);
      setNotice(`Answer #${resIdx + 1} removed.`);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => setNotice(null), 4000);
      await Promise.all([
        fetchSection('all', 1),
        fetchSection('open', 1),
        fetchSection('closed', 1),
      ]);
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Could not delete answer.');
    } finally {
      setSendingId(null);
    }
  }

  const handleLoadMore = useCallback(
    (status: SectionKind) => {
      const section =
        status === 'all' ? allSection : status === 'open' ? openSection : closedSection;
      if (section.page < section.pages) {
        void fetchSection(status, section.page + 1);
      }
    },
    [allSection, openSection, closedSection, fetchSection]
  );

  return (
    <div className="space-y-6 max-w-5xl">
      {notice && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning"
        >
          {notice}
        </div>
      )}
      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-lg border border-danger/30 bg-danger-light px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      )}

      <header>
        <h2 className="text-base font-bold text-ink">Golden ticket logs</h2>
        <p className="text-sm text-ink-faint mt-1">
          Every Golden ticket raised under this program, grouped into All / Open / Closed
          sections so you can triage the live queue and review history without flipping a
          filter. Click a card to read the full thread; resolved tickets accept additional
          answers (no SP charged, in-app bell only).
        </p>
      </header>

      {/* Search applies to all three sections at once. */}
      <div className="admin-card-surface p-4">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
          placeholder="Search by name, email, title, body… (applies to all sections)"
          className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-ink"
        />
      </div>

      <Section
        title="All"
        status="all"
        state={allSection}
        expandedIds={expandedIds}
        drafts={drafts}
        sendingId={sendingId}
        onFetchPage={async () => undefined}
        onLoadMore={() => handleLoadMore('all')}
        onToggleExpanded={toggleExpanded}
        onDraftChange={handleDraftChange}
        onSendAnother={(id) => void sendAnotherAnswer(id)}
        onReopen={(id) => void reopenTicket(id)}
        onDeleteAnswer={(id, idx) => void deleteResolution(id, idx)}
      />

      <Section
        title="Open"
        status="open"
        state={openSection}
        expandedIds={expandedIds}
        drafts={drafts}
        sendingId={sendingId}
        onFetchPage={async () => undefined}
        onLoadMore={() => handleLoadMore('open')}
        onToggleExpanded={toggleExpanded}
        onDraftChange={handleDraftChange}
        onSendAnother={(id) => void sendAnotherAnswer(id)}
        onReopen={(id) => void reopenTicket(id)}
        onDeleteAnswer={(id, idx) => void deleteResolution(id, idx)}
      />

      <Section
        title="Closed"
        status="closed"
        state={closedSection}
        expandedIds={expandedIds}
        drafts={drafts}
        sendingId={sendingId}
        onFetchPage={async () => undefined}
        onLoadMore={() => handleLoadMore('closed')}
        onToggleExpanded={toggleExpanded}
        onDraftChange={handleDraftChange}
        onSendAnother={(id) => void sendAnotherAnswer(id)}
        onReopen={(id) => void reopenTicket(id)}
        onDeleteAnswer={(id, idx) => void deleteResolution(id, idx)}
      />
    </div>
  );
}
