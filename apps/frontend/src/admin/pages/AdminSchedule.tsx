/**
 * AdminSchedule.tsx — admin Schedule tab.
 *
 * Surfaces every automated process the backend runs (cron jobs +
 * legacy setInterval schedulers + service-lifecycle work + startup
 * one-shots). For each cronManager-managed process the admin can:
 *   - Pause / resume (toggle enabled flag, persisted to DB)
 *   - Change the interval (custom cadence, persisted to DB)
 *   - Reset to defaults (delete the override)
 *   - Run once on demand
 *   - View the run history (last 50 executions)
 *
 * Auto-refreshes every 5s so the admin sees in-flight runs and
 * status changes without refreshing the page.
 */

import { useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import adminApi from '../utils/adminApi';

interface Override {
  enabled: boolean;
  intervalMs: number;
  lastEditedBy: string;
  lastEditedAt: string;
  note?: string;
}

interface ScheduledProcess {
  id: string;
  label: string;
  description: string;
  kind: 'cron' | 'setInterval' | 'service' | 'startup-only';
  owner: string;
  intervalMs: number;
  isActive: boolean;
  isRunning: boolean;
  lastRunAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  errorCount: number;
  skipCount: number;
  canTriggerManually: boolean;
  meta?: Record<string, unknown>;
  hasOverride?: boolean;
  override?: Override | null;
}

interface ScheduleResponse {
  processes: ScheduledProcess[];
  summary: {
    total: number;
    cron: number;
    active: number;
    erroring: number;
    overridden?: number;
  };
}

interface RunRecord {
  _id: string;
  name: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'success' | 'error' | 'skipped';
  triggeredBy: 'cron' | 'admin';
  durationMs: number | null;
  error: string | null;
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

function formatInterval(ms: number): string {
  if (ms <= 0) return 'one-off';
  if (ms < 60_000) return `every ${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `every ${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `every ${Math.round(ms / 3_600_000)}h`;
  return `every ${Math.round(ms / 86_400_000)}d`;
}

function parseIntervalToMs(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed === '' || trimmed === 'default' || trimmed === '0') return 0;
  const m = trimmed.match(/^(\d+(?:\.\d+)?)\s*(s|sec|m|min|h|hr|d|day)s?$/);
  if (!m) return null;
  const num = parseFloat(m[1]!);
  if (!Number.isFinite(num) || num <= 0) return null;
  switch (m[2]![0]) {
    case 's': return Math.round(num * 1000);
    case 'm': return Math.round(num * 60_000);
    case 'h': return Math.round(num * 3_600_000);
    case 'd': return Math.round(num * 86_400_000);
  }
  return null;
}

function msToInput(ms: number): string {
  if (ms <= 0) return 'default';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

function StatusDot({ p }: { p: ScheduledProcess }): React.ReactElement {
  if (p.isRunning) {
    return <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" title="running now" />;
  }
  if (p.lastError && p.errorCount > 0) {
    return <span className="inline-block w-2 h-2 rounded-full bg-red-400" title="last run errored" />;
  }
  if (!p.isActive) {
    return <span className="inline-block w-2 h-2 rounded-full bg-gray-400" title="paused or disabled" />;
  }
  return <span className="inline-block w-2 h-2 rounded-full bg-accent" title="healthy" />;
}

function KindBadge({ kind }: { kind: ScheduledProcess['kind'] }): React.ReactElement {
  const styles: Record<ScheduledProcess['kind'], string> = {
    cron: 'bg-accent/10 text-accent border-accent/20',
    setInterval: 'bg-warning/10 text-warning border-warning/20',
    service: 'bg-success/10 text-success border-success/20',
    'startup-only': 'bg-mist text-ink-soft border-border',
  };
  const labels: Record<ScheduledProcess['kind'], string> = {
    cron: 'cron',
    setInterval: 'setInterval',
    service: 'service',
    'startup-only': 'startup',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${styles[kind]}`}>
      {labels[kind]}
    </span>
  );
}

export default function AdminSchedule(): React.ReactElement {
  const [data, setData] = useState<ScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'cron' | 'erroring' | 'running' | 'overridden'>('all');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingInterval, setEditingInterval] = useState<string>('');
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await adminApi.get<ScheduleResponse>('/admin/schedule');
      setData(res.data);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 5_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const trigger = useCallback(async (id: string) => {
    setTriggering(id);
    try {
      await adminApi.post(`/admin/schedule/${encodeURIComponent(id)}/trigger`);
      showToast(`Triggered ${id}`, 'success');
      void refresh();
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Trigger failed', 'error');
    } finally {
      setTriggering(null);
    }
  }, [refresh, showToast]);

  const toggleEnabled = useCallback(async (id: string, currentlyEnabled: boolean) => {
    try {
      await adminApi.patch(`/admin/schedule/${encodeURIComponent(id)}`, { enabled: !currentlyEnabled });
      showToast(`${id} ${!currentlyEnabled ? 'enabled' : 'paused'}`, 'success');
      void refresh();
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Toggle failed', 'error');
    }
  }, [refresh, showToast]);

  const saveInterval = useCallback(async (id: string, inputStr: string) => {
    const ms = parseIntervalToMs(inputStr);
    if (ms === null) {
      showToast(`Invalid interval "${inputStr}". Use format like 5m, 2h, 1d, or 'default'.`, 'error');
      return;
    }
    try {
      await adminApi.patch(`/admin/schedule/${encodeURIComponent(id)}`, { intervalMs: ms });
      showToast(`${id} interval updated to ${formatInterval(ms || 0) || 'default'}`, 'success');
      setEditingId(null);
      void refresh();
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Update failed', 'error');
    }
  }, [refresh, showToast]);

  const resetOverride = useCallback(async (id: string) => {
    if (!confirm(`Reset "${id}" to registered defaults? This clears any interval/enabled override.`)) return;
    try {
      await adminApi.delete(`/admin/schedule/${encodeURIComponent(id)}/override`);
      showToast(`Reset ${id} to defaults`, 'success');
      void refresh();
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Reset failed', 'error');
    }
  }, [refresh, showToast]);

  if (loading && !data) {
    return (
      <div className="space-y-4 max-w-6xl">
        <div className="h-8 w-48 bg-mist rounded animate-pulse" />
        <div className="h-96 admin-card-surface animate-pulse" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="admin-card-surface p-6">
        <p className="text-danger">Error loading schedule: {error}</p>
        <button type="button" onClick={refresh} className="mt-3 admin-btn-secondary px-3 py-1.5 text-xs">Retry</button>
      </div>
    );
  }

  const processes = data?.processes ?? [];
  const filtered = processes.filter((p) => {
    if (filter === 'cron' && p.kind !== 'cron') return false;
    if (filter === 'erroring' && p.errorCount === 0) return false;
    if (filter === 'running' && !p.isRunning) return false;
    if (filter === 'overridden' && !p.hasOverride) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        p.label.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-5 max-w-7xl">
      <div>
        <h1 className="text-xl font-semibold text-ink">Schedule</h1>
        <p className="text-sm text-ink-faint mt-1">
          Every automated process the backend runs — cron jobs, legacy schedulers,
          service-lifecycle work, and one-shot startup migrations. Refreshes every 5 seconds.
          Toggle <em>enabled</em>, change the <em>interval</em>, or <em>trigger</em> a job manually.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <SummaryStat label="Total" value={data?.summary.total ?? 0} accent="text-ink" />
        <SummaryStat label="Cron jobs" value={data?.summary.cron ?? 0} accent="text-accent" />
        <SummaryStat label="Active" value={data?.summary.active ?? 0} accent="text-accent" />
        <SummaryStat label="Erroring" value={data?.summary.erroring ?? 0} accent="text-red-400" />
        <SummaryStat label="Overridden" value={data?.summary.overridden ?? 0} accent="text-warning" />
      </div>

      {/* Filters */}
      <div className="admin-card-surface p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search by name or description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="admin-input text-sm flex-1 min-w-[200px]"
          />
          <div className="flex gap-1.5 text-xs">
            {(['all', 'cron', 'overridden', 'erroring', 'running'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  filter === f ? 'bg-accent text-accent-text' : 'bg-mist text-ink-soft hover:bg-cream'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Process table */}
      <div className="admin-card-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-mist/40 border-b border-border">
              <tr className="text-left">
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-faint">Status</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-faint">Process</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-faint">Kind</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-faint">Enabled</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-faint">Interval</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-faint">Last run</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-faint">Errors</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-faint text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-ink-faint text-sm">
                    No processes match the current filter.
                  </td>
                </tr>
              )}
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-mist/20 transition-colors">
                  <td className="px-4 py-3"><StatusDot p={p} /></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-ink">{p.label}</span>
                      <span className="text-[11px] text-ink-faint font-mono">{p.id}</span>
                      {p.description && (
                        <span className="text-xs text-ink-soft mt-0.5 max-w-md">{p.description}</span>
                      )}
                      {typeof p.meta?.featureFlag === 'string' && (
                        <span className="text-[10px] text-ink-faint mt-0.5">
                          gated by <span className="font-mono">{p.meta.featureFlag}</span>
                        </span>
                      )}
                      {p.hasOverride && (
                        <span className="text-[10px] text-warning mt-0.5 font-semibold">⚡ has override</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3"><KindBadge kind={p.kind} /></td>
                  {/* Enabled toggle (cron jobs only — legacy schedulers can't be managed) */}
                  <td className="px-4 py-3">
                    {p.kind === 'cron' ? (
                      <button
                        type="button"
                        onClick={() => toggleEnabled(p.id, p.isActive)}
                        title={p.isActive ? 'Click to pause' : 'Click to resume'}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          p.isActive ? 'bg-accent' : 'bg-border-medium'
                        }`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
                          p.isActive ? 'translate-x-[18px]' : 'translate-x-0.5'
                        }`} />
                      </button>
                    ) : (
                      <span className="text-[10px] text-ink-faint italic">n/a</span>
                    )}
                  </td>
                  {/* Interval — editable for cron jobs */}
                  <td className="px-4 py-3 text-xs">
                    {p.kind === 'cron' ? (
                      editingId === p.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={editingInterval}
                            onChange={(e) => setEditingInterval(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void saveInterval(p.id, editingInterval);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            placeholder="5m, 2h, 1d, default"
                            autoFocus
                            className="admin-input text-xs w-24 font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => void saveInterval(p.id, editingInterval)}
                            className="admin-btn-primary px-2 py-0.5 text-[10px]"
                          >Save</button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="admin-btn-secondary px-2 py-0.5 text-[10px]"
                          >Cancel</button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(p.id);
                            setEditingInterval(msToInput(p.intervalMs));
                          }}
                          title="Click to edit"
                          className="font-mono text-ink-soft hover:text-accent hover:underline"
                        >
                          {formatInterval(p.intervalMs)}
                          {p.hasOverride && <span className="ml-1 text-warning">⚡</span>}
                        </button>
                      )
                    ) : (
                      <span className="text-ink-faint font-mono">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-soft text-xs">
                    {p.lastRunAt ? formatRelative(p.lastRunAt) : 'never'}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {p.errorCount > 0 ? (
                      <div className="flex flex-col">
                        <span className="text-red-400 font-semibold">{p.errorCount} err{p.errorCount === 1 ? '' : 's'}</span>
                        {p.lastError && (
                          <span className="text-[10px] text-ink-faint max-w-xs truncate" title={p.lastError}>
                            {p.lastError}
                          </span>
                        )}
                      </div>
                    ) : p.skipCount > 0 ? (
                      <span className="text-ink-faint">{p.skipCount} skipped</span>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {p.kind === 'cron' && (
                        <button
                          type="button"
                          onClick={() => setHistoryFor(p.id)}
                          className="admin-btn-secondary px-2 py-1 text-[10px]"
                          title="View run history"
                        >
                          History
                        </button>
                      )}
                      {p.kind === 'cron' && p.hasOverride && (
                        <button
                          type="button"
                          onClick={() => void resetOverride(p.id)}
                          className="admin-btn-secondary px-2 py-1 text-[10px] text-warning"
                          title="Reset to registered defaults"
                        >
                          Reset
                        </button>
                      )}
                      {p.canTriggerManually ? (
                        <button
                          type="button"
                          onClick={() => void trigger(p.id)}
                          disabled={triggering === p.id || p.isRunning}
                          className="admin-btn-secondary px-2 py-1 text-[10px] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {triggering === p.id ? 'Running…' : p.isRunning ? 'In flight' : 'Run now'}
                        </button>
                      ) : (
                        <span className="text-[10px] text-ink-faint italic">
                          {p.kind === 'startup-only' ? 'boot-only' : 'n/a'}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* History drawer */}
      <AnimatePresence>
        {historyFor && (
          <HistoryDrawer
            jobId={historyFor}
            onClose={() => setHistoryFor(null)}
          />
        )}
      </AnimatePresence>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl text-sm shadow-lg ${
            toast.type === 'success' ? 'admin-toast-success' : 'admin-toast-error'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function SummaryStat({ label, value, accent }: { label: string; value: number; accent: string }): React.ReactElement {
  return (
    <div className="admin-card-surface p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent}`}>{value}</p>
    </div>
  );
}

function HistoryDrawer({ jobId, onClose }: { jobId: string; onClose: () => void }): React.ReactElement {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.get<{ runs: RunRecord[]; count: number }>(
        `/admin/schedule/${encodeURIComponent(jobId)}/history`,
      );
      setRuns(res.data.runs);
    } catch {
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  const clear = useCallback(async () => {
    if (!confirm(`Wipe all run history for "${jobId}"?`)) return;
    setClearing(true);
    try {
      await adminApi.delete(`/admin/schedule/${encodeURIComponent(jobId)}/history`);
      setRuns([]);
    } finally {
      setClearing(false);
    }
  }, [jobId]);

  const statusColor = (s: RunRecord['status']): string => {
    switch (s) {
      case 'success': return 'text-accent';
      case 'error': return 'text-red-400';
      case 'skipped': return 'text-ink-faint';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ x: 600 }}
        animate={{ x: 0 }}
        exit={{ x: 600 }}
        transition={{ type: 'tween', duration: 0.2 }}
        className="absolute right-0 top-0 bottom-0 w-[640px] max-w-full bg-card border-l border-border shadow-xl overflow-y-auto custom-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">Run history</h2>
            <p className="text-xs text-ink-faint font-mono mt-0.5">{jobId}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clear}
              disabled={clearing || runs.length === 0}
              className="admin-btn-secondary px-3 py-1.5 text-xs text-danger disabled:opacity-50"
            >
              {clearing ? 'Clearing…' : 'Clear history'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="admin-btn-secondary px-3 py-1.5 text-xs"
            >
              Close
            </button>
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <p className="text-sm text-ink-faint">Loading…</p>
          ) : runs.length === 0 ? (
            <p className="text-sm text-ink-faint">No run history yet. Trigger the job to populate.</p>
          ) : (
            <div className="space-y-2">
              {runs.map((r) => (
                <div key={r._id} className="admin-card-surface p-3 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`font-mono font-semibold ${statusColor(r.status)}`}>
                      {r.status}
                    </span>
                    <span className="text-ink-faint">
                      {r.triggeredBy === 'admin' ? '⚡ admin trigger' : '⏰ scheduled'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-ink-soft">
                    <span>{new Date(r.startedAt).toLocaleString()}</span>
                    <span>
                      {r.durationMs !== null ? `${r.durationMs}ms` : 'in flight'}
                    </span>
                  </div>
                  {r.error && (
                    <div className="mt-2 text-[11px] text-red-400 bg-red-50 border border-red-200 rounded p-2 font-mono break-all">
                      {r.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}