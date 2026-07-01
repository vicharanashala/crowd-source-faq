// Admin support analytics — totals, by-status / by-issue-type
// breakdowns, recent activity, 30-day submission trend (lightweight
// inline SVG, no chart library).

import React, { useEffect, useState } from 'react';
import { fetchSupportAnalytics, SUPPORT_ISSUE_OPTIONS } from '../../components/support/api';
import { getIssueIcon } from '../../components/support/icons';
import type { SupportAnalytics } from '../../components/support/types';
import Spinner from '../../components/ui/Spinner';
import { friendlyError } from '../../utils/api';

const SHORT_LABEL: Record<string, string> = Object.fromEntries(
  SUPPORT_ISSUE_OPTIONS.map((o) => [o.key, o.shortLabel]),
);

function AnalyticsInner(): React.ReactElement {
  const [data, setData] = useState<SupportAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSupportAnalytics()
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(friendlyError(err, 'Could not load analytics.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-12 text-ink-soft">
        {error ? <p className="text-sm text-danger">{error}</p> : <Spinner size="lg" />}
      </div>
    );
  }

  const t = data.totals;
  const resolutionRate = t.total > 0 ? Math.round((t.resolved / t.total) * 100) : 0;
  const pendingCount = t.pending + t.inReview;
  const maxByDay = Math.max(1, ...data.byDay.map((d) => d.count));
  const maxByType = Math.max(1, ...Object.values(data.byIssueType));

  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-faint -mt-2">
        Aggregate metrics across all session support tickets.
      </p>

      {/* Totals row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <Kpi label="Total"            value={t.total} />
        <Kpi label="Pending"          value={t.pending} tone="warning" />
        <Kpi label="In Review"        value={t.inReview} tone="info" />
        <Kpi label="Resolved"         value={t.resolved} tone="success" />
        <Kpi label="Rejected"         value={t.rejected} tone="danger" />
        <Kpi label="With attachments" value={t.withAttachments} />
      </div>

      {/* Resolution rate + pending */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="admin-card-surface p-4">
          <p className="text-[10px] uppercase tracking-wider text-ink-faint font-semibold">Resolution rate</p>
          <p className="text-3xl font-bold text-success mt-1 tabular-nums">{resolutionRate}%</p>
          <p className="text-xs text-ink-soft mt-1">{t.resolved} of {t.total} resolved</p>
        </div>
        <div className="admin-card-surface p-4">
          <p className="text-[10px] uppercase tracking-wider text-ink-faint font-semibold">Needs attention</p>
          <p className="text-3xl font-bold text-warning mt-1 tabular-nums">{pendingCount}</p>
          <p className="text-xs text-ink-soft mt-1">Pending + In Review right now</p>
        </div>
      </div>

      {/* By issue type — horizontal bars */}
      <div className="admin-card-surface p-5">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-faint mb-4">By issue type</p>
        <ul className="space-y-2">
          {Object.entries(data.byIssueType).map(([key, count]) => (
            <li key={key} className="flex items-center gap-3">
              <span className="shrink-0 w-7 h-7 rounded-lg bg-cream text-accent flex items-center justify-center">
                {getIssueIcon(key)}
              </span>
              <span className="shrink-0 w-24 text-xs text-ink-soft">{SHORT_LABEL[key] ?? key}</span>
              <div className="flex-1 h-5 rounded-full bg-mist overflow-hidden">
                <div
                  className="h-full bg-accent"
                  style={{ width: `${(count / maxByType) * 100}%` }}
                  aria-label={`${key} ${count}`}
                />
              </div>
              <span className="shrink-0 text-xs text-ink tabular-nums w-8 text-right">{count}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 30-day trend — inline SVG line/bar chart */}
      {data.byDay.length > 0 && (
        <div className="admin-card-surface p-5">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-faint mb-4">Submissions — last 30 days</p>
          <div className="flex items-end gap-1 h-32">
            {data.byDay.map((d) => {
              const h = (d.count / maxByDay) * 100;
              return (
                <div
                  key={d._id}
                  className="flex-1 bg-admin-blue/30 hover:bg-admin-blue/60 rounded-t transition-colors relative group"
                  style={{ height: `${Math.max(2, h)}%` }}
                  title={`${d._id}: ${d.count}`}
                >
                  <span className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:block text-[10px] bg-ink text-white px-1.5 py-0.5 rounded whitespace-nowrap">
                    {d.count}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-[10px] text-ink-faint mt-2">
            <span>{data.byDay[0]?._id}</span>
            <span>{data.byDay[data.byDay.length - 1]?._id}</span>
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div className="admin-card-surface p-5">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-faint mb-3">Recent activity</p>
        {data.recent.length === 0 ? (
          <p className="text-xs text-ink-faint italic">Nothing yet.</p>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {data.recent.map((r) => (
              <li key={r._id} className="flex items-center gap-2">
                <span className="text-ink-faint tabular-nums w-20 shrink-0">{new Date(r.createdAt).toLocaleDateString()}</span>
                <span className="text-ink truncate flex-1">{r.userName}</span>
                <span className="text-ink-soft">{SHORT_LABEL[r.issueType] ?? r.issueType}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wider ${statusStyle(r.status)}`}>
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
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

function statusStyle(s: string): string {
  switch (s) {
    case 'Pending':   return 'bg-warning/15 text-warning border-warning/30';
    case 'In Review': return 'bg-admin-blue/15 text-admin-blue border-admin-blue/30';
    case 'Resolved':  return 'bg-success/15 text-success border-success/30';
    case 'Rejected':  return 'bg-danger/15 text-danger border-danger/30';
    default:          return 'bg-mist text-ink-soft';
  }
}

export default function AdminSupportAnalytics(): React.ReactElement {
  return <AnalyticsInner />;
}
