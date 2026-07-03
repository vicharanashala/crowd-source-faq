// User-facing "My Support Tickets" page. Gated by the feature flag.

import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FeatureGate } from '../components/support/FeatureGate';
import { listSupportRequests, SUPPORT_ISSUE_OPTIONS } from '../components/support/api';
import { getIssueIcon } from '../components/support/icons';
import type { SupportListResponse, SupportStatus } from '../components/support/types';
import Spinner from '../components/ui/Spinner';

const STATUS_STYLES: Record<SupportStatus, string> = {
  'Pending':   'bg-warning/15 text-warning border-warning/30',
  'In Review': 'bg-admin-blue/15 text-admin-blue border-admin-blue/30',
  'Resolved':  'bg-success/15 text-success border-success/30',
  'Rejected':  'bg-danger/15 text-danger border-danger/30',
};

function SupportIndexInner(): React.ReactElement {
  const [data, setData] = useState<SupportListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const q = searchParams.get('q');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listSupportRequests({ limit: 50, q: q || undefined })
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => {
        if (cancelled) return;
        // 404 = feature is off; the gate is the primary signal, but
        // if a user navigates directly while the flag flips, the API
        // also returns 404. Surface a friendlier message.
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 404) {
          navigate('/', { replace: true });
          return;
        }
        setError('Could not load your support requests.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [navigate]);

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
      </div>
    );
  }

  const requests = data?.requests ?? [];
  const summary = data?.summary;
  // Map keyed by string so it works for both the hardcoded categories
  // and admin-defined ones (which the API may return as arbitrary strings).
  const issueByKey = new Map<string, { key: string; label: string; shortLabel: string }>(
    (data?.issueOptions ?? SUPPORT_ISSUE_OPTIONS).map((o) => [o.key, o]),
  );

  return (
    <div data-tour="support-page-content" className="min-h-screen bg-bg">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="mb-6">
          <button
            onClick={() => navigate('/home')}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back
          </button>
        </div>
        <header className="flex items-start justify-between gap-3 mb-6">
          <div>
            <p className="text-[11px] uppercase tracking-wider font-semibold text-accent">Experimental</p>
            <h1 className="font-serif text-2xl sm:text-3xl text-ink mt-1">Support Tickets</h1>
            <p className="text-sm text-ink-soft mt-1">
              Couldn't attend a session? Report it here and we'll help you catch up.
            </p>
          </div>
          <Link
            to="/support/new"
            className="shrink-0 px-4 py-2 rounded-full bg-accent text-accent-text text-sm font-semibold hover:bg-accent-hover transition-colors"
          >
            + New Request
          </Link>
        </header>

        {/* Summary KPIs */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
            <Kpi label="Total"      value={summary.total} />
            <Kpi label="Pending"    value={summary.byStatus['Pending']   ?? 0} tone="warning" />
            <Kpi label="In Review"  value={summary.byStatus['In Review'] ?? 0} tone="info" />
            <Kpi label="Resolved"   value={summary.byStatus['Resolved']  ?? 0} tone="success" />
          </div>
        )}

        {/* List */}
        {requests.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border p-10 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-cream text-ink-faint mb-3">
              {getIssueIcon('other')}
            </div>
            <p className="text-sm font-medium text-ink">No support requests yet</p>
            <p className="text-xs text-ink-soft mt-1">
              When you submit one, it'll appear here with live status updates.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r._id}>
                <Link
                  to={`/support/${r._id}`}
                  className="group block bg-card rounded-2xl border border-border p-4 hover:border-accent/40 hover:shadow-card-hover transition-all"
                >
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 w-9 h-9 rounded-xl bg-cream text-accent flex items-center justify-center group-hover:bg-accent group-hover:text-accent-text transition-colors">
                      {getIssueIcon(r.issueType)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-ink truncate">{r.title}</p>
                        {/* v1.65 — Golden priority badge. Surfaces the
                            user's own Golden-priority status in their
                            ticket list so they can see the SP cost they
                            paid and that the ticket is being escalated. */}
                        {r.isGolden && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wider bg-accent/15 text-accent border-accent/30"
                            title={r.spCost ? `Golden Ticket — ${r.spCost} SP applied` : 'Golden Ticket — admin-promoted, no SP cost'}
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <path d="M12 2 L13.5 10.5 L22 12 L13.5 13.5 L12 22 L10.5 13.5 L2 12 L10.5 10.5 Z" />
                            </svg>
                            Golden
                          </span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wider ${STATUS_STYLES[r.status]}`}>
                          {r.status}
                        </span>
                      </div>
                      <p className="text-xs text-ink-soft mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{issueByKey.get(r.issueType)?.label ?? r.issueLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>Updated {new Date(r.updatedAt).toLocaleDateString()}</span>
                        {r.followUps.length > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{r.followUps.length} {r.followUps.length === 1 ? 'reply' : 'replies'}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <svg className="shrink-0 mt-1.5 text-ink-faint group-hover:text-accent transition-colors"
                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'warning' | 'info' | 'success' }): React.ReactElement {
  const toneClass =
    tone === 'warning' ? 'text-warning' :
    tone === 'info'    ? 'text-admin-blue' :
    tone === 'success' ? 'text-success' :
                         'text-ink';
  return (
    <div className="bg-card rounded-2xl border border-border p-3 text-center">
      <p className={`text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-ink-faint font-semibold mt-0.5">{label}</p>
    </div>
  );
}

export default function SupportIndexPage(): React.ReactElement {
  return (
    <FeatureGate featureKey="sessionSupport" featureLabel="Session Support">
      <SupportIndexInner />
    </FeatureGate>
  );
}
