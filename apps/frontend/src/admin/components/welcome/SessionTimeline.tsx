/**
 * SessionTimeline — vertical activity log for one Zoom session.
 *
 * Reads GET /admin/welcome/zoom-sessions/:id/activity (added by
 * the v1.69 Session History change). Pure addition — no existing
 * component is replaced.
 *
 * Each entry renders as a "dot + connector + card" timeline row
 * styled to match Linear/Vercel's quiet, dense, dense-with-detail
 * look. Click "Activate this session" emits back through the
 * `onActivate` callback which the parent wires to the existing
 * activate API.
 */

import React, { useEffect, useState } from 'react';
import adminApi from '../../utils/adminApi';

export interface ActivityEntry {
  _id: string;
  changedBy: { name?: string; email?: string } | string | null;
  entityType: 'zoom_session' | 'zoom_question';
  action:
    | 'create'
    | 'update'
    | 'delete'
    | 'activate'
    | 'archive'
    | 'transcript_upload'
    | 'regenerate'
    | 'switch_active'
    | string;
  timestamp: string | Date;
  previousValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  derived?: boolean;
}

interface Props {
  sessionId: string;
  isActive: boolean;
  /** Optional callback when the admin clicks "Make active". The
   *  parent wires this to the existing activate API so the
   *  Session History change can be safely added without forking
   *  the activate flow. */
  onActivate?: (sessionId: string) => void;
  refreshKey?: string | number;
}

interface ActivityResponse {
  sessionId: string;
  batchId: string | null;
  entries: ActivityEntry[];
}

export default function SessionTimeline({ sessionId, isActive, onActivate, refreshKey }: Props): React.ReactElement {
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        setLoading(true);
        setError(null);
        const res = await adminApi.get<ActivityResponse>(`/admin/welcome/zoom-sessions/${sessionId}/activity`);
        if (!cancelled) setData(res.data);
      } catch (err) {
        if (!cancelled) setError('Could not load activity log.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [sessionId, refreshKey]);

  return (
    <section className="rounded-2xl border border-border bg-[rgb(var(--bg-card-rgb))] shadow-subtle">
      <header className="flex items-start justify-between gap-4 px-6 py-4 border-b border-border/60">
        <div>
          <h3 className="text-sm font-semibold text-ink">Session Activity</h3>
          <p className="text-[11px] text-ink-soft mt-0.5">
            Lifecycle and per-question events for this session. Newest first.
          </p>
        </div>
        {!isActive && onActivate && (
          <button
            type="button"
            onClick={() => onActivate(sessionId)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-accent text-white text-[11px] font-medium hover:bg-accent/90 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Make this the active session
          </button>
        )}
        {isActive && (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-accent/10 text-accent border border-accent/30">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            Currently active
          </span>
        )}
      </header>

      <div className="px-6 py-5">
        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-xs text-red-700">
            {error}
          </div>
        )}
        {loading && (
          <p className="text-xs text-ink-soft text-center py-6">Loading activity…</p>
        )}
        {!loading && data && data.entries.length === 0 && (
          <p className="text-xs text-ink-soft text-center py-6">No activity yet.</p>
        )}
        {!loading && data && data.entries.length > 0 && (
          <ol className="relative space-y-4">
            <span
              aria-hidden
              className="absolute left-[7px] top-2 bottom-2 w-px bg-border"
            />
            {data.entries.map((entry) => (
              <TimelineRow key={entry._id} entry={entry} />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function TimelineRow({ entry }: { entry: ActivityEntry }): React.ReactElement {
  const ts = entry.timestamp instanceof Date ? entry.timestamp : new Date(entry.timestamp);
  const meta = describe(entry);
  const actor = typeof entry.changedBy === 'object' && entry.changedBy
    ? (entry.changedBy.name || entry.changedBy.email || 'system')
    : (entry.changedBy ?? 'system');
  return (
    <li className="relative pl-6">
      <span
        aria-hidden
        className={`absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-[rgb(var(--bg-card-rgb))] ${meta.dot}`}
      />
      <div className="flex items-baseline gap-2">
        <span className={`text-xs font-semibold ${meta.labelClass}`}>{meta.label}</span>
        <span className="text-[10px] text-ink-faint font-mono">{fmtTs(ts)}</span>
        {entry.derived && (
          <span className="text-[9px] uppercase tracking-wider font-bold text-ink-faint px-1.5 py-0.5 rounded border border-border bg-bg/40">
            derived
          </span>
        )}
      </div>
      <p className="text-xs text-ink mt-0.5">{meta.description}</p>
      <p className="text-[10px] text-ink-faint mt-1">
        by <span className="font-mono">{actor}</span>
      </p>
      {entry.previousValue && entry.newValue && (
        <DiffSummary previous={entry.previousValue} next={entry.newValue} />
      )}
    </li>
  );
}

interface MetaOut { label: string; description: string; labelClass: string; dot: string; }

function describe(entry: ActivityEntry): MetaOut {
  const action = entry.action;
  const title = (entry.newValue?.title as string | undefined) ?? (entry.previousValue?.title as string | undefined);
  switch (action) {
    case 'create':
      return {
        label: 'Session created',
        description: title ? `"${title}" was added to this program.` : 'Session added.',
        labelClass: 'text-accent',
        dot: 'bg-accent',
      };
    case 'update':
      return {
        label: 'Settings updated',
        description: `Configuration changed${title ? ` on "${title}"` : ''}.`,
        labelClass: 'text-ink',
        dot: 'bg-ink-faint',
      };
    case 'delete':
      return {
        label: 'Session deleted',
        description: title ? `"${title}" and its pool/attempts were removed.` : 'Session removed.',
        labelClass: 'text-red-600',
        dot: 'bg-red-500',
      };
    case 'switch_active':
      return {
        label: 'Activated',
        description: 'This session became the active onboarding assessment.',
        labelClass: 'text-accent',
        dot: 'bg-accent',
      };
    case 'activate':
      return {
        label: 'Deactivated',
        description: 'Lost active status to a newer session in this program.',
        labelClass: 'text-amber-700',
        dot: 'bg-amber-500',
      };
    case 'transcript_upload':
      return {
        label: 'Transcript ingested',
        description: 'A new transcript was uploaded and chunked for embeddings.',
        labelClass: 'text-ink',
        dot: 'bg-ink-faint',
      };
    case 'regenerate':
      return {
        label: 'Question pool regenerated',
        description: 'AI question generation replaced the existing pool.',
        labelClass: 'text-accent',
        dot: 'bg-accent',
      };
    default:
      return {
        label: action,
        description: '',
        labelClass: 'text-ink',
        dot: 'bg-ink-faint',
      };
  }
}

function DiffSummary({ previous, next }: { previous: Record<string, unknown>; next: Record<string, unknown> }): React.ReactElement | null {
  const keys = Array.from(new Set([...Object.keys(previous), ...Object.keys(next)]))
    .filter((k) => JSON.stringify(previous[k]) !== JSON.stringify(next[k]))
    .slice(0, 4);
  if (keys.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-[10px] font-mono text-ink-soft">
      {keys.map((k) => (
        <li key={k} className="flex gap-2 items-baseline">
          <span className="text-ink-faint">{k}:</span>
          <span className="line-through opacity-60">{summarize(previous[k])}</span>
          <span className="text-ink">→ {summarize(next[k])}</span>
        </li>
      ))}
    </ul>
  );
}

function summarize(v: unknown): string {
  if (v == null) return '∅';
  if (typeof v === 'string') return v.length > 32 ? v.slice(0, 32) + '…' : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v).slice(0, 48); } catch { return '…'; }
}

function fmtTs(d: Date): string {
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
}