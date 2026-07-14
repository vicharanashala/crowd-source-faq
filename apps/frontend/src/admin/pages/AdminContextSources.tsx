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
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

type TabKey = 'web' | 'document';

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
}

function DocumentList({ items, loading, error, onDelete, deletePendingId }: DocumentListProps) {
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

  return (
    <ul data-testid="documents-list" className="space-y-2">
      {items.map((row) => {
        const isPending = deletePendingId === row._id;
        const pageCount = typeof row.pageCount === 'number' ? row.pageCount : 0;
        return (
          <li
            key={row._id}
            data-testid="documents-row"
            data-row-id={row._id}
            className="bg-card border border-border rounded-xl p-3 flex items-start gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="text-sm font-semibold text-ink truncate">
                  {row.title || row.filename}
                </h3>
                {pageCount > 0 && (
                  <Badge status="default" label={`${pageCount} page${pageCount === 1 ? '' : 's'}`} showDot={false} />
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
              <div className="flex items-center gap-3 mt-1 text-[10px] text-ink-faint">
                <span>{formatBytes(row.sizeBytes ?? 0)}</span>
                {row.mimeType && <span className="font-mono">{row.mimeType}</span>}
              </div>
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
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function AdminContextSources() {
  const [tab, setTab] = useState<TabKey>('web');

  // ── Web pages state ─────────────────────────────────────────────────────
  const [webItems, setWebItems] = useState<WebPageRow[]>([]);
  const [webLoading, setWebLoading] = useState<boolean>(true);
  const [webError, setWebError] = useState<string | null>(null);
  const [webUrl, setWebUrl] = useState<string>('');
  const [webAddPending, setWebAddPending] = useState<boolean>(false);
  const [webAddError, setWebAddError] = useState<string | null>(null);
  const [webAddSuccess, setWebAddSuccess] = useState<string | null>(null);
  const [webDeletePendingId, setWebDeletePendingId] = useState<string | null>(null);

  // ── Documents state ─────────────────────────────────────────────────────
  const [docItems, setDocItems] = useState<DocumentRow[]>([]);
  const [docLoading, setDocLoading] = useState<boolean>(true);
  const [docError, setDocError] = useState<string | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docUploadPending, setDocUploadPending] = useState<boolean>(false);
  const [docUploadError, setDocUploadError] = useState<string | null>(null);
  const [docUploadSuccess, setDocUploadSuccess] = useState<string | null>(null);
  const [docDeletePendingId, setDocDeletePendingId] = useState<string | null>(null);

  // ── Tab counts (best-effort; shown as small badges) ─────────────────────
  const [webCount, setWebCount] = useState<number>(0);
  const [docCount, setDocCount] = useState<number>(0);

  // ── List fetchers ──────────────────────────────────────────────────────
  const fetchWebPages = async () => {
    setWebLoading(true);
    setWebError(null);
    try {
      const r = await adminApi.get<PaginatedResponse<WebPageRow>>(
        '/admin/web-pages',
        { params: { page: 1, limit: PAGE_LIMIT } },
      );
      const items = r.data?.items ?? [];
      setWebItems(items);
      setWebCount(r.data?.total ?? items.length);
    } catch (e) {
      setWebError(friendlyError(e, 'Failed to load web pages.'));
      setWebItems([]);
    } finally {
      setWebLoading(false);
    }
  };

  const fetchDocuments = async () => {
    setDocLoading(true);
    setDocError(null);
    try {
      const r = await adminApi.get<PaginatedResponse<DocumentRow>>(
        '/admin/documents',
        { params: { page: 1, limit: PAGE_LIMIT } },
      );
      const items = r.data?.items ?? [];
      setDocItems(items);
      setDocCount(r.data?.total ?? items.length);
    } catch (e) {
      setDocError(friendlyError(e, 'Failed to load documents.'));
      setDocItems([]);
    } finally {
      setDocLoading(false);
    }
  };

  // Fetch the active tab on mount + whenever the tab changes. We also
  // probe the other tab once on mount so the tab badge is populated.
  useEffect(() => {
    if (tab === 'web') {
      void fetchWebPages();
    } else {
      void fetchDocuments();
    }
  }, [tab]);

  useEffect(() => {
    // One-shot probe of the inactive tab so the tab count badge is
    // populated on first render. Best-effort: never throws.
    (async () => {
      try {
        if (tab !== 'web') {
          const r = await adminApi.get<PaginatedResponse<WebPageRow>>(
            '/admin/web-pages',
            { params: { page: 1, limit: 1 } },
          );
          setWebCount(r.data?.total ?? 0);
        } else {
          const r = await adminApi.get<PaginatedResponse<DocumentRow>>(
            '/admin/documents',
            { params: { page: 1, limit: 1 } },
          );
          setDocCount(r.data?.total ?? 0);
        }
      } catch {
        /* non-critical */
      }
    })();
  }, []);

  // ── Web page add / delete ──────────────────────────────────────────────
  const handleAddWebPage = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = webUrl.trim();
    if (!url) {
      setWebAddError('Enter a URL.');
      return;
    }
    setWebAddPending(true);
    setWebAddError(null);
    setWebAddSuccess(null);
    try {
      const r = await adminApi.post('/admin/web-pages', { url });
      const addedUrl: string = r.data?.page?.url ?? url;
      setWebUrl('');
      setWebAddSuccess(`Added ${addedUrl}.`);
      await fetchWebPages();
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      let msg = friendlyError(e, 'Could not add that page.');
      if (status === 400) msg = 'Invalid URL. Use a full http(s) URL.';
      else if (status === 422) msg = 'That page has no extractable text.';
      else if (status === 502) msg = 'Could not fetch the page (server error).';
      setWebAddError(msg);
    } finally {
      setWebAddPending(false);
    }
  };

  const handleDeleteWebPage = async (row: WebPageRow) => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        `Delete "${row.title?.trim() || row.url}"? The text will be removed from the retrieval index.`,
      );
      if (!ok) return;
    }
    setWebDeletePendingId(row._id);
    try {
      await adminApi.delete(`/admin/web-pages/${row._id}`);
      await fetchWebPages();
    } catch (e) {
      setWebError(friendlyError(e, 'Could not delete that page.'));
    } finally {
      setWebDeletePendingId(null);
    }
  };

  // ── Document upload / delete ───────────────────────────────────────────
  const handleDocFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setDocFile(file);
    setDocUploadError(null);
    setDocUploadSuccess(null);
  };

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docFile) {
      setDocUploadError('Pick a file first.');
      return;
    }
    setDocUploadPending(true);
    setDocUploadError(null);
    setDocUploadSuccess(null);
    try {
      const form = new FormData();
      form.append('file', docFile);
      const r = await adminApi.post('/admin/documents', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const filename: string = r.data?.document?.filename ?? docFile.name;
      setDocFile(null);
      // Reset the <input type="file"> so picking the same file twice works.
      const input = document.getElementById('context-doc-file') as HTMLInputElement | null;
      if (input) input.value = '';
      setDocUploadSuccess(`Uploaded ${filename}.`);
      await fetchDocuments();
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      let msg = friendlyError(e, 'Upload failed.');
      if (status === 400) msg = 'That file type is not supported. Use PDF, TXT, MD, or CSV.';
      else if (status === 422) msg = 'We could not extract any text from that file.';
      setDocUploadError(msg);
    } finally {
      setDocUploadPending(false);
    }
  };

  const handleDeleteDocument = async (row: DocumentRow) => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        `Delete "${row.title || row.filename}"? The file will be removed from disk.`,
      );
      if (!ok) return;
    }
    setDocDeletePendingId(row._id);
    try {
      await adminApi.delete(`/admin/documents/${row._id}`);
      await fetchDocuments();
    } catch (e) {
      setDocError(friendlyError(e, 'Could not delete that document.'));
    } finally {
      setDocDeletePendingId(null);
    }
  };

  const tabs = useMemo(
    () => [
      { key: 'web' as const, label: 'Web pages', count: webCount },
      { key: 'document' as const, label: 'Documents', count: docCount },
    ],
    [webCount, docCount],
  );

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-base font-semibold text-ink">Context Sources</h1>
        <p className="text-xs text-ink-faint mt-0.5">
          Manage the URLs and documents the AI can pull from when answering questions.
        </p>
      </div>

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Context sources"
        className="flex items-center gap-1"
      >
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
                active
                  ? 'bg-accent/10 border-accent/20 text-accent'
                  : 'bg-card border-border text-ink-soft hover:text-ink hover:bg-mist'
              }`}
            >
              {t.label}{' '}
              <span
                className={`ml-1 text-[10px] ${
                  active ? 'text-accent/80' : 'text-ink-faint'
                }`}
              >
                ({t.count})
              </span>
            </button>
          );
        })}
      </div>

      {/* Web pages panel */}
      {tab === 'web' && (
        <AdminCard
          title="Web pages"
          subtitle="Paste a URL — the server fetches it and extracts the text for the retrieval index."
        >
          <form
            onSubmit={handleAddWebPage}
            className="flex items-stretch gap-2 mb-4"
            data-testid="web-pages-form"
          >
            <input
              type="url"
              required
              value={webUrl}
              onChange={(e) => {
                setWebUrl(e.target.value);
                setWebAddError(null);
                setWebAddSuccess(null);
              }}
              placeholder="https://example.com/article"
              aria-label="Web page URL"
              data-testid="web-pages-url-input"
              disabled={webAddPending}
              className="flex-1 rounded-xl border border-border bg-mist px-3 py-2 text-xs text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={webAddPending || !webUrl.trim()}
              data-testid="web-pages-add-btn"
              className="text-xs px-4 py-2 rounded-xl bg-accent text-white font-semibold hover:bg-accent/90 transition-all disabled:opacity-50 shrink-0"
            >
              {webAddPending ? 'Adding…' : 'Add'}
            </button>
          </form>

          {webAddError && (
            <div
              data-testid="web-pages-add-error"
              className="text-xs px-4 py-3 rounded-xl bg-danger/5 border border-danger/20 text-danger mb-4"
            >
              {webAddError}
            </div>
          )}
          {webAddSuccess && (
            <div
              data-testid="web-pages-add-success"
              className="text-xs px-4 py-3 rounded-xl bg-success/5 border border-success/20 text-success mb-4"
            >
              {webAddSuccess}
            </div>
          )}

          <WebPageList
            items={webItems}
            loading={webLoading}
            error={webError}
            onDelete={handleDeleteWebPage}
            deletePendingId={webDeletePendingId}
          />
        </AdminCard>
      )}

      {/* Documents panel */}
      {tab === 'document' && (
        <AdminCard
          title="Documents"
          subtitle="Upload a PDF, TXT, MD, or CSV. Text is extracted and indexed for retrieval."
        >
          <form
            onSubmit={handleUploadDocument}
            className="flex items-stretch gap-2 mb-4"
            data-testid="documents-form"
          >
            <input
              id="context-doc-file"
              type="file"
              accept=".pdf,.txt,.md,.csv"
              onChange={handleDocFileChange}
              disabled={docUploadPending}
              aria-label="Document file"
              data-testid="documents-file-input"
              className="flex-1 text-xs text-ink file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-accent/10 file:text-accent hover:file:bg-accent/20 cursor-pointer disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={docUploadPending || !docFile}
              data-testid="documents-upload-btn"
              className="text-xs px-4 py-2 rounded-xl bg-accent text-white font-semibold hover:bg-accent/90 transition-all disabled:opacity-50 shrink-0"
            >
              {docUploadPending ? 'Uploading…' : 'Upload'}
            </button>
          </form>

          {docFile && (
            <p
              data-testid="documents-selected"
              className="text-[11px] text-ink-soft mb-4"
            >
              Selected: <span className="font-mono">{docFile.name}</span> (
              {formatBytes(docFile.size)})
            </p>
          )}

          {docUploadError && (
            <div
              data-testid="documents-upload-error"
              className="text-xs px-4 py-3 rounded-xl bg-danger/5 border border-danger/20 text-danger mb-4"
            >
              {docUploadError}
            </div>
          )}
          {docUploadSuccess && (
            <div
              data-testid="documents-upload-success"
              className="text-xs px-4 py-3 rounded-xl bg-success/5 border border-success/20 text-success mb-4"
            >
              {docUploadSuccess}
            </div>
          )}

          <DocumentList
            items={docItems}
            loading={docLoading}
            error={docError}
            onDelete={handleDeleteDocument}
            deletePendingId={docDeletePendingId}
          />
        </AdminCard>
      )}
    </div>
  );
}