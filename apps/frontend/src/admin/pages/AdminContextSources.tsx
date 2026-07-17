/**
 * AdminContextSources — Phase 7.
 *
 * A single admin page with two tabs for managing the AI's
 * retrieval-side knowledge base:
 *
 *  1. Web pages  — paste a URL, the server fetches + extracts text, and
 *                  the row is added to the global WebPage index. The
 *                  `webTextSource` retrieval fan-out queries this index.
 *  2. Documents  — upload a PDF / TXT / MD / CSV; the server extracts
 *                  text + page count, stores the file on disk, and
 *                  persists a DocumentAsset row. The `documentTextSource`
 *                  fan-out queries this index.
 *
 * Both tabs share the same layout: a single AdminCard with an "add"
 * form at the top, a list below. Each row exposes a Delete button
 * gated by a `window.confirm` so admins don't lose data by accident.
 *
 * Endpoints (already shipped in Phase 5 + 6):
 *   GET    /admin/web-pages?page=&limit=
 *   POST   /admin/web-pages        body: { url }
 *   DELETE /admin/web-pages/:id
 *   GET    /admin/documents?page=&limit=
 *   POST   /admin/documents        multipart/form-data  field: file
 *   DELETE /admin/documents/:id
 *
 * State management is local useState only — no TanStack Query (per
 * plan §6.7). Both tabs share the page header + tab bar; their list
 * state is independent.
 */
import { useEffect, useMemo, useState } from 'react';
import adminApi from '../utils/adminApi';
import { friendlyError } from '../../utils/api';
import { AdminCard } from '../components/ui/AdminCard';
import Badge from '../components/common/Badge';

// ── Types ──────────────────────────────────────────────────────────────────

interface WebPageRow {
  _id: string;
  url: string;
  domain: string;
  title?: string;
  text?: string;
  source?: string;
  statusCode?: number;
  lastFetchError?: string | null;
  fetchedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

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
  // Phase 9 — populated by documentIngestion.service.
  // `embeddedAt: null` and `embeddingSkippedReason: <reason>` means
  // the LLM indexed the metadata but the embedding step was skipped
  // (no EMBEDDING_MODEL set, or the call failed). The UI surfaces
  // this as a "metadata-only" badge so admins know the doc is
  // keyword-searchable but not vector-searchable.
  embeddedAt?: string | null;
  embeddingSkippedReason?: string | null;
  metadata?: {
    category?: string;
    audience?: string;
    tags?: string[];
    summary?: string;
  } | null;
  metadataExtractedAt?: string | null;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

type TabKey = 'web' | 'document';
type ContextTab = 'web' | 'document';

// ── Constants ──────────────────────────────────────────────────────────────

const PAGE_LIMIT = 50;

// ── Helpers ────────────────────────────────────────────────────────────────

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function relativeTime(iso?: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffMs = Date.now() - then;
  if (diffMs < 0) return 'just now';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec} seconds ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? '' : 's'} ago`;
  const yr = Math.floor(day / 365);
  return `${yr} year${yr === 1 ? '' : 's'} ago`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

// ── Sub-views ──────────────────────────────────────────────────────────────

interface WebPageListProps {
  items: WebPageRow[];
  loading: boolean;
  error: string | null;
  onDelete: (row: WebPageRow) => void;
  deletePendingId: string | null;
}

function WebPageList({ items, loading, error, onDelete, deletePendingId }: WebPageListProps) {
  if (loading) {
    return (
      <div className="space-y-2" data-testid="web-pages-loading">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-mist rounded-xl border border-border p-4 animate-pulse"
          >
            <div className="h-4 bg-card rounded w-2/3 mb-2" />
            <div className="h-3 bg-card rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        data-testid="web-pages-error"
        className="text-xs px-4 py-3 rounded-xl bg-danger/5 border border-danger/20 text-danger"
      >
        {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        data-testid="web-pages-empty"
        className="bg-card border border-border rounded-xl px-6 py-10 text-center"
      >
        <p className="text-sm text-ink-faint">No web pages indexed yet.</p>
        <p className="text-xs text-ink-faint mt-1">
          Paste a URL above to add one — the server will fetch it and extract text.
        </p>
      </div>
    );
  }

  return (
    <ul data-testid="web-pages-list" className="space-y-2">
      {items.map((row) => {
        const isPending = deletePendingId === row._id;
        const broken = !!row.lastFetchError;
        const domain = row.domain || safeHostname(row.url);
        return (
          <li
            key={row._id}
            data-testid="web-pages-row"
            data-row-id={row._id}
            className="bg-card border border-border rounded-xl p-3 flex items-start gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="text-sm font-semibold text-ink truncate">
                  {row.title?.trim() ? row.title : row.url}
                </h3>
                {broken && (
                  <Badge status="rejected" label="broken" showDot />
                )}
                {row.fetchedAt && (
                  <span
                    className="text-[10px] text-ink-faint"
                    title={row.fetchedAt}
                  >
                    fetched {relativeTime(row.fetchedAt)}
                  </span>
                )}
              </div>
              <a
                href={row.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent hover:underline break-all"
              >
                {row.url}
              </a>
              {domain && (
                <span className="ml-2 text-[10px] font-mono text-ink-faint">
                  {domain}
                </span>
              )}
              {broken && row.lastFetchError && (
                <p
                  className="text-[11px] text-danger mt-1.5 font-mono break-words"
                  title={row.lastFetchError}
                >
                  {truncate(row.lastFetchError, 160)}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDelete(row)}
              disabled={isPending}
              aria-label={`Delete ${row.title || row.url}`}
              className="text-[11px] px-3 py-1.5 rounded-lg bg-danger/10 border border-danger/20 text-danger hover:bg-danger/20 transition-all disabled:opacity-50 shrink-0"
            >
              {isPending ? 'Deleting…' : 'Delete'}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

interface DocumentListProps {
  items: DocumentRow[];
  loading: boolean;
  error: string | null;
  onDelete: (row: DocumentRow) => void;
  deletePendingId: string | null;
  // Phase 9 — selection + bulk re-index. When `selectedIds` is
  // provided the list renders checkboxes; `onSelectionChange`
  // receives the new set; `onReindexSelected` and `onReindexAll`
  // trigger the admin endpoints. The parent owns the selection
  // state and the "all" button is rendered by the parent above
  // the list, not here, so the list can stay focused on rendering.
  selectedIds?: Set<string>;
  onSelectionChange?: (next: Set<string>) => void;
  reindexPendingId?: string | null;
  reindexAllPending?: boolean;
}

function DocumentList({
  items,
  loading,
  error,
  onDelete,
  deletePendingId,
  selectedIds,
  onSelectionChange,
  reindexPendingId,
  reindexAllPending,
}: DocumentListProps) {
  if (loading) {
    return (
      <div className="space-y-2" data-testid="documents-loading">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-mist rounded-xl border border-border p-4 animate-pulse"
          >
            <div className="h-4 bg-card rounded w-2/3 mb-2" />
            <div className="h-3 bg-card rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        data-testid="documents-error"
        className="text-xs px-4 py-3 rounded-xl bg-danger/5 border border-danger/20 text-danger"
      >
        {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        data-testid="documents-empty"
        className="bg-card border border-border rounded-xl px-6 py-10 text-center"
      >
        <p className="text-sm text-ink-faint">No documents uploaded yet.</p>
        <p className="text-xs text-ink-faint mt-1">
          Upload a PDF, TXT, MD, or CSV above to add one.
        </p>
      </div>
    );
  }

  const showSelection = selectedIds !== undefined && onSelectionChange !== undefined;
  const allSelected = showSelection && items.every((r) => selectedIds!.has(r._id));
  const toggleAll = () => {
    if (!showSelection) return;
    if (allSelected) {
      onSelectionChange!(new Set());
    } else {
      onSelectionChange!(new Set(items.map((r) => r._id)));
    }
  };
  const toggleOne = (id: string) => {
    if (!showSelection) return;
    const next = new Set(selectedIds!);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange!(next);
  };

  return (
    <div data-testid="documents-list-wrapper">
      {showSelection && (
        <div className="flex items-center justify-between mb-2 text-[11px] text-ink-soft">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              data-testid="documents-select-all"
              aria-label="Select all documents"
              className="cursor-pointer"
            />
            <span>{allSelected ? 'All selected' : 'Select all'}</span>
          </label>
          {reindexAllPending && (
            <span className="text-ink-faint" data-testid="documents-reindex-all-pending">
              Re-indexing all documents…
            </span>
          )}
        </div>
      )}
      <ul data-testid="documents-list" className="space-y-2">
        {items.map((row) => {
          const isPending = deletePendingId === row._id;
          const isReindexing = reindexPendingId === row._id;
          const pageCount = typeof row.pageCount === 'number' ? row.pageCount : 0;
          const isEmbedded = !!row.embeddedAt;
          const isSelected = showSelection && selectedIds!.has(row._id);
          const tags = row.metadata?.tags ?? [];
          return (
            <li
              key={row._id}
              data-testid="documents-row"
              data-row-id={row._id}
              className={`bg-card border rounded-xl p-3 flex items-start gap-3 ${
                isSelected ? 'border-accent' : 'border-border'
              }`}
            >
              {showSelection && (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleOne(row._id)}
                  disabled={isReindexing}
                  aria-label={`Select ${row.title || row.filename}`}
                  data-testid="documents-row-checkbox"
                  className="mt-1 cursor-pointer disabled:opacity-50"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="text-sm font-semibold text-ink truncate">
                    {row.title || row.filename}
                  </h3>
                  {pageCount > 0 && (
                    <Badge status="default" label={`${pageCount} page${pageCount === 1 ? '' : 's'}`} showDot={false} />
                  )}
                  {/* Phase 9 — indexing status badge. Three states:
                       - embedded: green/approved (vector + keyword)
                       - metadata only (skippedReason set): yellow/pending (keyword only)
                       - never indexed: default (will be picked up on next reindex) */}
                  {isEmbedded ? (
                    <Badge
                      status="approved"
                      label={`embedded ${relativeTime(row.embeddedAt)}`}
                      showDot
                    />
                  ) : row.embeddingSkippedReason ? (
                    <Badge status="pending" label="metadata only" showDot />
                  ) : (
                    <Badge status="default" label="not indexed" showDot />
                  )}
                  {row.metadata?.category && (
                    <Badge
                      status="default"
                      label={row.metadata.category}
                      showDot={false}
                    />
                  )}
                  {row.uploadedAt && (
                    <span
                      className="text-[10px] text-ink-faint"
                      title={row.uploadedAt}
                    >
                      uploaded {relativeTime(row.uploadedAt)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-soft truncate" title={row.filename}>
                  {row.filename}
                </p>
                {row.metadata?.summary && (
                  <p className="text-[11px] text-ink-faint mt-1 italic line-clamp-2">
                    {row.metadata.summary}
                  </p>
                )}
                {tags.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap mt-1">
                    {tags.slice(0, 6).map((t) => (
                      <span
                        key={t}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-mist text-ink-soft font-mono"
                      >
                        {t}
                      </span>
                    ))}
                    {tags.length > 6 && (
                      <span className="text-[10px] text-ink-faint">+{tags.length - 6} more</span>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-3 mt-1 text-[10px] text-ink-faint">
                  <span>{formatBytes(row.sizeBytes ?? 0)}</span>
                  {row.mimeType && <span className="font-mono">{row.mimeType}</span>}
                </div>
                {isReindexing && (
                  <p className="text-[10px] text-accent mt-1" data-testid="documents-row-reindexing">
                    Re-indexing…
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onDelete(row)}
                disabled={isPending}
                aria-label={`Delete ${row.title || row.filename}`}
                className="text-[11px] px-3 py-1.5 rounded-lg bg-danger/10 border border-danger/20 text-danger hover:bg-danger/20 transition-all disabled:opacity-50 shrink-0"
              >
                {isPending ? 'Deleting…' : 'Delete'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Reusable views (v1.83 — extracted so they can also be embedded
// into the unified AdminKnowledge tab page). The default export
// composes them behind its own local tab state for the legacy
// `/admin/context-sources` entry point.

/**
 * WebUrlView — add-by-URL form + list for `WebPage`. Self-contained:
 * owns its own state, fetches `/admin/web-pages`. Embed it inside
 * any page that wants the same UX the legacy tab had.
 */
export function WebUrlView({ bare = false }: { bare?: boolean } = {}) {
  const [items, setItems] = useState<WebPageRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string>('');
  const [addPending, setAddPending] = useState<boolean>(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [deletePendingId, setDeletePendingId] = useState<string | null>(null);

  const fetchList = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await adminApi.get<PaginatedResponse<WebPageRow>>(
        '/admin/web-pages',
        { params: { page: 1, limit: PAGE_LIMIT } },
      );
      setItems(r.data?.items ?? []);
    } catch (e) {
      setError(friendlyError(e, 'Failed to load web pages.'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchList(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = url.trim();
    if (!u) { setAddError('Enter a URL.'); return; }
    setAddPending(true);
    setAddError(null);
    setAddSuccess(null);
    try {
      const r = await adminApi.post('/admin/web-pages', { url: u });
      const addedUrl: string = r.data?.page?.url ?? u;
      setUrl('');
      setAddSuccess(`Added ${addedUrl}.`);
      await fetchList();
    } catch (e) {
      const status = (e as { response?: { status?: number; data?: { message?: string; url?: string; extractedChars?: number } } })?.response?.status;
      const detail = (e as { response?: { data?: { message?: string; url?: string; extractedChars?: number } } })?.response?.data;
      let msg = friendlyError(e, 'Could not add that page.');
      if (status === 400) {
        msg = 'Invalid URL. Use a full http(s) URL (and skip browser hash fragments like #section).';
      } else if (status === 422) {
        const server = detail?.message;
        const theUrl = detail?.url;
        const chars = detail?.extractedChars;
        msg = server
          ? `${server}${theUrl ? ` (${theUrl})` : ''}${chars != null ? ` — only ${chars} chars extracted.` : ''}`
          : 'That page has no extractable text — likely JS-only or a login wall.';
      } else if (status === 502) {
        msg = 'Could not fetch the page from the upstream URL.';
      }
      setAddError(msg);
    } finally {
      setAddPending(false);
    }
  };

  const handleDelete = async (row: WebPageRow) => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        `Delete "${row.title?.trim() || row.url}"? The text will be removed from the retrieval index.`,
      );
      if (!ok) return;
    }
    setDeletePendingId(row._id);
    try {
      await adminApi.delete(`/admin/web-pages/${row._id}`);
      await fetchList();
    } catch (e) {
      setError(friendlyError(e, 'Could not delete that page.'));
    } finally {
      setDeletePendingId(null);
    }
  };

  const body = (
    <>
      <form
        onSubmit={handleAdd}
        className="flex items-stretch gap-2 mb-4"
        data-testid="web-pages-form"
      >
        <input
          type="url"
          required
          value={url}
          onChange={(e) => { setUrl(e.target.value); setAddError(null); setAddSuccess(null); }}
          placeholder="https://example.com/article"
          aria-label="Web page URL"
          data-testid="web-pages-url-input"
          disabled={addPending}
          className="flex-1 rounded-xl border border-border bg-mist px-3 py-2 text-xs text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={addPending || !url.trim()}
          data-testid="web-pages-add-btn"
          className="text-xs px-4 py-2 rounded-xl bg-accent text-white font-semibold hover:bg-accent/90 transition-all disabled:opacity-50 shrink-0"
        >
          {addPending ? 'Adding…' : 'Add'}
        </button>
      </form>

      {addError && (
        <div data-testid="web-pages-add-error" className="text-xs px-4 py-3 rounded-xl bg-danger/5 border border-danger/20 text-danger mb-4">
          {addError}
        </div>
      )}
      {addSuccess && (
        <div data-testid="web-pages-add-success" className="text-xs px-4 py-3 rounded-xl bg-success/5 border border-success/20 text-success mb-4">
          {addSuccess}
        </div>
      )}

      <WebPageList items={items} loading={loading} error={error} onDelete={handleDelete} deletePendingId={deletePendingId} />
    </>
  );

  if (bare) return <div data-testid="web-url-view">{body}</div>;
  return (
    <AdminCard
      title="Web pages"
      subtitle="Paste a URL — the server fetches it and extracts the text for the retrieval index."
    >
      {body}
    </AdminCard>
  );
}

/**
 * UploadDocumentView — file-upload form + list for `DocumentAsset`.
 * Self-contained: owns its own state, fetches `/admin/documents`.
 * v1.83 — `.html` / `.htm` added to the accept= list; uploads will
 * still be rejected by the backend until ALLOWED_MIME in
 * adminDocuments.controller.ts is extended (tracked as a TODO).
 */
export function UploadDocumentView({ bare = false }: { bare?: boolean } = {}) {
  const [items, setItems] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadPending, setUploadPending] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [deletePendingId, setDeletePendingId] = useState<string | null>(null);
  // Phase 9 — selection + re-index state. Lives in the parent so
  // it survives re-renders triggered by the polling refresh after
  // a reindex completes.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reindexPendingId, setReindexPendingId] = useState<string | null>(null);
  const [reindexAllPending, setReindexAllPending] = useState<boolean>(false);
  const [reindexMessage, setReindexMessage] = useState<string | null>(null);
  // Embedding availability is read from the backend response (each
  // document reports `embedded: true|false` after re-index). We
  // don't surface it as a static boolean because it's controlled by
  // the EMBEDDING_MODEL env var on the server, which the frontend
  // can't read. The result message shows per-doc results so admins
  // see whether the embedding step actually fired.

  const fetchList = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await adminApi.get<PaginatedResponse<DocumentRow>>(
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
  };

  useEffect(() => { void fetchList(); }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
    setUploadError(null);
    setUploadSuccess(null);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setUploadError('Pick a file first.'); return; }
    setUploadPending(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await adminApi.post('/admin/documents', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const filename: string = r.data?.document?.filename ?? file.name;
      setFile(null);
      const input = document.getElementById('context-doc-file') as HTMLInputElement | null;
      if (input) input.value = '';
      setUploadSuccess(`Uploaded ${filename}.`);
      await fetchList();
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      let msg = friendlyError(e, 'Upload failed.');
      if (status === 400) msg = 'That file type is not supported. Use PDF, TXT, MD, CSV, HTML, or HTM.';
      else if (status === 422) msg = 'We could not extract any text from that file.';
      setUploadError(msg);
    } finally {
      setUploadPending(false);
    }
  };

  const handleDelete = async (row: DocumentRow) => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        `Delete "${row.title || row.filename}"? The file will be removed from disk.`,
      );
      if (!ok) return;
    }
    setDeletePendingId(row._id);
    try {
      await adminApi.delete(`/admin/documents/${row._id}`);
      await fetchList();
    } catch (e) {
      setError(friendlyError(e, 'Could not delete that document.'));
    } finally {
      setDeletePendingId(null);
    }
  };

  // Phase 9 — re-index a single doc by id. Used by the
  // "Re-index selected" bulk action. Sequential, not parallel, so
  // the LLM call rate doesn't spike when the admin selects 50 docs
  // and the server tries to embed them all at once.
  const reindexOne = async (id: string): Promise<{ ok: boolean; embedded: boolean; reason?: string }> => {
    setReindexPendingId(id);
    try {
      const r = await adminApi.post(
        `/admin/documents/reindex?target=${encodeURIComponent(id)}`,
      );
      const embedded = !!r.data?.embedded;
      const reason = r.data?.embeddingSkippedReason ?? null;
      return { ok: true, embedded, reason: reason ?? undefined };
    } catch (e) {
      return { ok: false, embedded: false, reason: friendlyError(e, 'Re-index failed.') };
    } finally {
      setReindexPendingId(null);
    }
  };

  const handleReindexSelected = async () => {
    if (selectedIds.size === 0) return;
    setReindexMessage(null);
    const ids = Array.from(selectedIds);
    let ok = 0;
    let metadataOnly = 0;
    let failed = 0;
    for (const id of ids) {
      const result = await reindexOne(id);
      if (!result.ok) { failed++; continue; }
      if (result.embedded) ok++;
      else metadataOnly++;
    }
    setSelectedIds(new Set());
    setReindexMessage(
      failed > 0
        ? `Re-indexed ${ok + metadataOnly} of ${ids.length} (${ok} embedded, ${metadataOnly} metadata-only, ${failed} failed).`
        : `Re-indexed ${ids.length} documents: ${ok} embedded, ${metadataOnly} metadata-only.`,
    );
    await fetchList();
  };

  const handleReindexAll = async () => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        `Re-index all ${items.length} documents? This will call the LLM once per doc and (when EMBEDDING_MODEL is set) the embedding API. May take a few minutes for large libraries.`,
      );
      if (!ok) return;
    }
    setReindexAllPending(true);
    setReindexMessage(null);
    try {
      const r = await adminApi.post('/admin/documents/reindex?target=all');
      const summary = r.data as {
        scanned?: number;
        processed?: number;
        failed?: number;
        embeddedCount?: number;
        metadataOnlyCount?: number;
      };
      setReindexMessage(
        `Re-indexed ${summary.processed ?? 0} of ${summary.scanned ?? items.length}: ` +
          `${summary.embeddedCount ?? 0} embedded, ${summary.metadataOnlyCount ?? 0} metadata-only, ` +
          `${summary.failed ?? 0} failed.`,
      );
      setSelectedIds(new Set());
      await fetchList();
    } catch (e) {
      setReindexMessage(`Re-index failed: ${friendlyError(e, 'unknown error')}`);
    } finally {
      setReindexAllPending(false);
    }
  };

  const body = (
    <>
      <form onSubmit={handleUpload} className="flex items-stretch gap-2 mb-4" data-testid="documents-form">
        <input
          id="context-doc-file"
          type="file"
          // v1.83 — accept HTML too. Backend ALLOWED_MIME set does NOT
          // yet include `text/html` / `application/xhtml+xml`; a
          // follow-up backend PR will add extraction support. Until
          // then an HTML upload returns 400 and the existing error
          // path displays "unsupported file type".
          accept=".pdf,.txt,.md,.csv,.html,.htm"
          onChange={handleFileChange}
          disabled={uploadPending}
          aria-label="Document file"
          data-testid="documents-file-input"
          className="flex-1 text-xs text-ink file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-accent/10 file:text-accent hover:file:bg-accent/20 cursor-pointer disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={uploadPending || !file}
          data-testid="documents-upload-btn"
          className="text-xs px-4 py-2 rounded-xl bg-accent text-white font-semibold hover:bg-accent/90 transition-all disabled:opacity-50 shrink-0"
        >
          {uploadPending ? 'Uploading…' : 'Upload'}
        </button>
      </form>

      {file && (
        <p data-testid="documents-selected" className="text-[11px] text-ink-soft mb-4">
          Selected: <span className="font-mono">{file.name}</span> ({formatBytes(file.size)})
        </p>
      )}

      {uploadError && (
        <div data-testid="documents-upload-error" className="text-xs px-4 py-3 rounded-xl bg-danger/5 border border-danger/20 text-danger mb-4">{uploadError}</div>
      )}
      {uploadSuccess && (
        <div data-testid="documents-upload-success" className="text-xs px-4 py-3 rounded-xl bg-success/5 border border-success/20 text-success mb-4">{uploadSuccess}</div>
      )}

      {/* Phase 9 — bulk re-index toolbar. Always visible so admins
          see the re-index affordance as soon as the page opens, even
          before the list finishes loading. Distinct background + a
          small section header so it doesn't get mistaken for a
          filter row. */}
      <div
        data-testid="documents-reindex-toolbar"
        className="flex items-center justify-between gap-3 mb-3 p-3 rounded-xl bg-accent/5 border border-accent/30"
      >
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-ink flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
            Re-index documents
          </p>
          <p className="text-[11px] text-ink-soft mt-0.5">
            {selectedIds.size > 0 ? (
              <span>
                <span className="font-semibold text-ink">{selectedIds.size}</span> selected
                — re-extract metadata (and embeddings, if EMBEDDING_MODEL is set on the server)
              </span>
            ) : (
              <span>
                Select rows below, or re-index all. Re-runs the LLM metadata extractor and
                (if EMBEDDING_MODEL is set on the server) the embedding API.
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleReindexSelected}
            disabled={selectedIds.size === 0 || !!reindexPendingId || reindexAllPending}
            data-testid="documents-reindex-selected-btn"
            className="text-[11px] px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed font-semibold"
          >
            {reindexPendingId && selectedIds.has(reindexPendingId)
              ? 'Re-indexing…'
              : `Re-index selected (${selectedIds.size})`}
          </button>
          <button
            type="button"
            onClick={handleReindexAll}
            disabled={reindexAllPending || !!reindexPendingId || items.length === 0}
            data-testid="documents-reindex-all-btn"
            className="text-[11px] px-3 py-1.5 rounded-lg bg-card border border-accent/40 text-accent hover:bg-accent/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed font-semibold"
          >
            {reindexAllPending ? 'Re-indexing all…' : `Re-index all (${items.length})`}
          </button>
        </div>
      </div>

      {reindexMessage && (
        <div
          data-testid="documents-reindex-message"
          className="text-[11px] px-3 py-2 rounded-xl bg-accent/5 border border-accent/20 text-accent mb-3"
        >
          {reindexMessage}
        </div>
      )}

      <DocumentList
        items={items}
        loading={loading}
        error={error}
        onDelete={handleDelete}
        deletePendingId={deletePendingId}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        reindexPendingId={reindexPendingId}
        reindexAllPending={reindexAllPending}
      />
    </>
  );

  if (bare) return <div data-testid="upload-document-view">{body}</div>;
  return (
    <AdminCard
      title="Documents"
      subtitle="Upload a PDF, TXT, MD, CSV, HTML, or HTM. Text is extracted and indexed for retrieval."
    >
      {body}
    </AdminCard>
  );
}

/**
 * PasteTextView — v1.83. Title + textarea form that POSTs
 * `{ title, text }` to `/admin/web-pages`. Uses the backend's
 * paste-text path (commit 6d220de7 on origin/main). The web-page
 * list is shared with WebUrlView but we keep our own self-contained
 * instance so the two tabs are independent.
 */
export function PasteTextView({ bare = false, onJumpToUpload }: { bare?: boolean; onJumpToUpload?: () => void } = {}) {
  const [title, setTitle] = useState<string>('');
  const [text, setText] = useState<string>('');
  const [pending, setPending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length < 50) {
      setError('Paste at least 50 characters of text first.');
      return;
    }
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const r = await adminApi.post('/admin/web-pages', {
        text: trimmed,
        title: title.trim() || undefined,
      });
      const bytes: number = r.data?.page?.text?.length ?? trimmed.length;
      setTitle('');
      setText('');
      setSuccess(`Indexed ${bytes.toLocaleString()} characters.`);
    } catch (e) {
      const status = (e as { response?: { status?: number; data?: { message?: string; extractedChars?: number } } })?.response?.status;
      const detail = (e as { response?: { data?: { message?: string; extractedChars?: number } } })?.response?.data;
      let msg = friendlyError(e, 'Could not index that text.');
      if (status === 422) {
        const server = detail?.message;
        const chars = detail?.extractedChars;
        msg = server
          ? `${server}${chars != null ? ` (only ${chars} chars after stripping HTML)` : ''}`
          : 'After stripping HTML the text is too short to index.';
      } else if (status === 413) {
        msg = 'Pasted text exceeds the 200k character limit.';
      }
      setError(msg);
    } finally {
      setPending(false);
    }
  };

  const body = (
    <>
      {onJumpToUpload && (
        <div className="flex items-center justify-end mb-3">
          <button
            type="button"
            onClick={onJumpToUpload}
            className="px-3 py-1.5 rounded-lg border border-accent text-accent text-xs font-semibold hover:bg-accent/10"
            data-testid="admin-paste-text-upload-cta"
          >
            Upload a file instead
          </button>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-3" data-testid="paste-text-form">
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1" htmlFor="paste-text-title">
            Title (optional)
          </label>
          <input
            id="paste-text-title"
            type="text"
            value={title}
            onChange={(e) => { setTitle(e.target.value); setError(null); setSuccess(null); }}
            placeholder="e.g. FAQ — return policy"
            disabled={pending}
            data-testid="paste-text-title-input"
            className="w-full px-3 py-2 rounded-xl border border-border bg-mist px-3 py-2 text-xs text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1" htmlFor="paste-text-body">
            Text or HTML
          </label>
          <textarea
            id="paste-text-body"
            value={text}
            onChange={(e) => { setText(e.target.value); setError(null); setSuccess(null); }}
            placeholder="Paste the page content here. HTML is auto-stripped before indexing; min 50 chars, max 200k."
            disabled={pending}
            data-testid="paste-text-body-input"
            rows={10}
            className="w-full rounded-xl border border-border bg-mist px-3 py-2 text-xs text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 resize-y disabled:opacity-50"
          />
          <p className="text-[10px] text-ink-faint mt-1">
            {text.trim().length.toLocaleString()} chars {text.trim().length >= 50 ? '✓' : '(min 50)'}
          </p>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending || text.trim().length < 50}
            data-testid="paste-text-submit"
            className="text-xs px-4 py-2 rounded-xl bg-accent text-white font-semibold hover:bg-accent/90 transition-all disabled:opacity-50 shrink-0"
          >
            {pending ? 'Pasting…' : 'Paste & index'}
          </button>
        </div>
      </form>

      {error && (
        <div data-testid="paste-text-error" className="text-xs px-4 py-3 rounded-xl bg-danger/5 border border-danger/20 text-danger mt-4">{error}</div>
      )}
      {success && (
        <div data-testid="paste-text-success" className="text-xs px-4 py-3 rounded-xl bg-success/5 border border-success/20 text-success mt-4">{success}</div>
      )}
    </>
  );

  if (bare) return <div data-testid="paste-text-view">{body}</div>;
  return (
    <AdminCard
      title="Paste text"
      subtitle="Paste raw text or HTML — useful for JS-only / login-walled pages."
    >
      {body}
    </AdminCard>
  );
}

/**
 * Legacy wrapper — kept so the old `/admin/context-sources` route
 * still works. Composes the two original tabs with its own local
 * tab state. AdminKnowledge.tsx embeds the tab views directly.
 */
export default function AdminContextSources() {
  const [tab, setTab] = useState<TabKey>('web');
  const [webCount, setWebCount] = useState<number>(0);
  const [docCount, setDocCount] = useState<number>(0);

  // Best-effort count probes so the badge stays populated.
  useEffect(() => {
    (async () => {
      try {
        const [wp, dc] = await Promise.all([
          adminApi.get<PaginatedResponse<WebPageRow>>('/admin/web-pages', { params: { page: 1, limit: 1 } }),
          adminApi.get<PaginatedResponse<DocumentRow>>('/admin/documents', { params: { page: 1, limit: 1 } }),
        ]);
        setWebCount(wp.data?.total ?? 0);
        setDocCount(dc.data?.total ?? 0);
      } catch { /* non-critical */ }
    })();
  }, []);

  const tabs = useMemo(
    () => [
      { key: 'web' as const, label: 'Web pages', count: webCount },
      { key: 'document' as const, label: 'Documents', count: docCount },
    ],
    [webCount, docCount],
  );

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-base font-semibold text-ink">Context Sources</h1>
        <p className="text-xs text-ink-faint mt-0.5">
          Manage the URLs and documents the AI can pull from when answering questions.
        </p>
      </div>

      <div role="tablist" aria-label="Context sources" className="flex items-center gap-1">
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              data-testid={`tab-${t.key}`}
              onClick={() => setTab(t.key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                active ? 'bg-accent/10 border-accent/20 text-accent' : 'bg-card border-border text-ink-soft hover:text-ink hover:bg-mist'
              }`}
            >
              {t.label}{' '}
              <span className={`ml-1 text-[10px] ${active ? 'text-accent/80' : 'text-ink-faint'}`}>
                ({t.count})
              </span>
            </button>
          );
        })}
      </div>

      {tab === 'web' && <WebUrlView />}
      {tab === 'document' && <UploadDocumentView />}
    </div>
  );
}
