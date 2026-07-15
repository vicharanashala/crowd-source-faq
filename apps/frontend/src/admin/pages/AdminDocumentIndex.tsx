/**
 * AdminDocumentIndex — v1.84.
 *
 * Read-only diagnostics view for the admin document library. Shows:
 *   - Every DocumentAsset with its index state (embedded /
 *     metadata-only / not-indexed), category, tags, and the most
 *     recent error from a failed ingestion.
 *   - The in-memory ring of the last 50 reindex operations (from
 *     /admin/documents/diagnostics) so admins can see "what just
 *     happened" without grepping the server log.
 *   - A "Re-index all" button at the top (the only write op here —
 *     individual reindexes live on the Upload Document tab).
 *
 * Sits as a tab inside the unified /admin/knowledge page so the
 * existing sidebar entry covers it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import adminApi from '../utils/adminApi';
import { friendlyError } from '../../utils/api';
import { AdminCard } from '../components/ui/AdminCard';
import Badge from '../components/common/Badge';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DocumentRow {
  _id: string;
  title: string;
  filename: string;
  mimeType?: string;
  sizeBytes: number;
  pageCount?: number;
  uploadedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  embeddedAt?: string | null;
  embeddingSkippedReason?: string | null;
  lastFetchError?: string | null;
  metadata?: {
    category?: string;
    audience?: string;
    tags?: string[];
    summary?: string;
  } | null;
  metadataExtractedAt?: string | null;
}

interface ReindexLogEntry {
  ts: number;
  documentId: string;
  documentTitle: string;
  ok: boolean;
  embedded: boolean;
  durationMs: number;
  reason?: string;
}

type StatusFilter = 'all' | 'embedded' | 'metadata-only' | 'not-indexed' | 'failed';

// ─── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(input?: string | number | null): string {
  if (input == null) return '';
  const t = typeof input === 'number' ? input : new Date(input).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  if (diff < 0) return 'just now';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function formatBytes(n: number): string {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function statusOf(row: DocumentRow): StatusFilter {
  if (row.lastFetchError) return 'failed';
  if (row.embeddedAt) return 'embedded';
  if (row.embeddingSkippedReason || row.metadataExtractedAt) return 'metadata-only';
  return 'not-indexed';
}

// ─── Page ──────────────────────────────────────────────────────────────────

const PAGE_LIMIT = 100;
const REFRESH_INTERVAL_MS = 15_000;

export default function AdminDocumentIndex() {
  const [items, setItems] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState<string>('');
  const [log, setLog] = useState<ReindexLogEntry[]>([]);
  const [reindexAllPending, setReindexAllPending] = useState<boolean>(false);
  const [flash, setFlash] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    try {
      const r = await adminApi.get<{ items: DocumentRow[] }>(
        '/admin/documents',
        { params: { page: 1, limit: PAGE_LIMIT } },
      );
      setItems(r.data?.items ?? []);
    } catch (e) {
      setError(friendlyError(e, 'Failed to load documents.'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLog = useCallback(async () => {
    try {
      const r = await adminApi.get<{ items: ReindexLogEntry[] }>(
        '/admin/documents/diagnostics',
      );
      setLog(r.data?.items ?? []);
    } catch {
      // The endpoint may not exist in older deploys — silently no-op.
      setLog([]);
    }
  }, []);

  useEffect(() => { void fetchList(); }, [fetchList]);
  useEffect(() => { void fetchLog(); }, [fetchLog]);

  // Auto-refresh the log every 15s so admins see new reindex
  // events without refreshing the page.
  useEffect(() => {
    const id = setInterval(() => { void fetchLog(); }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchLog]);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: items.length,
      embedded: 0,
      'metadata-only': 0,
      'not-indexed': 0,
      failed: 0,
    };
    for (const r of items) c[statusOf(r)]++;
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((r) => {
      if (filter !== 'all' && statusOf(r) !== filter) return false;
      if (!q) return true;
      return (
        (r.title ?? '').toLowerCase().includes(q) ||
        (r.filename ?? '').toLowerCase().includes(q) ||
        (r.metadata?.category ?? '').toLowerCase().includes(q) ||
        (r.metadata?.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [items, filter, search]);

  const handleReindexAll = async () => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        `Re-index all ${items.length} documents? This will call the LLM once per doc and (when EMBEDDING_MODEL is set) the embedding API.`,
      );
      if (!ok) return;
    }
    setReindexAllPending(true);
    setFlash(null);
    try {
      const r = await adminApi.post('/admin/documents/reindex?target=all');
      const s = r.data as { processed?: number; failed?: number; embeddedCount?: number; metadataOnlyCount?: number };
      setFlash(
        `Re-indexed ${s.processed ?? 0} of ${items.length}: ` +
          `${s.embeddedCount ?? 0} embedded, ${s.metadataOnlyCount ?? 0} metadata-only, ` +
          `${s.failed ?? 0} failed.`,
      );
      await Promise.all([fetchList(), fetchLog()]);
    } catch (e) {
      setFlash(`Re-index failed: ${friendlyError(e, 'unknown error')}`);
    } finally {
      setReindexAllPending(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="admin-document-index">
      <AdminCard
        title="Document Index — Diagnostics"
        subtitle="Read-only view of every uploaded document and its current indexing state. Use 'Re-index all' to refresh after a model change or upload. The activity log shows the last 50 reindex operations."
      >
        {/* Status filter pills + search */}
        <div className="flex flex-wrap items-center gap-2 mb-3" data-testid="document-index-filters">
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'embedded', label: 'Embedded' },
              { key: 'metadata-only', label: 'Metadata only' },
              { key: 'not-indexed', label: 'Not indexed' },
              { key: 'failed', label: 'Failed' },
            ] as { key: StatusFilter; label: string }[]
          ).map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                data-testid={`document-index-filter-${f.key}`}
                className={`text-[11px] px-3 py-1.5 rounded-lg border font-semibold transition-colors ${
                  active
                    ? 'bg-accent text-white border-accent'
                    : 'bg-card text-ink-soft border-border hover:bg-mist'
                }`}
              >
                {f.label} <span className="ml-1 opacity-70">{counts[f.key]}</span>
              </button>
            );
          })}
          <div className="flex-1" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, filename, tag, category…"
            data-testid="document-index-search"
            className="text-xs px-3 py-1.5 rounded-lg border border-border bg-card text-ink placeholder:text-ink-faint w-64"
          />
        </div>

        {/* Bulk action toolbar */}
        <div
          data-testid="document-index-toolbar"
          className="flex items-center justify-between gap-3 p-3 rounded-xl bg-accent/5 border border-accent/30 mb-3"
        >
          <p className="text-[11px] text-ink-soft">
            Showing <span className="font-semibold text-ink">{filtered.length}</span> of{' '}
            <span className="font-semibold text-ink">{items.length}</span> documents
            {filter !== 'all' ? ` (filter: ${filter})` : ''}.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { void fetchList(); void fetchLog(); }}
              data-testid="document-index-refresh"
              className="text-[11px] px-3 py-1.5 rounded-lg bg-card border border-border text-ink-soft hover:bg-mist font-semibold"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={handleReindexAll}
              disabled={reindexAllPending || items.length === 0}
              data-testid="document-index-reindex-all"
              className="text-[11px] px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed font-semibold"
            >
              {reindexAllPending ? 'Re-indexing all…' : `Re-index all (${items.length})`}
            </button>
          </div>
        </div>

        {flash && (
          <div
            data-testid="document-index-flash"
            className="text-[11px] px-3 py-2 rounded-xl bg-accent/5 border border-accent/20 text-accent mb-3"
          >
            {flash}
          </div>
        )}
        {error && (
          <div
            data-testid="document-index-error"
            className="text-[11px] px-3 py-2 rounded-xl bg-danger/5 border border-danger/20 text-danger mb-3"
          >
            {error}
          </div>
        )}

        {/* Document table */}
        {loading ? (
          <div className="space-y-2" data-testid="document-index-loading">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-mist rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-mist/30 border border-border rounded-xl px-6 py-10 text-center">
            <p className="text-sm text-ink-faint">No documents match the current filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto" data-testid="document-index-table-wrap">
            <table className="w-full text-xs" data-testid="document-index-table">
              <thead>
                <tr className="text-left text-ink-faint border-b border-border">
                  <th className="py-2 pr-3 font-semibold">Title</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 pr-3 font-semibold">Category</th>
                  <th className="py-2 pr-3 font-semibold">Tags</th>
                  <th className="py-2 pr-3 font-semibold">Last indexed</th>
                  <th className="py-2 pr-3 font-semibold">Size</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const status = statusOf(r);
                  const tags = r.metadata?.tags ?? [];
                  return (
                    <tr key={r._id} data-testid="document-index-row" className="border-b border-border/60 align-top">
                      <td className="py-2 pr-3 min-w-[200px]">
                        <p className="font-semibold text-ink truncate max-w-[280px]" title={r.title}>
                          {r.title || r.filename}
                        </p>
                        <p className="text-[10px] text-ink-faint truncate max-w-[280px]" title={r.filename}>
                          {r.filename}
                        </p>
                        {r.embeddingSkippedReason && (
                          <p
                            className="text-[10px] text-warning mt-1 max-w-[280px]"
                            title={r.embeddingSkippedReason}
                            data-testid="document-index-skip-reason"
                          >
                            ! {r.embeddingSkippedReason}
                          </p>
                        )}
                        {r.lastFetchError && (
                          <p
                            className="text-[10px] text-danger mt-1 max-w-[280px]"
                            title={r.lastFetchError}
                            data-testid="document-index-fetch-error"
                          >
                            fetch error: {r.lastFetchError}
                          </p>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {status === 'embedded' ? (
                          <Badge status="approved" label={`embedded ${relativeTime(r.embeddedAt)}`} showDot />
                        ) : status === 'metadata-only' ? (
                          <Badge status="pending" label="metadata only" showDot />
                        ) : status === 'failed' ? (
                          <Badge status="rejected" label="fetch failed" showDot />
                        ) : (
                          <Badge status="default" label="not indexed" showDot />
                        )}
                      </td>
                      <td className="py-2 pr-3 text-ink-soft">
                        {r.metadata?.category ?? <span className="text-ink-faint">—</span>}
                      </td>
                      <td className="py-2 pr-3">
                        {tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {tags.slice(0, 4).map((t) => (
                              <span
                                key={t}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-mist text-ink-soft font-mono"
                              >
                                {t}
                              </span>
                            ))}
                            {tags.length > 4 && (
                              <span className="text-[10px] text-ink-faint">+{tags.length - 4}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-ink-faint whitespace-nowrap">
                        {relativeTime(r.embeddedAt ?? r.metadataExtractedAt ?? r.uploadedAt)}
                      </td>
                      <td className="py-2 pr-3 text-ink-faint whitespace-nowrap">
                        {formatBytes(r.sizeBytes ?? 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      <AdminCard
        title="Recent reindex activity"
        subtitle="Last 50 reindex operations across the process. Auto-refreshes every 15 seconds."
      >
        {log.length === 0 ? (
          <div className="text-[11px] text-ink-faint italic px-2 py-4" data-testid="document-index-log-empty">
            No reindex activity recorded yet. Click "Re-index all" above to populate.
          </div>
        ) : (
          <ul className="space-y-1" data-testid="document-index-log">
            {log.slice(0, 25).map((e, i) => (
              <li
                key={`${e.ts}-${i}`}
                className="flex items-start gap-2 text-[11px] font-mono py-1 border-b border-border/40 last:border-0"
              >
                <span className="text-ink-faint shrink-0 w-20">{relativeTime(e.ts)}</span>
                <span
                  className={`shrink-0 w-3 h-3 rounded-full mt-1 ${
                    e.embedded ? 'bg-success' : e.ok ? 'bg-warning' : 'bg-danger'
                  }`}
                  title={e.embedded ? 'embedded' : e.ok ? 'metadata only' : 'failed'}
                />
                <span className="text-ink flex-1 truncate">
                  {e.documentTitle || e.documentId}
                </span>
                <span className="text-ink-faint shrink-0 w-16 text-right">{e.durationMs}ms</span>
                {e.reason && (
                  <span className="text-warning shrink-0 max-w-[200px] truncate" title={e.reason}>
                    {e.reason}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </AdminCard>
    </div>
  );
}
