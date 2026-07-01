// Single-ticket view (user-facing). Shows the status timeline, the
// follow-up thread, and a reply box. Gated by feature flag.

import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FeatureGate } from '../components/support/FeatureGate';
import { getSupportRequest, replyToSupportRequest, SUPPORT_ISSUE_OPTIONS } from '../components/support/api';
import { getIssueIcon } from '../components/support/icons';
import type { SupportRequest, SupportStatus } from '../components/support/types';
import Spinner from '../components/ui/Spinner';
import { friendlyError } from '../utils/api';

const STATUS_STYLES: Record<SupportStatus, string> = {
  'Pending':   'bg-warning/15 text-warning border-warning/30',
  'In Review': 'bg-admin-blue/15 text-admin-blue border-admin-blue/30',
  'Resolved':  'bg-success/15 text-success border-success/30',
  'Rejected':  'bg-danger/15 text-danger border-danger/30',
};

function SupportTicketInner(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [request, setRequest] = useState<SupportRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);

  const load = React.useCallback(async (): Promise<void> => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const r = await getSupportRequest(id);
      setRequest(r);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        // Either the feature is off or this ticket doesn't belong to us
        navigate('/', { replace: true });
        return;
      }
      setError(friendlyError(err, 'Could not load this support request.'));
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { void load(); }, [load]);

  async function handleReply(): Promise<void> {
    if (!request || reply.trim().length === 0) return;
    setSubmittingReply(true);
    try {
      const updated = await replyToSupportRequest(request._id, reply.trim());
      setRequest(updated);
      setReply('');
    } catch (err) {
      setError(friendlyError(err, 'Could not post your reply.'));
    } finally {
      setSubmittingReply(false);
    }
  }

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Spinner size="lg" /></div>;
  }
  if (error) {
    return (
      <div className="max-w-md mx-auto mt-12 text-center">
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  }
  if (!request) return <div />;

  const issueByKey = new Map<string, { key: string; label: string; shortLabel: string }>(
    SUPPORT_ISSUE_OPTIONS.map((o) => [o.key, o]),
  );
  const closed = request.status === 'Resolved' || request.status === 'Rejected';
  const canReply = !closed;

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <button type="button" onClick={() => navigate('/support')} className="text-xs text-ink-soft hover:text-ink mb-4 inline-flex items-center gap-1">
          ← All requests
        </button>

        {/* Header */}
        <div className="bg-card rounded-2xl border border-border p-5 mb-4">
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-10 h-10 rounded-xl bg-cream text-accent flex items-center justify-center">
              {getIssueIcon(request.issueType)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wider ${STATUS_STYLES[request.status]}`}>
                  {request.status}
                </span>
                <span className="text-[10px] text-ink-faint uppercase tracking-wider font-semibold">
                  {issueByKey.get(request.issueType)?.label ?? request.issueLabel}
                </span>
              </div>
              <h1 className="font-serif text-lg text-ink leading-snug">{request.title}</h1>
              <p className="text-[11px] text-ink-faint mt-1">
                Submitted {new Date(request.createdAt).toLocaleString()} · Updated {new Date(request.updatedAt).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Admin note (if any) */}
        {request.adminNote && (
          <div className="bg-admin-blue/5 border border-admin-blue/20 rounded-2xl p-4 mb-4">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-admin-blue mb-1">From the support team</p>
            <p className="text-sm text-ink whitespace-pre-line">{request.adminNote}</p>
          </div>
        )}

        {/* Resolved access */}
        {request.status === 'Resolved' && request.sessionAccessUrl && (
          <div className="bg-success/5 border border-success/20 rounded-2xl p-4 mb-4">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-success mb-1">Recorded session</p>
            <a
              href={request.sessionAccessUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"
            >
              Open recording
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>
        )}

        {/* Original message */}
        <section className="bg-card rounded-2xl border border-border p-5 mb-4">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-faint mb-2">Your message</p>
          <p className="text-sm text-ink whitespace-pre-line">{request.details}</p>
          {request.attemptedSteps.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border/60">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-faint mb-1.5">Steps you tried</p>
              <ul className="space-y-1">
                {request.attemptedSteps.map((s, i) => (
                  <li key={i} className="text-xs text-ink-soft flex items-start gap-1.5">
                    <span className="text-ink-faint">✓</span><span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Follow-up thread */}
        <section className="bg-card rounded-2xl border border-border p-5 mb-4">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-faint mb-3">
            Conversation ({request.followUps.length})
          </p>
          {request.followUps.length === 0 ? (
            <p className="text-sm text-ink-faint italic">No replies yet — you'll get a notification when the support team responds.</p>
          ) : (
            <ul className="space-y-3">
              {request.followUps.map((f) => (
                <li
                  key={f._id}
                  className={`p-3 rounded-xl border ${
                    f.senderRole === 'admin'
                      ? 'bg-admin-blue/5 border-admin-blue/20'
                      : 'bg-cream/40 border-border'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-semibold text-ink">{f.senderName}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider ${
                      f.senderRole === 'admin'
                        ? 'bg-admin-blue/15 text-admin-blue'
                        : 'bg-mist text-ink-soft'
                    }`}>{f.senderRole}</span>
                    {f.requestProof && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider bg-warning/15 text-warning border border-warning/30">
                        Proof requested
                      </span>
                    )}
                    <span className="text-[10px] text-ink-faint ml-auto">{new Date(f.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-ink whitespace-pre-line">{f.message}</p>
                  {f.documents.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {f.documents.map((d, i) => (
                        <li key={i}>
                          <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline inline-flex items-center gap-1">
                            📎 {d.name || 'Attachment'}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Reply box */}
        {canReply && (
          <section className="bg-card rounded-2xl border border-border p-5">
            <label className="text-[10px] uppercase tracking-wider font-semibold text-ink-faint block mb-2">Add a reply</label>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={3}
              placeholder="Reply to the support team…"
              className="w-full px-3 py-2 rounded-xl border border-border bg-cream text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-accent/50 resize-y"
              maxLength={2000}
            />
            <div className="flex items-center justify-between mt-2">
              <p className="text-[11px] text-ink-faint">You'll be notified when the team replies.</p>
              <button
                type="button"
                onClick={handleReply}
                disabled={submittingReply || reply.trim().length === 0}
                className="px-4 py-1.5 rounded-full bg-accent text-accent-text text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent-hover transition-colors"
              >
                {submittingReply ? 'Sending…' : 'Send reply'}
              </button>
            </div>
          </section>
        )}

        {closed && (
          <p className="text-center text-xs text-ink-faint mt-4">
            This request is closed ({request.status}). You can't reply further — open a new request if you need more help.
          </p>
        )}
      </div>
    </div>
  );
}

export default function SupportTicketPage(): React.ReactElement {
  return (
    <FeatureGate featureKey="sessionSupport" featureLabel="Session Support">
      <SupportTicketInner />
    </FeatureGate>
  );
}
