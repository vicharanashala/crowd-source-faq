/**
 * AdminApiLogsPage — AI API call observability dashboard.
 *
 * Every external AI call (chat + embedding) is persisted to the
 * `AiApiCall` collection via utils/ai/apiUsageLog.ts. This page
 * surfaces that data:
 *   - Top stat row: total calls, success rate, total cost, latency
 *   - Filterable + paginated table of recent calls
 *   - Side-panel detail view on row click (every field, copy-to-clipboard)
 *   - Bulk cleanup modal with four modes:
 *       age   (delete older than N days)
 *       range (delete within a date range)
 *       day   (delete a single day)
 *       hour  (delete a single hour-bucket of a single day)
 *   - CSV export for any date range
 *
 * Backend endpoints: see apps/backend/src/modules/ai/ai-api-call.controller.ts
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import adminApi from '../utils/adminApi';
import {
  adminBtnDanger,
  adminBtnGhost,
  adminBtnPrimary,
  adminBtnSecondary,
  adminCardHeader,
  adminCardSurface,
  adminInput,
  adminSearchInput,
  adminSelect,
  adminTableWrap,
  adminTheadRow,
  badgeDanger,
  badgeNeutral,
  badgeSuccess,
  flexCol,
  flexRow,
  flexRowBetween,
  surfaceCardPadded,
  tableTd,
  tableTh,
  tableTr,
  tableTrLast,
  textLabelXsBold,
  textXsFaint,
} from '../../styles/style_config';

// ── types (mirror backend response shapes) ─────────────────────────────────

interface AiApiLog {
  _id: string;
  kind: 'inference' | 'embedding';
  status: 'ok' | 'fail';
  provider: string;
  modelName: string;
  feature?: string;
  batchId?: string | null;
  userId?: string | null;
  userEmail?: string;
  userRole?: string;
  tokensUsed?: number;
  estimatedCostUsd?: number;
  durationMs: number;
  httpStatus?: number;
  error?: string;
  errorKind?: string;
  /** Outgoing request body the upstream rejected — only populated on
   *  failure when the backend captured it. Used to diagnose custom /
   *  proxied providers where a relay rewrites the body schema. */
  requestBody?: string;
  requestId?: string;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  logs: AiApiLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface StatsResponse {
  windowHours: number;
  fromDate: string;
  toDate: string;
  bucketMs: number;
  totals: {
    totalCalls: number;
    successCalls: number;
    failCalls: number;
    successRate: number;
    totalCostUsd: number;
    totalTokens: number;
    avgDurationMs: number;
    p50DurationMs: number;
    p95DurationMs: number;
    p99DurationMs: number;
  };
  byProvider: Array<{ provider: string; calls: number; successRate: number; costUsd: number; avgDurationMs: number }>;
  byFeature: Array<{ feature: string; calls: number; successRate: number; costUsd: number }>;
  byKind: Array<{ kind: string; calls: number; successRate: number }>;
  topErrors: Array<{ errorKind: string; count: number; lastSeen: string; sampleError: string | null }>;
  topUsers: Array<{ userId: string; userEmail: string | null; calls: number; costUsd: number }>;
  topModels: Array<{ provider: string; modelName: string; calls: number; costUsd: number; avgDurationMs: number }>;
}

// ── helpers ───────────────────────────────────────────────────────────────

const fmtNumber = (n: number) => n.toLocaleString();
const fmtCost = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
const fmtDuration = (ms: number) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`);

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function statusBadge(status: 'ok' | 'fail') {
  return (
    <span className={status === 'ok' ? badgeSuccess : badgeDanger}>
      {status === 'ok' ? '✓ ok' : '✕ fail'}
    </span>
  );
}

function kindBadge(kind: 'inference' | 'embedding') {
  return <span className={badgeNeutral}>{kind}</span>;
}

// ── component ─────────────────────────────────────────────────────────────

export default function AdminApiLogsPage() {
  // Filters / pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [statusFilter, setStatusFilter] = useState<'' | 'ok' | 'fail'>('');
  const [kindFilter, setKindFilter] = useState<'' | 'inference' | 'embedding'>('');
  const [providerFilter, setProviderFilter] = useState('');
  const [featureFilter, setFeatureFilter] = useState('');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Data
  const [data, setData] = useState<ListResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detail panel
  const [selected, setSelected] = useState<AiApiLog | null>(null);

  // Cleanup modal
  const [cleanupOpen, setCleanupOpen] = useState(false);

  // Export
  const [exporting, setExporting] = useState(false);

  // ── fetchers ────────────────────────────────────────────────────────────

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.get<ListResponse>('/admin/ai/api-logs', {
        params: {
          page,
          limit,
          ...(statusFilter && { status: statusFilter }),
          ...(kindFilter && { kind: kindFilter }),
          ...(providerFilter && { provider: providerFilter }),
          ...(featureFilter && { feature: featureFilter }),
          ...(search && { search }),
          ...(fromDate && { fromDate: new Date(fromDate).toISOString() }),
          ...(toDate && { toDate: new Date(`${toDate}T23:59:59Z`).toISOString() }),
        },
      });
      setData(res.data);
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  }, [page, limit, statusFilter, kindFilter, providerFilter, featureFilter, search, fromDate, toDate]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await adminApi.get<StatsResponse>('/admin/ai/api-logs/stats', {
        params: {
          fromDate: fromDate ? new Date(fromDate).toISOString() : undefined,
          toDate: toDate ? new Date(`${toDate}T23:59:59Z`).toISOString() : undefined,
        },
      });
      setStats(res.data);
    } catch {
      // Non-fatal — table can render without stats
    }
  }, [fromDate, toDate]);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Auto-refresh stats every 15s for the dashboard feel
  useEffect(() => {
    const id = setInterval(() => { fetchStats(); }, 15000);
    return () => clearInterval(id);
  }, [fetchStats]);

  // ── handlers ────────────────────────────────────────────────────────────

  const handleClearFilters = () => {
    setStatusFilter('');
    setKindFilter('');
    setProviderFilter('');
    setFeatureFilter('');
    setSearch('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const res = await adminApi.get('/admin/ai/api-logs/export', {
        params: {
          fromDate: fromDate ? new Date(fromDate).toISOString() : undefined,
          toDate: toDate ? new Date(`${toDate}T23:59:59Z`).toISOString() : undefined,
        },
        responseType: 'blob',
      });
      const blob = new Blob([res.data as BlobPart], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-api-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // eslint-disable-next-line no-alert -- admin surface
      alert('Export failed. Try again or check the network log.');
    } finally {
      setExporting(false);
    }
  };

  // ── render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Header row ── */}
      <div className={flexRowBetween}>
        <div>
          <h1 className="text-xl font-bold text-ink">AI API Logs</h1>
          <p className="text-xs text-ink-soft mt-0.5">
            Per-call audit of every chat and embedding request. {stats && (
              <>Showing <span className="font-semibold text-ink">{fmtNumber(stats.totals.totalCalls)}</span> calls in the last <span className="font-semibold text-ink">{stats.windowHours}h</span>.</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleExportCsv} disabled={exporting}
            className={`${adminBtnSecondary} px-3 py-1.5 text-xs flex items-center gap-1.5`}>
            {exporting ? '⏳ Exporting…' : '⬇ Export CSV'}
          </button>
          <button type="button" onClick={() => setCleanupOpen(true)}
            className={`${adminBtnDanger} px-3 py-1.5 text-xs`}>
            🗑 Cleanup…
          </button>
        </div>
      </div>

      {/* ── Stat cards row ── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total Calls" value={fmtNumber(stats.totals.totalCalls)} sublabel={stats.windowHours < 1 ? `${Math.round(stats.windowHours * 60)}m` : `${stats.windowHours}h window`} />
          <StatCard label="Success Rate" value={`${(stats.totals.successRate * 100).toFixed(1)}%`} tone={stats.totals.successRate >= 0.95 ? 'success' : stats.totals.successRate >= 0.8 ? 'warning' : 'danger'} sublabel={`${fmtNumber(stats.totals.failCalls)} failures`} />
          <StatCard label="Total Cost" value={fmtCost(stats.totals.totalCostUsd)} sublabel={`${fmtNumber(stats.totals.totalTokens)} tokens`} />
          <StatCard label="Avg Latency" value={fmtDuration(stats.totals.avgDurationMs)} sublabel="per call" />
          <StatCard label="p95 Latency" value={fmtDuration(stats.totals.p95DurationMs)} sublabel="95th percentile" />
          <StatCard label="Failures" value={fmtNumber(stats.totals.failCalls)} tone={stats.totals.failCalls === 0 ? 'success' : 'danger'} sublabel={stats.totals.failCalls > 0 ? 'investigate' : 'all clear'} />
        </div>
      )}

      {/* ── v1.80 — By-provider breakdown ──
          Backend already returns `stats.byProvider` (per-provider
          calls / success / cost / avg latency) but the page never
          rendered it. Each row is clickable to apply that provider as
          the main-table filter, so an admin can pivot from "is
          minimax failing?" to the filtered log list in one click. */}
      {stats && stats.byProvider && stats.byProvider.length > 0 && (
        <div className={surfaceCardPadded}>
          <div className={adminCardHeader}>
            <p className={textLabelXsBold}>By provider</p>
            <p className="text-[10px] text-ink-faint">click a row to filter the table below</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={adminTheadRow}>
                  <th className={tableTh + ' text-left'}>Provider</th>
                  <th className={tableTh + ' text-right'}>Calls</th>
                  <th className={tableTh + ' text-right'}>Success</th>
                  <th className={tableTh + ' text-right'}>Avg latency</th>
                  <th className={tableTh + ' text-right'}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {stats.byProvider.map((row) => {
                  const active = providerFilter === row.provider;
                  return (
                    <tr
                      key={row.provider}
                      onClick={() => { setProviderFilter(row.provider); setPage(1); }}
                      className={tableTr + ' cursor-pointer hover:bg-bg-secondary/40 ' + (active ? 'bg-accent/10' : '')}
                      title={`Click to filter by ${row.provider}`}
                    >
                      <td className={tableTd + ' text-xs font-mono'}>
                        {row.provider}
                        {active && <span className="ml-2 text-[10px] text-accent">✓ filter applied</span>}
                      </td>
                      <td className={tableTd + ' text-xs text-right tabular-nums'}>{fmtNumber(row.calls)}</td>
                      <td className={tableTd + ' text-xs text-right tabular-nums'}>
                        <span className={
                          row.successRate >= 0.95 ? 'text-success' :
                          row.successRate >= 0.8  ? 'text-warning' :
                                                    'text-danger font-semibold'
                        }>
                          {(row.successRate * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td className={tableTd + ' text-xs text-right tabular-nums'}>{fmtDuration(row.avgDurationMs)}</td>
                      <td className={tableTd + ' text-xs text-right tabular-nums'}>{fmtCost(row.costUsd)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── v1.80 — Top errors ──
          Backend already returns the top 5 error kinds (count, last
          seen, sample message). Render as a compact list with a
          copy-to-clipboard on the snippet. If there are no errors in
          the window, show a "no errors" hint instead of hiding the
          section — admins want to see the empty state too. */}
      {stats && (
        <div className={surfaceCardPadded}>
          <div className={adminCardHeader}>
            <p className={textLabelXsBold}>Top errors</p>
            {stats.topErrors && stats.topErrors.length > 0 && (
              <p className="text-[10px] text-ink-faint">last {stats.topErrors.length} error kinds in window</p>
            )}
          </div>
          {stats.topErrors && stats.topErrors.length > 0 ? (
            <div className="space-y-2">
              {stats.topErrors.map((row) => (
                <div key={row.errorKind + row.lastSeen} className="border border-border rounded-lg p-3 bg-bg-secondary/30">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="text-xs font-mono font-semibold text-danger">{row.errorKind}</span>
                    <span className="text-[10px] text-ink-faint">
                      {fmtNumber(row.count)} {row.count === 1 ? 'occurrence' : 'occurrences'} ·
                      {' '}last seen {new Date(row.lastSeen).toLocaleString()}
                    </span>
                  </div>
                  {row.sampleError && (
                    <pre
                      className="bg-bg border border-border rounded p-2 text-[11px] text-ink-soft font-mono whitespace-pre-wrap break-words max-h-24 overflow-y-auto cursor-pointer hover:bg-bg-secondary/40"
                      onClick={() => { void navigator.clipboard.writeText(row.sampleError ?? '').catch(() => undefined); }}
                      title="Click to copy"
                    >
                      {row.sampleError.slice(0, 400)}{row.sampleError.length > 400 ? '…' : ''}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-soft">No errors in this window. 🎉</p>
          )}
        </div>
      )}

      {/* ── Filter bar ── */}
      <div className={surfaceCardPadded}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <FilterField label="Status">
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as '' | 'ok' | 'fail'); setPage(1); }} className={adminSelect}>
              <option value="">All</option>
              <option value="ok">ok</option>
              <option value="fail">fail</option>
            </select>
          </FilterField>
          <FilterField label="Kind">
            <select value={kindFilter} onChange={(e) => { setKindFilter(e.target.value as '' | 'inference' | 'embedding'); setPage(1); }} className={adminSelect}>
              <option value="">All</option>
              <option value="inference">inference</option>
              <option value="embedding">embedding</option>
            </select>
          </FilterField>
          <FilterField label="Provider">
            <input type="text" value={providerFilter} onChange={(e) => { setProviderFilter(e.target.value); setPage(1); }} placeholder="anthropic, openai, …" className={adminInput} />
          </FilterField>
          <FilterField label="Feature">
            <input type="text" value={featureFilter} onChange={(e) => { setFeatureFilter(e.target.value); setPage(1); }} placeholder="duplicateDetection, …" className={adminInput} />
          </FilterField>
          <FilterField label="From">
            <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} className={adminInput} />
          </FilterField>
          <FilterField label="To">
            <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} className={adminInput} />
          </FilterField>
          <div className="lg:col-span-2">
            <FilterField label="Search">
              <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search model, user email, error, request id…" className={adminSearchInput} />
            </FilterField>
          </div>
          <div className="flex items-end">
            <button type="button" onClick={handleClearFilters}
              className={`${adminBtnGhost} w-full px-3 py-2 text-xs`}>
              Clear filters
            </button>
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className={surfaceCardPadded + ' p-0 overflow-hidden'}>
        <div className={adminCardHeader + ' flex items-center justify-between'}>
          <p className={textLabelXsBold}>Recent calls</p>
          {data && (
            <p className="text-[10px] text-ink-faint">
              {fmtNumber(data.total)} {data.total === 1 ? 'result' : 'results'} · page {data.page} of {data.totalPages}
            </p>
          )}
        </div>
        {error ? (
          <p className="p-6 text-sm text-danger">{error}</p>
        ) : loading && !data ? (
          <p className="p-6 text-sm text-ink-soft">Loading…</p>
        ) : data && data.logs.length === 0 ? (
          <p className="p-6 text-sm text-ink-soft">No calls match the current filters.</p>
        ) : (
          <div className={adminTableWrap + ' rounded-none border-0'}>
            <table className="w-full">
              <thead>
                <tr className={adminTheadRow}>
                  <th className={tableTh}>When</th>
                  <th className={tableTh}>Kind</th>
                  <th className={tableTh}>Status</th>
                  <th className={tableTh}>Provider</th>
                  <th className={tableTh}>Model</th>
                  <th className={tableTh}>Feature</th>
                  <th className={tableTh}>User</th>
                  <th className={tableTh + ' text-right'}>Latency</th>
                  <th className={tableTh + ' text-right'}>Tokens</th>
                  <th className={tableTh + ' text-right'}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {data?.logs.map((log, idx) => (
                  <tr
                    key={log._id}
                    onClick={() => setSelected(log)}
                    className={`${idx === (data.logs.length - 1) ? tableTrLast : tableTr} cursor-pointer`}
                  >
                    <td className={tableTd}>
                      <div className="flex flex-col">
                        <span className="text-xs">{relativeTime(log.createdAt)}</span>
                        <span className={textXsFaint}>{new Date(log.createdAt).toLocaleString()}</span>
                      </div>
                    </td>
                    <td className={tableTd}>{kindBadge(log.kind)}</td>
                    <td className={tableTd}>{statusBadge(log.status)}</td>
                    <td className={tableTd + ' text-xs font-mono'}>{log.provider}</td>
                    <td className={tableTd + ' text-xs font-mono'}>{log.modelName}</td>
                    <td className={tableTd + ' text-xs'}>{log.feature ?? '—'}</td>
                    <td className={tableTd + ' text-xs'}>
                      {log.userEmail ? (
                        <span title={`role: ${log.userRole ?? 'unknown'}`}>{log.userEmail}</span>
                      ) : (
                        <span className="text-ink-faint">system</span>
                      )}
                    </td>
                    <td className={tableTd + ' text-xs text-right tabular-nums'}>{fmtDuration(log.durationMs)}</td>
                    <td className={tableTd + ' text-xs text-right tabular-nums'}>
                      {log.tokensUsed ? fmtNumber(log.tokensUsed) : '—'}
                    </td>
                    <td className={tableTd + ' text-xs text-right tabular-nums'}>
                      {log.estimatedCostUsd !== undefined ? fmtCost(log.estimatedCostUsd) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-ink-faint">Per page</span>
              <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }} className={adminSelect}>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className={`${adminBtnGhost} px-3 py-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed`}>
                ← Prev
              </button>
              <span className="text-xs text-ink-soft">Page {page} of {data.totalPages}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} disabled={page >= data.totalPages} className={`${adminBtnGhost} px-3 py-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed`}>
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Detail side panel ── */}
      <AnimatePresence>
        {selected && (
          <DetailPanel log={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>

      {/* ── Cleanup modal ── */}
      <AnimatePresence>
        {cleanupOpen && (
          <CleanupModal
            onClose={() => setCleanupOpen(false)}
            onDone={() => { setCleanupOpen(false); fetchList(); fetchStats(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── sub-components ────────────────────────────────────────────────────────

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-ink-faint uppercase tracking-wider mb-1">{label}</label>
      {children}
    </div>
  );
}

function StatCard({ label, value, sublabel, tone }: { label: string; value: string; sublabel?: string; tone?: 'success' | 'warning' | 'danger' }) {
  const valueColor = tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-ink';
  return (
    <div className={adminCardSurface + ' p-4'}>
      <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${valueColor} tabular-nums`}>{value}</p>
      {sublabel && <p className="text-[10px] text-ink-faint mt-0.5">{sublabel}</p>}
    </div>
  );
}

function DetailPanel({ log, onClose }: { log: AiApiLog; onClose: () => void }) {
  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).catch(() => { /* ignore */ });
  };

  return (
    <>
      <motion.div
        className="fixed inset-0 z-[60] bg-ink/30 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.aside
        className={`fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-card border-l border-border shadow-2xl z-[61] overflow-y-auto`}
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.25 }}
      >
        <div className="sticky top-0 z-10 bg-card border-b border-border px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider">AI API Call Detail</p>
            <p className="text-sm font-mono text-ink mt-0.5">{log._id}</p>
          </div>
          <button type="button" onClick={onClose} className="text-ink-faint hover:text-ink transition-colors text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2">
            {statusBadge(log.status)}
            {kindBadge(log.kind)}
            <span className={badgeNeutral}>{log.provider}</span>
            <span className="text-xs font-mono text-ink-soft">{log.modelName}</span>
            {log.feature && <span className={badgeNeutral}>{log.feature}</span>}
          </div>

          {/* Fields */}
          <Field label="Created at" value={new Date(log.createdAt).toISOString()} copyable />
          <Field label="Duration" value={`${fmtDuration(log.durationMs)} (${log.durationMs}ms)`} />
          {log.tokensUsed !== undefined && <Field label="Tokens used" value={fmtNumber(log.tokensUsed)} />}
          {log.estimatedCostUsd !== undefined && <Field label="Estimated cost" value={fmtCost(log.estimatedCostUsd)} />}
          {log.httpStatus !== undefined && <Field label="HTTP status" value={String(log.httpStatus)} />}
          {log.errorKind && <Field label="Error kind" value={log.errorKind} />}
          {log.batchId && <Field label="Batch ID" value={log.batchId} copyable />}
          {log.userId && <Field label="User ID" value={log.userId} copyable />}
          {log.userEmail && <Field label="User email" value={log.userEmail} />}
          {log.userRole && <Field label="User role" value={log.userRole} />}
          {log.requestId && <Field label="Request ID" value={log.requestId} copyable />}

          {/* Error block */}
          {log.error && (
            <div>
              <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider mb-1">Error</p>
              <pre className="bg-bg-secondary border border-border rounded-lg p-3 text-xs text-danger font-mono whitespace-pre-wrap break-words max-h-48 overflow-y-auto">{log.error}</pre>
            </div>
          )}

          {/* Outgoing request body — populated on failure when the
              backend captured it. Helps admins spot schema mismatches
              with custom / proxied providers (e.g. relays that rename
              `model` → `modelName` before forwarding to the upstream). */}
          {log.requestBody && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider">Outgoing request body</p>
                <button
                  type="button"
                  onClick={() => copy(log.requestBody!)}
                  className="text-[10px] text-accent hover:underline"
                >
                  copy
                </button>
              </div>
              <pre className="bg-bg-secondary border border-border rounded-lg p-3 text-xs text-ink-soft font-mono whitespace-pre-wrap break-words max-h-64 overflow-y-auto">{log.requestBody}</pre>
            </div>
          )}
        </div>
      </motion.aside>
    </>
  );
}

function Field({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider min-w-[110px] pt-0.5">{label}</p>
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <p className="text-xs text-ink font-mono break-all">{value}</p>
        {copyable && (
          <button type="button" onClick={() => navigator.clipboard.writeText(value).catch(() => undefined)} className="text-[10px] text-accent hover:underline shrink-0">copy</button>
        )}
      </div>
    </div>
  );
}

// ── Cleanup modal ─────────────────────────────────────────────────────────

type CleanupMode = 'age' | 'range' | 'day' | 'hour';

// ── Quick-preset definitions ──────────────────────────────────────────────
// Each preset locks a mode AND pre-fills the form fields. The modal's
// `applyPreset()` updates the right piece of state. `detectActivePreset()`
// re-computes the active key whenever any of the form fields change, so
// the highlight follows the user's manual edits.
//
// The presets are computed relative to "now" once at modal-open, but the
// closure inside CleanupModal re-runs on every render — fine since each
// preset only encodes wall-clock dates (no live data).
interface CleanupPreset {
  key: string;
  label: string;
  desc: string;
  apply: (ctx: {
    setMode: (m: CleanupMode) => void;
    setDays: (n: number) => void;
    setFromDate: (s: string) => void;
    setToDate: (s: string) => void;
    setDate: (s: string) => void;
    setHour: (n: number) => void;
  }) => void;
}
function isoDate(d: Date): string {
  // YYYY-MM-DD in local time, matching what <input type="date"> expects.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const lastNDayRange = (n: number) => {
  const today = new Date();
  const past = new Date(today);
  past.setDate(past.getDate() - (n - 1));
  return { from: isoDate(past), to: isoDate(today) };
};
const cleanupPresets: CleanupPreset[] = [
  {
    key: 'last-hour',
    label: 'Last hour',
    desc: 'Delete only the immediately previous one-hour bucket of today.',
    apply: ({ setMode, setDate, setHour }) => {
      setMode('hour');
      const now = new Date();
      setDate(isoDate(now));
      setHour((now.getHours() - 1 + 24) % 24);
    },
  },
  {
    key: 'today',
    label: 'Today',
    desc: 'Delete every record created today (00:00 → now).',
    apply: ({ setMode, setDate }) => {
      setMode('day');
      setDate(isoDate(new Date()));
    },
  },
  {
    key: 'yesterday',
    label: 'Yesterday',
    desc: "Delete everything from yesterday's 24-hour window.",
    apply: ({ setMode, setDate }) => {
      setMode('day');
      const y = new Date();
      y.setDate(y.getDate() - 1);
      setDate(isoDate(y));
    },
  },
  {
    key: 'week',
    label: 'Last 7 days',
    desc: 'Delete the last 7 calendar days (incl. today).',
    apply: ({ setMode, setFromDate, setToDate }) => {
      setMode('range');
      const r = lastNDayRange(7);
      setFromDate(r.from);
      setToDate(r.to);
    },
  },
  {
    key: 'month',
    label: 'Last 30 days',
    desc: 'Delete the last 30 calendar days (incl. today).',
    apply: ({ setMode, setFromDate, setToDate }) => {
      setMode('range');
      const r = lastNDayRange(30);
      setFromDate(r.from);
      setToDate(r.to);
    },
  },
  {
    key: 'older-7d',
    label: 'Older than 7 days',
    desc: 'Bulk-delete anything more than a week old.',
    apply: ({ setMode, setDays }) => {
      setMode('age');
      setDays(7);
    },
  },
  {
    key: 'older-30d',
    label: 'Older than 30 days',
    desc: 'Bulk-delete anything more than a month old.',
    apply: ({ setMode, setDays }) => {
      setMode('age');
      setDays(30);
    },
  },
];
function detectActivePreset(
  mode: CleanupMode, days: number, fromDate: string, toDate: string, date: string, hour: number
): string | null {
  // Mirrors the preset apply() logic. Returns the key if the current
  // form state exactly matches a preset, otherwise null (no highlight).
  const today = isoDate(new Date());
  const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return isoDate(d); })();
  for (const p of cleanupPresets) {
    switch (p.key) {
      case 'last-hour':
        if (mode === 'hour' && date === today && hour === ((new Date().getHours() - 1 + 24) % 24)) return p.key;
        break;
      case 'today':
        if (mode === 'day' && date === today) return p.key;
        break;
      case 'yesterday':
        if (mode === 'day' && date === yesterday) return p.key;
        break;
      case 'week': {
        const r = lastNDayRange(7);
        if (mode === 'range' && fromDate === r.from && toDate === r.to) return p.key;
        break;
      }
      case 'month': {
        const r = lastNDayRange(30);
        if (mode === 'range' && fromDate === r.from && toDate === r.to) return p.key;
        break;
      }
      case 'older-7d':
        if (mode === 'age' && days === 7) return p.key;
        break;
      case 'older-30d':
        if (mode === 'age' && days === 30) return p.key;
        break;
    }
  }
  return null;
}

function CleanupModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<CleanupMode>('age');
  const [days, setDays] = useState(90);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [date, setDate] = useState('');
  const [hour, setHour] = useState(14);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ deletedCount: number; mode: string; fromIso?: string; toIso?: string; cutoffIso?: string } | null>(null);

  // Quick-preset wiring. Computed on every render — cheap (7 presets,
  // each a single string compare). Drives the highlighted chip in the
  // chips row above the radio.
  const activePresetKey = detectActivePreset(mode, days, fromDate, toDate, date, hour);
  const applyPreset = (p: CleanupPreset) => p.apply({ setMode, setDays, setFromDate, setToDate, setDate, setHour });

  const buildBody = (): Record<string, unknown> => {
    if (mode === 'age') return { days };
    if (mode === 'range') return { fromDate: new Date(fromDate).toISOString(), toDate: new Date(`${toDate}T23:59:59Z`).toISOString() };
    if (mode === 'day') return { date };
    return { date, hour };
  };

  const validForMode = (): boolean => {
    if (mode === 'age') return days > 0;
    if (mode === 'range') return Boolean(fromDate && toDate && fromDate <= toDate);
    if (mode === 'day') return Boolean(date);
    return Boolean(date) && hour >= 0 && hour <= 23;
  };

  const handlePreview = async () => {
    setPreviewing(true);
    setError(null);
    setPreviewCount(null);
    try {
      const res = await adminApi.post<{ count: number }>('/admin/ai/api-logs/cleanup/preview', buildBody());
      setPreviewCount(res.data.count);
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  };

  const handleConfirm = async () => {
    if (!validForMode()) {
      setError('Fill out the fields for the selected mode first.');
      return;
    }
    if (previewCount !== null && previewCount > 100 && !window.confirm(
      `This will permanently delete ${previewCount} records. Are you sure?`,
    )) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await adminApi.post('/admin/ai/api-logs/cleanup', buildBody());
      setResult(res.data);
      // After a successful delete, refresh the parent.
      setTimeout(onDone, 1500);
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Delete failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Auto-preview when fields change
  useEffect(() => {
    if (validForMode()) {
      void handlePreview();
    } else {
      setPreviewCount(null);
    }
  }, [mode, days, fromDate, toDate, date, hour]);

  return (
    <>
      <motion.div className="fixed inset-0 z-[70] bg-ink/40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      {/*
        Centering wrapper is a plain <div> (not motion.*) because framer-motion
        writes its own `style.transform` on every animated frame — last-write-
        wins on the transform stack, which clobbers Tailwind's `-translate-x-1/2
        -translate-y-1/2` and pushes the modal to the bottom-right corner.
        Keeping the centering on the parent and the scale/opacity animation on
        the inner motion.div sidesteps that conflict and keeps the dialog
        reliably centered regardless of viewport height.
      */}
      <div className="fixed inset-0 z-[71] flex items-center justify-center p-4 pointer-events-none">
        <motion.div
          role="dialog" aria-modal="true" aria-labelledby="cleanup-title"
          className="pointer-events-auto w-[min(640px,100%)] max-h-[calc(100vh-2rem)] flex flex-col bg-card border border-border rounded-2xl shadow-2xl"
          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: 'tween', duration: 0.2 }}
        >
        {/* Header — fixed at the top of the modal so it's always visible
            even when the body scrolls for long content. */}
        <div className="px-6 pt-5 pb-3 border-b border-border shrink-0">
          <p id="cleanup-title" className="text-sm font-bold text-ink">Cleanup AI API Logs</p>
          <p className="text-xs text-ink-soft mt-1">Granular delete. The deleted records are unrecoverable.</p>
        </div>

        {/* Body — scrolls independently if the form grows past the
            viewport. `min-h-0` lets the flex child actually shrink and
            trigger `overflow-y-auto` instead of stretching the modal
            off-screen. */}
        <div className="px-6 py-5 overflow-y-auto min-h-0 flex-1">
        {result ? (
          <div className="p-4 rounded-lg bg-success-light border border-success/30 text-success text-xs">
            <p className="font-semibold">✓ Deleted {result.deletedCount} records</p>
            {result.fromIso && <p className="mt-1 text-ink-faint">Range: {result.fromIso} → {result.toIso}</p>}
            {result.cutoffIso && <p className="mt-1 text-ink-faint">Older than: {result.cutoffIso}</p>}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Quick presets — one-click shorthands for the most common
                cleanup windows. Clicking a preset selects its mode AND
                populates the form fields below so the live preview can
                immediately compute a count. The currently-active preset
                is highlighted. These never bypass the mode radio — they
                just programme the form. */}
            <div>
              <p className="block text-[10px] font-semibold text-ink-faint uppercase tracking-wider mb-1.5">Quick presets</p>
              <div className="flex flex-wrap gap-1.5">
                {cleanupPresets.map((p) => {
                  const active = activePresetKey === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => applyPreset(p)}
                      className={
                        'px-2.5 py-1 text-xs rounded-md border transition-colors ' +
                        (active
                          ? 'bg-accent/10 text-accent border-accent/40 font-semibold'
                          : 'bg-bg-secondary text-ink-soft border-border hover:bg-bg-secondary/60 hover:text-ink')
                      }
                      title={p.desc}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-ink-faint mt-1.5">Picks the mode and fills the fields. The live preview updates automatically.</p>
            </div>

            {/* Mode radio */}
            <div className="space-y-1.5">
              <p className="block text-[10px] font-semibold text-ink-faint uppercase tracking-wider mb-1">Custom mode</p>
              {([
                { key: 'age', label: 'Older than N days', desc: 'Bulk-delete by age.' },
                { key: 'range', label: 'Date range', desc: 'Delete everything in this range.' },
                { key: 'day', label: 'Specific day', desc: 'Delete one full 24-hour day.' },
                { key: 'hour', label: 'Specific hour of a day', desc: 'Delete a single hour-bucket.' },
              ] as const).map((opt) => (
                <label key={opt.key} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio" name="cleanup-mode" value={opt.key} checked={mode === opt.key}
                    onChange={() => setMode(opt.key)}
                    className="mt-0.5 accent-accent"
                  />
                  <div>
                    <p className="text-xs font-semibold text-ink">{opt.label}</p>
                    <p className="text-[10px] text-ink-faint">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            {/* Mode-specific fields */}
            {mode === 'age' && (
              <div>
                <label className="block text-[10px] font-semibold text-ink-faint uppercase tracking-wider mb-1">Days old</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={1} max={3650} value={days} onChange={(e) => setDays(Number(e.target.value))} className={adminInput} />
                  <div className="flex gap-1">
                    {[1, 7, 30, 90].map((d) => (
                      <button key={d} type="button" onClick={() => setDays(d)}
                        className="px-2 py-1 text-[10px] font-mono rounded border border-border bg-bg-secondary text-ink-soft hover:bg-bg-secondary/60 hover:text-ink">
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {mode === 'range' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-ink-faint uppercase tracking-wider mb-1">From</label>
                  <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={adminInput} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-ink-faint uppercase tracking-wider mb-1">To</label>
                  <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={adminInput} />
                </div>
              </div>
            )}
            {mode === 'day' && (
              <div>
                <label className="block text-[10px] font-semibold text-ink-faint uppercase tracking-wider mb-1">Day</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={adminInput} />
              </div>
            )}
            {mode === 'hour' && (
              <div className="grid grid-cols-[1fr_100px] gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-ink-faint uppercase tracking-wider mb-1">Day</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={adminInput} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-ink-faint uppercase tracking-wider mb-1">Hour (0–23)</label>
                  <input type="number" min={0} max={23} value={hour} onChange={(e) => setHour(Number(e.target.value))} className={adminInput} />
                </div>
              </div>
            )}

            {/* Live preview */}
            <div className="p-3 rounded-lg bg-bg-secondary border border-border">
              {previewing ? (
                <p className="text-xs text-ink-soft">Counting…</p>
              ) : previewCount !== null ? (
                previewCount === 0 ? (
                  /* Honest "nothing to delete" state — the preview endpoint
                     is returning 0 because no records match the threshold,
                     not because the modal is broken. Tell the admin why so
                     they don't think the page is dead. */
                  <div className="space-y-1">
                    <p className="text-xs">
                      <span className="text-ink-faint">Will delete: </span>
                      <span className="font-bold text-ink">0</span>
                      <span className="text-ink-faint"> records</span>
                    </p>
                    <p className="text-[11px] text-ink-soft">
                      No records match this filter — your data is too recent, or you've already
                      cleaned this range. Try a wider window (e.g. <span className="font-mono">days: 7</span>{' '}
                      or a different date range).
                    </p>
                  </div>
                ) : (
                  <p className="text-xs">
                    <span className="text-ink-faint">Will delete: </span>
                    <span className="font-bold text-ink">{previewCount.toLocaleString()}</span>
                    <span className="text-ink-faint"> records</span>
                  </p>
                )
              ) : (
                <p className="text-xs text-ink-soft">Fill the fields to see a live count.</p>
              )}
            </div>

            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
        )}
        </div>

        {/* Footer — pinned to the bottom so Cancel / Delete are always
            reachable without scrolling. */}
        <div className="px-6 py-4 border-t border-border shrink-0 bg-card rounded-b-2xl">
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className={`${adminBtnGhost} px-3 py-1.5 text-xs`}>Cancel</button>
            {result ? null : (
              <button
                type="button"
                onClick={handleConfirm}
                disabled={submitting || previewCount === null || previewCount === 0 || !validForMode()}
                className={`${adminBtnDanger} px-3 py-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {submitting ? 'Deleting…' : `Delete ${previewCount ?? 0} records`}
              </button>
            )}
          </div>
        </div>
        </motion.div>
      </div>
    </>
  );
}