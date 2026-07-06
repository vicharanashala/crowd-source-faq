/**
 * SessionHistoryPanel — every Zoom session ever created, with the
 * columns the admin needs to triage them at a glance:
 *   - Title, Batch, Created, Meeting date, Status, Attempts,
 *     Pass rate, Question pool size.
 *
 * Pure addition. Reads the same `/admin/welcome/zoom-sessions`
 * endpoint that AdminZoomTab uses, so it stays in sync without any
 * backend changes.
 *
 * Style: Linear/Vercel-ish — quiet borders, status pills, subtle
 * hover, monospace for numbers, no heavy chrome. Fits Yaksha's
 * existing design tokens (`bg-card`, `border`, `text-ink-*`,
 * `shadow-subtle`, etc.).
 */

import React, { useEffect, useMemo, useState } from 'react';
import adminApi from '../../utils/adminApi';

export interface SessionHistoryRow {
  _id: string;
  title: string;
  description?: string;
  duration?: string;
  zoomUrl?: string;
  isActive: boolean;
  batchId?: string;
  batchName?: string | null;
  createdAt: string;
  updatedAt?: string;
  // v1.69 — Session History: meeting date was historically stored
  // ad-hoc on different sessions. New sessions write
  // `meetingDate`; older ones may fall back to `createdAt`.
  meetingDate?: string | null;
  stats?: {
    questionPoolSize: number;
    activeAttempts: number;
    passedToday: number;
    failedToday: number;
    lifetimePassed?: number;
    lifetimeFailed?: number;
    totalAttempts?: number;
    passRate?: number;
  };
}

interface Props {
  onSelect: (sessionId: string) => void;
  selectedId?: string | null;
  /** When true, refreshes whenever the active program changes. */
  refreshKey?: string | number;
}

type StatusFilter = 'all' | 'active' | 'inactive';

export default function SessionHistoryPanel({ onSelect, selectedId, refreshKey }: Props): React.ReactElement {
  const [rows, setRows] = useState<SessionHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        setLoading(true);
        setError(null);
        const res = await adminApi.get<SessionHistoryRow[]>('/admin/welcome/zoom-sessions');
        if (!cancelled) setRows(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        if (!cancelled) setError('Could not load session history.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'active' && !r.isActive) return false;
      if (filter === 'inactive' && r.isActive) return false;
      if (query) {
        const q = query.toLowerCase();
        if (
          !(r.title || '').toLowerCase().includes(q) &&
          !(r.batchName || '').toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [rows, filter, query]);

  const totals = useMemo(() => {
    const totalAttempts = rows.reduce((sum, r) => sum + (r.stats?.totalAttempts ?? 0), 0);
    const totalPassed = rows.reduce((sum, r) => sum + (r.stats?.lifetimePassed ?? 0), 0);
    const activeCount = rows.filter((r) => r.isActive).length;
    const aggregatePassRate = totalAttempts === 0 ? 0
      : Math.round((totalPassed / Math.max(1, rows.reduce((sum, r) => sum + (r.stats?.lifetimePassed ?? 0) + (r.stats?.lifetimeFailed ?? 0), 0))) * 100);
    return { totalAttempts, activeCount, aggregatePassRate };
  }, [rows]);

  return (
    <section className="rounded-2xl border border-border bg-[rgb(var(--bg-card-rgb))] shadow-subtle">
      <header className="flex flex-col gap-4 px-6 pt-6 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-baseline gap-3">
            <h2 className="text-base font-semibold text-ink">Session History</h2>
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
              {rows.length} total · {totals.activeCount} active
            </span>
          </div>
          <p className="text-xs text-ink-soft mt-1">
            Every Zoom session ever created. Click a row to open and edit its configuration.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-border bg-bg/40 px-2 py-1 text-xs">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-faint mr-1.5">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by title or batch"
              className="bg-transparent border-0 outline-none text-xs text-ink placeholder:text-ink-faint min-w-[180px]"
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-bg/40 p-0.5 text-xs">
            {(['all', 'active', 'inactive'] as StatusFilter[]).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setFilter(opt)}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  filter === opt
                    ? 'bg-accent text-white shadow-subtle'
                    : 'text-ink-soft hover:text-ink'
                }`}
              >
                {opt === 'all' ? 'All' : opt === 'active' ? 'Active' : 'Archived'}
              </button>
            ))}
          </div>
        </div>
      </header>

      {error && (
        <div className="mx-6 mb-4 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="border-t border-border/60 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-ink-faint">
              <th className="px-6 py-3 font-bold">Title</th>
              <th className="px-3 py-3 font-bold">Batch</th>
              <th className="px-3 py-3 font-bold">Created</th>
              <th className="px-3 py-3 font-bold">Meeting</th>
              <th className="px-3 py-3 font-bold">Status</th>
              <th className="px-3 py-3 font-bold text-right">Attempts</th>
              <th className="px-3 py-3 font-bold text-right">Pass rate</th>
              <th className="px-3 py-3 font-bold text-right">Pool</th>
              <th className="px-6 py-3 font-bold text-right">Open</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="px-6 py-10 text-center text-xs text-ink-soft">
                  Loading sessions…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center">
                  <p className="text-xs text-ink-soft">
                    {rows.length === 0
                      ? 'No sessions yet. Create one to start tracking history.'
                      : 'No sessions match the current filter.'}
                  </p>
                </td>
              </tr>
            )}
            {!loading && filtered.map((row) => (
              <tr
                key={row._id}
                onClick={() => onSelect(row._id)}
                className={`group cursor-pointer border-t border-border/40 transition-colors ${
                  selectedId === row._id ? 'bg-accent/[0.04]' : 'hover:bg-mist/30'
                }`}
              >
                <td className="px-6 py-3 align-top">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{row.title}</span>
                    {row.isActive && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/30">
                        Active
                      </span>
                    )}
                  </div>
                  {row.description && (
                    <p className="text-[11px] text-ink-soft mt-1 line-clamp-1 max-w-[280px]">{row.description}</p>
                  )}
                </td>
                <td className="px-3 py-3 align-top text-xs text-ink-soft">
                  {row.batchName ?? '—'}
                </td>
                <td className="px-3 py-3 align-top text-xs text-ink-soft font-mono">
                  {fmtDate(row.createdAt)}
                </td>
                <td className="px-3 py-3 align-top text-xs text-ink-soft font-mono">
                  {fmtDate(row.meetingDate ?? row.createdAt)}
                </td>
                <td className="px-3 py-3 align-top">
                  <StatusPill active={row.isActive} attempts={row.stats?.activeAttempts ?? 0} />
                </td>
                <td className="px-3 py-3 align-top text-right">
                  <div className="text-xs font-mono text-ink">{row.stats?.totalAttempts ?? 0}</div>
                  <div className="text-[10px] text-ink-faint">{row.stats?.activeAttempts ?? 0} active</div>
                </td>
                <td className="px-3 py-3 align-top text-right">
                  <div className="text-xs font-mono text-ink">{row.stats?.passRate ?? 0}%</div>
                  <div className="text-[10px] text-ink-faint">
                    {row.stats?.lifetimePassed ?? 0}P / {row.stats?.lifetimeFailed ?? 0}F
                  </div>
                </td>
                <td className="px-3 py-3 align-top text-right text-xs font-mono text-ink">
                  {row.stats?.questionPoolSize ?? 0}
                </td>
                <td className="px-6 py-3 align-top text-right">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSelect(row._id); }}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border text-[11px] font-medium text-ink-soft hover:bg-mist hover:text-ink transition-colors"
                  >
                    Open
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && rows.length > 0 && (
        <footer className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 border-t border-border/60 text-[11px] text-ink-faint">
          <div>
            Aggregate pass rate across all sessions:{' '}
            <span className="font-mono text-ink">{totals.aggregatePassRate}%</span>
          </div>
          <div>
            Total attempts across all sessions:{' '}
            <span className="font-mono text-ink">{totals.totalAttempts}</span>
          </div>
        </footer>
      )}
    </section>
  );
}

function StatusPill({ active, attempts }: { active: boolean; attempts: number }): React.ReactElement {
  if (active) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/30">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
        </span>
        Live{attempts > 0 && <span className="font-mono normal-case tracking-normal text-accent">·{attempts}</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-mist text-ink-soft border border-border">
      Archived
    </span>
  );
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return '—';
  }
}