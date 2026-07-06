/**
 * GoldenHistorySection.tsx — User-facing history segment rendered
 * directly below the live Escalation Queue on /golden.
 *
 * v1.73 — Closes the gap where resolved/rejected Golden tickets
 * vanished from the user's view: admins already had a /admin/golden-
 * logs page, but regular users had no way to revisit their past
 * Golden Tickets, the admin answers, or any bans they picked up
 * along the way. This section is the user-side equivalent.
 *
 * Three tabs:
 *   1. Resolved   — past tickets grouped by status, expandable to
 *                   show the admin answer thread.
 *   2. Banned     — active ban countdown when the user is inside a
 *                   ban window. Empty otherwise (with a "no bans"
 *                   empty state).
 *   3. Activity Log — chronological feed reconstructed server-side
 *                    from each ticket's statusHistory +
 *                    goldenResolutions (newest first).
 *
 * Style matches the surrounding `GoldenTicketPage` cards
 * (cream-bg, ink text, accent borders) rather than the admin logs
 * page — this is a user surface and needs to look consistent with
 * the rest of /golden.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  GoldenActivityEvent,
  GoldenHistoryBanned,
  GoldenHistoryItem,
  GoldenResolutionPublic,
} from './types';

type Tab = 'resolved' | 'banned' | 'activity';

interface Props {
  history: GoldenHistoryItem[];
  banned: GoldenHistoryBanned[];
  activity: GoldenActivityEvent[];
  loading: boolean;
}

function statusBadgeStyles(status: string): { bg: string; text: string; label: string } {
  if (status === 'Resolved') return { bg: 'bg-accent/15', text: 'text-accent', label: 'Resolved' };
  if (status === 'Rejected') return { bg: 'bg-rose-100', text: 'text-rose-800', label: 'Rejected' };
  if (status === 'closed') return { bg: 'bg-stone-100', text: 'text-stone-700', label: 'Closed' };
  if (status === 'Pending' || status === 'open') return { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Pending' };
  if (status === 'In Review') return { bg: 'bg-accent/15', text: 'text-accent', label: 'In Review' };
  return { bg: 'bg-mist', text: 'text-ink-faint', label: status };
}

function statusBadge(status: string): React.ReactElement {
  const s = statusBadgeStyles(status);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function spBadge(sp: number): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-700">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2c.5 0 1 .3 1.2.7l1.4 2.8 3.1.5c.6.1.9.8.5 1.3l-2.2 2.1.5 3.1c.1.6-.5 1-1.1.8L12 11.9l-2.7 1.4c-.6.2-1.2-.2-1.1-.8l.5-3.1L6.5 7.3c-.4-.5-.1-1.2.5-1.3l3.1-.5L11.5 2.7c.2-.4.7-.7 1.2-.7z" />
      </svg>
      {sp} SP
    </span>
  );
}

/** Compact countdown string for an active ban window. */
function banCountdown(bannedUntil: string): { label: string; expired: boolean } {
  const ms = new Date(bannedUntil).getTime() - Date.now();
  if (ms <= 0) return { label: 'expired', expired: true };
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return { label: `${days}d ${hours}h`, expired: false };
  if (hours > 0) return { label: `${hours}h ${mins}m`, expired: false };
  return { label: `${mins}m`, expired: false };
}

function HistoryCard({
  ticket,
  onOpen,
}: {
  ticket: GoldenHistoryItem;
  onOpen: (id: string) => void;
}): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const isResolved = ticket.status === 'Resolved';
  const isRejected = ticket.status === 'Rejected';
  const answers = ticket.goldenResolutions ?? [];

  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
      {/* Header — clickable to expand */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full text-left p-4 hover:bg-mist/30 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              {statusBadge(ticket.status)}
              {spBadge(ticket.spCost)}
              {answers.length > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-mist text-ink-soft">
                  {answers.length} answer{answers.length === 1 ? '' : 's'}
                </span>
              )}
              {ticket.resolvedAt && (
                <span className="text-[10px] text-ink-faint font-mono">
                  resolved {new Date(ticket.resolvedAt).toLocaleString()}
                </span>
              )}
              {ticket.rejectedAt && (
                <span className="text-[10px] text-rose-700 font-mono">
                  rejected {new Date(ticket.rejectedAt).toLocaleString()}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-ink leading-snug line-clamp-1">
              {ticket.title || '(no title)'}
            </p>
          </div>
          <span
            className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-ink-faint transition-transform ${expanded ? 'rotate-90' : ''}`}
            aria-hidden="true"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border">
          {/* Rejection reason */}
          {isRejected && ticket.rejectionReason && (
            <div className="mt-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-900 whitespace-pre-wrap break-words">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-rose-700 mb-1">
                Rejection reason
              </p>
              {ticket.rejectionReason}
            </div>
          )}

          {/* Original query */}
          {ticket.details && (
            <div className="mt-3 rounded-lg bg-mist px-3 py-2 text-sm text-ink whitespace-pre-wrap break-words">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-faint mb-1">
                Your original query
              </p>
              {ticket.details}
            </div>
          )}

          {/* Admin answers (admin bubbles, right-aligned accent) */}
          {answers.length > 0 && (
            <div className="space-y-2 mt-3">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-faint">
                Admin answers ({answers.length})
              </p>
              {answers.map((r: GoldenResolutionPublic, idx: number) => (
                <div key={idx} className="flex justify-end">
                  <div className="max-w-[90%] rounded-2xl rounded-tr-sm bg-accent/10 px-3 py-2 text-sm text-ink whitespace-pre-wrap break-words">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-[10px] uppercase tracking-wider text-accent">
                        {r.adminName} · {new Date(r.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {r.text}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Open-full-page action — Resolved tickets get a "View full" CTA. */}
          {isResolved && (
            <div className="pt-2 border-t border-border/60">
              <button
                type="button"
                onClick={() => onOpen(ticket._id)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
              >
                View full ticket thread →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BannedCard({ ban }: { ban: GoldenHistoryBanned }): React.ReactElement {
  // Live countdown — re-render every minute.
  const [now, setNow] = useState<number>(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const { label, expired } = banCountdown(ban.bannedUntil);
  // Re-derive ms to use `now` for the live read.
  const ms = new Date(ban.bannedUntil).getTime() - now;
  const active = ms > 0;

  return (
    <div className="bg-card border border-rose-200 rounded-2xl p-5 shadow-sm space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-rose-100 border border-rose-300 flex items-center justify-center text-rose-700">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-ink">
            {active ? 'Golden Ticket restriction active' : 'Golden Ticket restriction expired'}
          </p>
          <p className="text-[11px] text-ink-faint">
            Raised while completing your previous ticket. Browse freely; new Golden Tickets unlock when the window passes.
          </p>
        </div>
      </div>
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-2xl font-bold tabular-nums text-rose-700">
          {active ? label : 'unlocked'}
        </span>
        <span className="text-xs text-ink-faint">
          {active ? 'remaining' : 'no longer restricted'}
        </span>
      </div>
      <p className="text-[11px] text-ink-faint font-mono">
        ends {new Date(ban.bannedUntil).toLocaleString()}
      </p>
      {expired && null /* satisfier; keeps `expired` referenced for readability */}
    </div>
  );
}

function ActivityRow({
  event,
  onOpen,
}: {
  event: GoldenActivityEvent;
  onOpen: (id: string) => void;
}): React.ReactElement {
  const icon =
    event.type === 'resolved' || event.type === 're_resolved'
      ? { glyph: '✅', bg: 'bg-accent/15', text: 'text-accent' }
      : event.type === 'rejected'
      ? { glyph: '⛔', bg: 'bg-rose-100', text: 'text-rose-800' }
      : { glyph: '🎟️', bg: 'bg-amber-100', text: 'text-amber-800' };
  const label =
    event.type === 'resolved'
      ? 'Resolved'
      : event.type === 're_resolved'
      ? 'Follow-up answer'
      : event.type === 'rejected'
      ? 'Rejected'
      : 'Ticket raised';
  return (
    <button
      type="button"
      onClick={() => onOpen(event.ticketId)}
      className="w-full text-left flex items-start gap-3 py-3 px-2 hover:bg-mist/40 rounded-lg transition-colors"
    >
      <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm ${icon.bg}`}>
        {icon.glyph}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] uppercase tracking-wider font-bold ${icon.text}`}>
            {label}
          </span>
          <span className="text-[10px] text-ink-faint font-mono">
            {new Date(event.at).toLocaleString()}
          </span>
        </div>
        <p className="text-sm text-ink line-clamp-1 mt-0.5">{event.title}</p>
        {event.details && (
          <p className="text-xs text-ink-soft line-clamp-2 mt-0.5">{event.details}</p>
        )}
      </div>
    </button>
  );
}

export default function GoldenHistorySection({
  history,
  banned,
  activity,
  loading,
}: Props): React.ReactElement {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('resolved');

  // If bans arrive after the user lands here, auto-flip the tab so
  // they see the restriction banner without having to hunt for it.
  useEffect(() => {
    if (banned.length > 0 && tab === 'resolved' && history.length === 0) {
      setTab('banned');
    }
  }, [banned.length, history.length, tab]);

  const counts = useMemo(
    () => ({
      resolved: history.length,
      banned: banned.length,
      activity: activity.length,
    }),
    [history.length, banned.length, activity.length],
  );

  const onOpen = (id: string): void => {
    navigate(`/golden/ticket/${id}`);
  };

  return (
    <section
      data-tour="golden-history-section"
      aria-label="Golden Ticket history"
      className="mt-10"
    >
      <header className="mb-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-lg bg-card border border-border flex items-center justify-center text-accent">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M3 7l5 4 4-6 4 6 5-4-1 11H4L3 7zm0 14h18v2H3v-2z" />
            </svg>
          </div>
          <h2 className="text-lg font-serif tracking-tight text-ink">Golden History</h2>
        </div>
        <p className="text-xs text-ink-soft max-w-2xl">
          Your past Golden Tickets, every admin answer, and any bans you picked up along the way.
          Tap a resolved ticket to read the full thread or jump back into the action.
        </p>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 flex-wrap" role="tablist">
        {(
          [
            { key: 'resolved', label: 'Resolved', count: counts.resolved },
            { key: 'banned', label: 'Banned', count: counts.banned },
            { key: 'activity', label: 'Activity Log', count: counts.activity },
          ] as Array<{ key: Tab; label: string; count: number }>
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
              tab === t.key
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-ink-soft hover:text-ink hover:bg-mist/40'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className="ml-1.5 text-[10px] font-bold">({t.count})</span>
            )}
          </button>
        ))}
        {loading && (
          <span className="ml-2 text-[10px] text-ink-faint italic">Loading…</span>
        )}
      </div>

      {/* Tab body */}
      <div className="space-y-3">
        {tab === 'resolved' && (
          loading && history.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-6 text-sm text-ink-soft">
              Loading your Golden history…
            </div>
          ) : history.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-6 text-center">
              <p className="text-sm text-ink-soft">
                No resolved Golden Tickets yet — once an admin marks one resolved, you can revisit it here.
              </p>
            </div>
          ) : (
            history.map((t) => <HistoryCard key={t._id} ticket={t} onOpen={onOpen} />)
          )
        )}

        {tab === 'banned' && (
          banned.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-6 text-center">
              <p className="text-sm text-ink-soft">
                You haven&apos;t been banned from raising Golden Tickets. Nice.
              </p>
            </div>
          ) : (
            banned.map((b) => <BannedCard key={b.userId + b.bannedUntil} ban={b} />)
          )
        )}

        {tab === 'activity' && (
          loading && activity.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-6 text-sm text-ink-soft">
              Loading your Golden activity…
            </div>
          ) : activity.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-6 text-center">
              <p className="text-sm text-ink-soft">
                No Golden activity yet.
              </p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl p-4 divide-y divide-border/60">
              {activity.map((e, i) => (
                <ActivityRow key={`${e.ticketId}-${e.type}-${e.at}-${i}`} event={e} onOpen={onOpen} />
              ))}
            </div>
          )
        )}
      </div>
    </section>
  );
}
