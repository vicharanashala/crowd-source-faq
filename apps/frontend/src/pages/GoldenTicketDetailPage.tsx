// Single Golden ticket view (user-facing). The bell notification
// deep-links here when an admin resolves or re-resolves a Golden
// ticket; without this page the answer is silently invisible on
// the generic /support/:id page (which doesn't render
// goldenResolutions[]).
//
// v1.74 — also renders the Golden Ticket discussion thread. The
// first admin answer is pinned at the top with a "Prominent
// answer" badge, then any replies from either side render below in
// chronological order. A reply form at the bottom lets the caller
// post inside the 7-day window; after that, the form is replaced
// with a "Discussion closed" notice.

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FeatureGate } from '../components/support/FeatureGate';
import { getMyGoldenTicket, postGoldenDiscussion } from '../components/support/api';
import type {
  GoldenDiscussionEntry,
  GoldenResolutionPublic,
  GoldenTicket,
} from '../components/support/types';
import Spinner from '../components/ui/Spinner';
import { friendlyError } from '../utils/api';
import { getGoldenStatusStyle } from '../styles/style_config';

const DAY_MS = 24 * 60 * 60 * 1000;

/** "3d 4h", "11h 22m", "47m" — used for the "closes in" countdown. */
function formatTimeRemaining(target: Date, now: Date = new Date()): string {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return 'closed';
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function GoldenTicketDetailInner(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<GoldenTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const t = await getMyGoldenTicket(id);
      setTicket(t);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      // 404 = feature is off, or ticket belongs to another user.
      // Either way we don't want to leak existence — bounce home.
      if (status === 404) {
        navigate('/golden', { replace: true });
        return;
      }
      setError(friendlyError(err, 'Could not load this Golden ticket.'));
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="max-w-md mx-auto mt-12 text-center">
        <p className="text-sm text-danger">{error}</p>
        <Link to="/golden" className="inline-block mt-4 text-sm text-accent hover:underline">
          ← Back to Golden Ticket
        </Link>
      </div>
    );
  }
  if (!ticket) return <div />;

  const s = getGoldenStatusStyle(ticket.status);
  const isResolved = ticket.status === 'Resolved';
  const isRejected = ticket.status === 'Rejected';
  const answers = ticket.goldenResolutions ?? [];
  const discussion = ticket.goldenTicketDiscussion ?? [];
  // Split the prominent first-admin answer (pinned at the top) from
  // the chronological reply thread below. Inline `.find`/`.filter`
  // (no useMemo) — the arrays are short and React would warn about
  // hooks called after the early returns above.
  const prominent = discussion.find((d) => d.isProminent) ?? null;
  const replies = discussion.filter((d) => !d.isProminent);
  const closesAt = ticket.discussionClosesAt ? new Date(ticket.discussionClosesAt) : null;
  const inFlight = !isResolved && !isRejected;
  // Only allow the user to reply once the discussion window has
  // been opened by the first admin answer. Before that, the
  // ticket is still in the queue and there's nothing to talk
  // about yet.
  const showReplyForm = ticket.discussionOpen && (isResolved || isRejected);
  const showClosedNotice =
    !!closesAt && !ticket.discussionOpen && (isResolved || isRejected);

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <Link
          to="/golden"
          className="text-xs text-ink-soft hover:text-ink mb-4 inline-flex items-center gap-1"
        >
          ← Back to Golden Ticket
        </Link>

        {/* Header card */}
        <div className="bg-card rounded-2xl border border-border p-5 mb-4">
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-10 h-10 rounded-xl bg-warning/10 text-warning flex items-center justify-center text-lg">
              🎟️
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider ${s.bg} ${s.text}`}>
                  {s.label}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-warning/10 text-warning">
                  🎟️ {ticket.spCost} SP
                </span>
                {answers.length > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-mist text-ink-soft">
                    {answers.length} answer{answers.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              <h1 className="font-serif text-lg text-ink leading-snug">{ticket.title}</h1>
              <p className="text-[11px] text-ink-faint mt-1">
                Submitted {new Date(ticket.createdAt).toLocaleString()}
                {ticket.resolvedAt && ` · Resolved ${new Date(ticket.resolvedAt).toLocaleString()}`}
                {ticket.rejectedAt && ` · Rejected ${new Date(ticket.rejectedAt).toLocaleString()}`}
              </p>
            </div>
          </div>
        </div>

        {/* Rejection reason */}
        {isRejected && ticket.rejectionReason && (
          <div className="bg-danger-light border border-danger/30 rounded-2xl p-4 mb-4">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-danger mb-1">
              Rejection reason
            </p>
            <p className="text-sm text-danger whitespace-pre-line">{ticket.rejectionReason}</p>
          </div>
        )}

        {/* Pending / open state */}
        {inFlight && (
          <div className="bg-warning/10 border border-warning/30 rounded-2xl p-4 mb-4">
            <p className="text-sm text-warning">
              Your ticket is still in the queue. You can track its status from the Escalation Queue on the{' '}
              <Link to="/golden" className="font-semibold underline">Golden Ticket page</Link>.
            </p>
          </div>
        )}

        {/* Original query */}
        <section className="bg-card rounded-2xl border border-border p-5 mb-4">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-faint mb-2">
            Your original query
          </p>
          <p className="text-sm text-ink whitespace-pre-line">{ticket.details}</p>
        </section>

        {/* Admin answers thread — legacy read-only log retained
            for the /admin/golden-logs page compatibility. The
            interactive discussion is the section below. */}
        {answers.length > 0 && (
          <section className="bg-card rounded-2xl border border-border p-5 mb-4">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-faint mb-3">
              Answer history ({answers.length})
            </p>
            <ul className="space-y-3">
              {answers.map((r: GoldenResolutionPublic, idx: number) => (
                <li
                  key={idx}
                  className="flex justify-end"
                >
                  <div className="max-w-[90%] rounded-2xl rounded-tr-sm bg-accent/10 px-3 py-2 text-sm text-ink whitespace-pre-wrap break-words">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-[10px] uppercase tracking-wider text-accent font-semibold">
                        {r.adminName}
                      </p>
                      <p className="text-[10px] text-ink-faint font-mono">
                        {new Date(r.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {r.text}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* v1.74 — Discussion thread. Pinned prominent answer at
            the top, then any replies in chronological order. */}
        {(prominent || replies.length > 0) && (
          <section className="bg-card rounded-2xl border border-border p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-faint">
                Discussion ({discussion.length})
              </p>
              {ticket.discussionOpen && closesAt && (
                <p className="text-[10px] text-ink-faint">
                  Closes in{' '}
                  <span className="font-mono text-ink-soft">
                    {formatTimeRemaining(closesAt)}
                  </span>
                </p>
              )}
            </div>

            {prominent && (
              <div className="mb-4 rounded-2xl border-2 border-accent/30 bg-accent/5 p-4">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-accent text-accent-text uppercase tracking-wider">
                    ⭐ Prominent answer
                  </span>
                  <p className="text-[10px] text-ink-faint font-mono">
                    {new Date(prominent.createdAt).toLocaleString()}
                  </p>
                </div>
                <p className="text-[10px] uppercase tracking-wider text-accent font-semibold mb-1">
                  {prominent.senderName}
                </p>
                <p className="text-sm text-ink whitespace-pre-wrap break-words">
                  {prominent.text}
                </p>
              </div>
            )}

            {replies.length > 0 && (
              <ul className="space-y-3">
                {replies.map((entry, idx) => (
                  <li
                    key={entry._id ?? `${entry.createdAt}-${idx}`}
                    className={`flex ${entry.senderRole === 'admin' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm text-ink whitespace-pre-wrap break-words ${
                        entry.senderRole === 'admin'
                          ? 'rounded-tr-sm bg-accent/10'
                          : 'rounded-tl-sm bg-mist'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p
                          className={`text-[10px] uppercase tracking-wider font-semibold ${
                            entry.senderRole === 'admin' ? 'text-accent' : 'text-ink-soft'
                          }`}
                        >
                          {entry.senderName}
                          <span className="ml-1 normal-case tracking-normal text-ink-faint">
                            ({entry.senderRole === 'admin' ? 'support' : 'you'})
                          </span>
                        </p>
                        <p className="text-[10px] text-ink-faint font-mono">
                          {new Date(entry.createdAt).toLocaleString()}
                        </p>
                      </div>
                      {entry.text}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Reply form (open) or "discussion closed" notice. */}
        {showReplyForm && (
          <DiscussionReplyForm
            ticketId={ticket._id}
            onReplied={(updated) => setTicket(updated)}
          />
        )}
        {showClosedNotice && (
          <section className="bg-card rounded-2xl border border-border p-5 text-center">
            <p className="text-sm font-medium text-ink-soft">🔒 Discussion closed</p>
            <p className="text-xs text-ink-faint mt-1">
              The 7-day reply window ended on{' '}
              <span className="font-mono">
                {closesAt ? closesAt.toLocaleString() : '—'}
              </span>
              . You can still read the thread above, but new replies
              can&apos;t be posted.
            </p>
          </section>
        )}

        <p className="text-center text-xs text-ink-faint mt-4">
          Need more help? Raise a fresh Golden Ticket — paid SP unlocks a new priority slot.
        </p>
      </div>
    </div>
  );
}

/**
 * v1.74 — Reply box for the discussion thread. Both the user
 * (on this page) and an admin viewing the same page can post here;
 * the server's `postGoldenDiscussion` decides the bubble style
 * from the caller's `auth.role`. Free, no SP charge.
 */
function DiscussionReplyForm({
  ticketId,
  onReplied,
}: {
  ticketId: string;
  onReplied: (updated: GoldenTicket) => void;
}): React.ReactElement {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const trimmed = text.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= 2000 && !submitting;

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setErr(null);
    try {
      const updated = await postGoldenDiscussion(ticketId, trimmed);
      onReplied(updated);
      setText('');
    } catch (e) {
      setErr(friendlyError(e, 'Could not post your reply.'));
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, onReplied, ticketId, trimmed]);

  return (
    <section className="bg-card rounded-2xl border border-border p-5 mb-4">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-faint mb-2">
        Add to the discussion
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Share more context or follow up on the answer…"
        maxLength={2000}
        rows={3}
        className="w-full rounded-xl border border-border bg-bg p-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40 resize-y"
      />
      <div className="flex items-center justify-between mt-2">
        <p className="text-[10px] text-ink-faint">
          {trimmed.length}/2000 · no SP charged
        </p>
        <button
          onClick={() => void submit()}
          disabled={!canSubmit}
          className="px-4 py-1.5 rounded-lg bg-accent text-accent-text text-sm font-medium hover:bg-accent-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Posting…' : 'Post reply'}
        </button>
      </div>
      {err && <p className="text-xs text-danger mt-2">{err}</p>}
    </section>
  );
}

export default function GoldenTicketDetailPage(): React.ReactElement {
  return (
    <FeatureGate featureKey="goldenTicket" featureLabel="Golden Ticket">
      <GoldenTicketDetailInner />
    </FeatureGate>
  );
}
