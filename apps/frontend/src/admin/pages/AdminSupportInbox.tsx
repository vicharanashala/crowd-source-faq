// Admin Support Inbox — filterable list of all support tickets with a
// summary header. Admin/moderator only. NOT gated by the feature
// flag — admins should be able to inspect the feature even when it's
// disabled.

import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listSupportRequests, SUPPORT_ISSUE_OPTIONS } from '../../components/support/api';
import { getIssueIcon } from '../../components/support/icons';
import type { SupportListResponse, SupportStatus } from '../../components/support/types';


const STATUSES: (SupportStatus | '')[] = ['', 'Pending', 'In Review', 'Resolved', 'Rejected'];

function InboxInner(): React.ReactElement {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<SupportListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const status = params.get('status') ?? '';
  const issueType = params.get('issueType') ?? '';
  const userName = params.get('userName') ?? '';
  const email = params.get('email') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const q = params.get('q') ?? '';
  // v1.65 — Golden filter. '' = show all, 'true' = only Golden,
  // 'false' = only non-Golden. Backed by the new
  // `?isGolden=true|false` query param on GET /api/support/requests.
  const isGolden = params.get('isGolden') ?? '';
  const page = parseInt(params.get('page') ?? '1', 10) || 1;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listSupportRequests({
      status: (status || undefined) as SupportStatus | undefined,
      issueType: (issueType || undefined) as 'internet' | 'camera' | 'microphone' | 'device' | 'power' | 'other' | undefined,
      userName: userName || undefined,
      // v1.65 — pass the Golden filter through to the API. Coerce
      // to undefined for the "all" case so the URL param is omitted.
      isGolden: isGolden === 'true' ? true : isGolden === 'false' ? false : undefined,
      email: email || undefined,
      from: from || undefined,
      to: to || undefined,
      q: q || undefined,
      page,
      limit: 25,
    })
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError('Could not load support requests.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [status, issueType, userName, email, from, to, q, page]);

  function setParam(key: string, value: string): void {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page'); // reset to page 1 on filter change
    setParams(next, { replace: true });
  }

  const summary = data?.summary;
  const requests = data?.requests ?? [];
  const pages = data?.pagination.pages ?? 1;

  return (
    <div className="space-y-5">
      <header className="flex items-baseline justify-between">
        <div>
          <p className="text-sm text-ink-faint -mt-2">All session support requests across users.</p>
        </div>
        <Link to="/admin/support/analytics" className="text-xs text-accent hover:underline">
          View analytics →
        </Link>
      </header>

      {/* Summary KPI row */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Kpi label="Total"      value={summary.total} />
          <Kpi label="Pending"    value={summary.byStatus['Pending']   ?? 0} tone="warning" />
          <Kpi label="In Review"  value={summary.byStatus['In Review'] ?? 0} tone="info" />
          <Kpi label="Resolved"   value={summary.byStatus['Resolved']  ?? 0} tone="success" />
          <Kpi label="Rejected"   value={summary.byStatus['Rejected']  ?? 0} tone="danger" />
        </div>
      )}

      {/* Filter row */}
      <div className="flex flex-wrap gap-2">
        <select value={status} onChange={(e) => setParam('status', e.target.value)} className="admin-select">
          {STATUSES.map((s) => <option key={s} value={s}>{s ? s : 'All Status'}</option>)}
        </select>
        <select value={issueType} onChange={(e) => setParam('issueType', e.target.value)} className="admin-select">
          <option value="">All Issue Types</option>
          {SUPPORT_ISSUE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => setParam('from', e.target.value)}
          className="admin-search-input w-36"
          title="From date"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setParam('to', e.target.value)}
          className="admin-search-input w-36"
          title="To date"
        />
      </div>

      {/* Table */}
      <div className="admin-table-wrap">
        {loading ? (
          <div className="p-8 text-center text-xs text-ink-faint">Loading…</div>
        ) : error ? (
          <div className="p-8 text-center text-xs text-danger">{error}</div>
        ) : requests.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-soft">No support requests match your filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="admin-thead-row">
                <th className="admin-th">Title</th>
                <th className="admin-th">User</th>
                <th className="admin-th">Issue</th>
                <th className="admin-th">Status</th>
                <th className="admin-th">Replies</th>
                <th className="admin-th">Updated</th>
              </tr></thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r._id} className="admin-tr">
                    <td className="admin-td max-w-[260px]">
                      <Link to={`/admin/support/${r._id}`} className="text-ink hover:text-accent">
                        <span className="block truncate font-medium" title={r.title}>{r.title}</span>
                      </Link>
                    </td>
                    <td className="admin-td">
                      <p className="text-xs text-ink truncate max-w-[180px]" title={r.userName}>{r.userName}</p>
                      <p className="text-[10px] text-ink-faint truncate max-w-[180px]" title={r.userEmail}>{r.userEmail}</p>
                    </td>
                    <td className="admin-td">
                      <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
                        <span className="text-accent">{getIssueIcon(r.issueType)}</span>
                        {SUPPORT_ISSUE_OPTIONS.find((o) => o.key === r.issueType)?.shortLabel ?? r.issueLabel}
                      </span>
                    </td>
                    <td className="admin-td">
                      <div className="flex flex-col gap-1 items-start">
                        {/* v1.65 — Golden badge. Surfaces the new
                            isGolden flag in the inbox so admins can
                            spot priority tickets at a glance. The
                            Sage accent matches the navbar SP chip
                            so users learn the visual language once. */}
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
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wider ${statusStyle(r.status)}`}>
                          {r.status}
                        </span>
                      </div>
                    </td>
                    <td className="admin-td text-ink-faint tabular-nums">{r.followUps.length}</td>
                    <td className="admin-td text-ink-faint">{new Date(r.updatedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="admin-pagination">
            <span>Page {page} of {pages} · {data?.pagination.total ?? 0} results</span>
            <div className="flex gap-1">
              <button
                onClick={() => setParam('page', String(Math.max(1, page - 1)))}
                disabled={page === 1}
                className="admin-pagination-btn"
              >← Prev</button>
              <button
                onClick={() => setParam('page', String(Math.min(pages, page + 1)))}
                disabled={page === pages}
                className="admin-pagination-btn"
              >Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'warning' | 'info' | 'success' | 'danger' }): React.ReactElement {
  const toneClass =
    tone === 'warning' ? 'text-warning' :
    tone === 'info'    ? 'text-admin-blue' :
    tone === 'success' ? 'text-success' :
    tone === 'danger'  ? 'text-danger' :
                         'text-ink';
  return (
    <div className="admin-card-surface p-3 text-center">
      <p className={`text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-ink-faint font-semibold mt-0.5">{label}</p>
    </div>
  );
}

function statusStyle(s: SupportStatus): string {
  switch (s) {
    case 'Pending':   return 'bg-warning/15 text-warning border-warning/30';
    case 'In Review': return 'bg-admin-blue/15 text-admin-blue border-admin-blue/30';
    case 'Resolved':  return 'bg-success/15 text-success border-success/30';
    case 'Rejected':  return 'bg-danger/15 text-danger border-danger/30';
  }
}

export default function AdminSupportInbox(): React.ReactElement {
  return <InboxInner />;
}
