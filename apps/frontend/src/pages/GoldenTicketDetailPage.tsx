// Single Golden ticket view (user-facing). The bell notification
// deep-links here when an admin resolves or re-resolves a Golden
// ticket; without this page the answer is silently invisible on
// the generic /support/:id page (which doesn't render
// goldenResolutions[]).

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FeatureGate } from '../components/support/FeatureGate';
import { getMyGoldenTicket } from '../components/support/api';
import type { GoldenResolutionPublic, GoldenTicket } from '../components/support/types';
import Spinner from '../components/ui/Spinner';
import { friendlyError } from '../utils/api';

function statusStyles(status: string): { bg: string; text: string; label: string } {
  if (status === 'Resolved') return { bg: 'bg-accent/15', text: 'text-accent', label: 'Resolved' };
  if (status === 'Rejected') return { bg: 'bg-rose-100', text: 'text-rose-800', label: 'Rejected' };
  if (status === 'Pending' || status === 'open') return { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Pending' };
  if (status === 'In Review') return { bg: 'bg-accent/15', text: 'text-accent', label: 'In Review' };
  if (status === 'closed') return { bg: 'bg-stone-100', text: 'text-stone-700', label: 'Closed' };
  return { bg: 'bg-mist', text: 'text-ink-faint', label: status };
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
        <p className="text-sm text-rose-700">{error}</p>
        <Link to="/golden" className="inline-block mt-4 text-sm text-accent hover:underline">
          ← Back to Golden Ticket
        </Link>
      </div>
    );
  }
  if (!ticket) return <div />;

  const s = statusStyles(ticket.status);
  const isResolved = ticket.status === 'Resolved';
  const isRejected = ticket.status === 'Rejected';
  const answers = ticket.goldenResolutions ?? [];
  const inFlight = !isResolved && !isRejected;

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
            <span className="shrink-0 w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center text-lg">
              🎟️
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider ${s.bg} ${s.text}`}>
                  {s.label}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-700">
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
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-4">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-rose-800 mb-1">
              Rejection reason
            </p>
            <p className="text-sm text-rose-900 whitespace-pre-line">{ticket.rejectionReason}</p>
          </div>
        )}

        {/* Pending / open state */}
        {inFlight && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
            <p className="text-sm text-amber-900">
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

        {/* Admin answers thread */}
        <section className="bg-card rounded-2xl border border-border p-5">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-faint mb-3">
            Admin answers ({answers.length})
          </p>
          {answers.length === 0 ? (
            <p className="text-sm text-ink-faint italic">
              No answers yet — you&apos;ll get a notification when the support team posts one.
            </p>
          ) : (
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
          )}
        </section>

        <p className="text-center text-xs text-ink-faint mt-4">
          Need more help? Raise a fresh Golden Ticket — paid SP unlocks a new priority slot.
        </p>
      </div>
    </div>
  );
}

export default function GoldenTicketDetailPage(): React.ReactElement {
  return (
    <FeatureGate featureKey="goldenTicket" featureLabel="Golden Ticket">
      <GoldenTicketDetailInner />
    </FeatureGate>
  );
}
