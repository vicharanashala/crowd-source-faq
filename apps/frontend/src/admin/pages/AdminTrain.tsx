/**
 * AdminTrain — "Train this program" admin page.
 *
 * Unified entry point for everything that feeds the auto-answer retrieval
 * pipeline (ProgramKnowledge, DocumentInsight, FAQ, WebPage, answered
 * CommunityPosts). Shows per-batchId counts + health, runs an admin
 * "what would the AI retrieve" test query against fetchContext, and
 * links out to the existing admin surfaces (context-sources, document-insights,
 * FAQs) for actual content edits.
 *
 * Two backend surfaces are wired directly:
 *   GET  /admin/train/stats?batchId=xxx
 *   POST /admin/train/search              → test retrieval
 *
 * Bulk ingestion (URLs / documents / cross-program promotion) is exposed
 * via the same endpoints but currently driven from existing per-resource
 * admin pages (admin-context-sources for URLs, admin-document-insights for
 * docs). The Train tab links out to those. If the user wants bulk UI in
 * this page, that's a follow-up.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import adminApi from '../utils/adminApi';
import { friendlyError } from '../../utils/api';
import { AdminCard, AdminSectionLabel } from '../components/ui/AdminCard';
import Badge from '../components/common/Badge';
import { warningBorder } from '../../styles/style_config';
import { useCurrentProgramId } from '../../hooks/useProgramScopedApi';
import { useDebounce } from '../../hooks/useDebounce';

interface BatchKnowledgeStats {
  batchId: string;
  batchName: string;
  counts: {
    programKnowledge: number;
    documentInsightPending: number;
    documentInsightPromoted: number;
    faq: number;
    webPage: number;
    communityPostAnswered: number;
  };
  health: {
    pendingReview: number;
    staleItems: number;
    autoPromotedThisWeek: number;
  };
}

// Minimal shape from fetchContext — we re-use the backend's typing via
// the inline shape below rather than depending on the backend's
// `services/contextRetriever.ts` types (those aren't shared across the
// monorepo boundary).
interface SearchHit {
  source: string;
  sourceId?: string;
  question: string;
  answer: string;
  confidence: number;
  rank: number;
  batchId?: string | null;
  meta?: Record<string, unknown>;
}

// ─── Bulk-ingestion response shapes ─────────────────────────────────────────
//
// These mirror the backend's Promise<> return shapes from
// adminTrain.routes.ts:
//   POST /admin/train/bulk-urls           → { added: ..., failed: ... }
//   POST /admin/train/bulk-documents      → { accepted: ..., failed: ... }
//   POST /admin/train/promote-cross-program → { promoted: ..., skippedDuplicates: ..., invalidBatchIds: ... }

interface BulkUrlsAdded {
  url: string;
  id: string;
  title: string;
}
interface BulkUrlsFailed {
  url: string;
  error: string;
}
interface BulkUrlsResponse {
  added: BulkUrlsAdded[];
  failed: BulkUrlsFailed[];
}

interface BulkDocsAccepted {
  title: string;
  documentId: string;
}
interface BulkDocsFailed {
  title: string;
  error: string;
}
interface BulkDocsResponse {
  accepted: BulkDocsAccepted[];
  failed: BulkDocsFailed[];
}

interface BulkPromotePromoted {
  batchId: string;
  id: string;
}
interface BulkPromoteResponse {
  promoted: BulkPromotePromoted[];
  skippedDuplicates: string[];
  invalidBatchIds: string[];
}

// Returned by GET /admin/train/program-knowledge. Used by the promote
// panel's source-row picker. answer is truncated at 200 chars for the
// dropdown label so long answers don't blow up the layout.
interface ProgramKnowledgeRow {
  id: string;
  question: string;
  answer: string;
  seedSource: 'admin_response' | 'admin_corrected' | string;
  batchId: string;
  batchName: string;
  confidenceBoost: number;
}

// Local helper — converts a File to a base64 string with the data-URL
// prefix stripped (matches what the backend's bulk-documents endpoint
// expects in `contentBase64`). Kept here (not a shared util) because it's
// only used by the Bulk Documents panel.
const toBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export default function AdminTrain() {
  const activeProgramId = useCurrentProgramId();
  const [stats, setStats] = useState<BatchKnowledgeStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [question, setQuestion] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Pick the active batch (from the program context) as the default
  // selected batch, falling back to the first row of stats.
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await adminApi.get<{ stats: BatchKnowledgeStats[] }>(
          '/admin/train/stats',
        );
        if (!cancelled) {
          setStats(res.data.stats);
          // Seed the selected batchId if we don't already have one.
          // Prefer the active program context, then fall back to the
          // first row in the stats list.
          if (!selectedBatchId) {
            if (
              activeProgramId &&
              res.data.stats.some((s) => s.batchId === activeProgramId)
            ) {
              setSelectedBatchId(activeProgramId);
            } else if (res.data.stats.length > 0) {
              const first = res.data.stats[0];
              if (first) setSelectedBatchId(first.batchId);
            }
          }
        }
      } catch (err) {
        if (!cancelled) setError(friendlyError(err, 'Failed to load training stats'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // activeProgramId is read on first render only — we intentionally
    // don't refetch when the active program changes (the admin would
    // expect to see all batches, not just the active one).
  }, []);

  const selectedStats = useMemo(
    () => stats.find((s) => s.batchId === selectedBatchId) ?? null,
    [stats, selectedBatchId],
  );

  const runSearch = async () => {
    if (!question.trim() || !selectedBatchId) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await adminApi.post<{ hits: SearchHit[] }>('/admin/train/search', {
        question: question.trim(),
        batchId: selectedBatchId,
        topK: 8,
      });
      setHits(res.data.hits);
    } catch (err) {
      setSearchError(friendlyError(err, 'Search failed'));
      setHits([]);
    } finally {
      setSearching(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 max-w-6xl">
        <p className="text-sm text-ink-faint">Loading training stats…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 max-w-6xl">
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-semibold text-ink">Train this program</h1>
          <p className="text-xs text-ink-faint mt-0.5">
            Per-program knowledge base that the auto-answer pipeline retrieves from.
          </p>
        </div>
        <select
          aria-label="Select program"
          value={selectedBatchId}
          onChange={(e) => setSelectedBatchId(e.target.value)}
          className="px-3 py-1.5 rounded-md border border-border bg-bg text-sm text-ink"
        >
          {stats.length === 0 && <option value="">No active programs</option>}
          {stats.map((s) => (
            <option key={s.batchId} value={s.batchId}>
              {s.batchName}
            </option>
          ))}
        </select>
      </div>

      {selectedStats && (
        <>
          {/* Counts panel — what's in the knowledge base */}
          <AdminCard
            title="Knowledge base"
            subtitle={`Batch ${selectedStats.batchName} — what the AI has to work with`}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <CountCard
                label="Program knowledge"
                value={selectedStats.counts.programKnowledge}
                accent="text-accent"
              />
              <CountCard
                label="Document insights (promoted)"
                value={selectedStats.counts.documentInsightPromoted}
                accent="text-accent"
              />
              <CountCard
                label="Document insights (pending)"
                value={selectedStats.counts.documentInsightPending}
                accent={selectedStats.counts.documentInsightPending > 0 ? 'text-warning' : 'text-ink-soft'}
              />
              <CountCard
                label="FAQs"
                value={selectedStats.counts.faq}
                accent="text-ink-soft"
              />
              <CountCard
                label="Web pages (approved)"
                value={selectedStats.counts.webPage}
                accent="text-ink-soft"
                note="global"
              />
              <CountCard
                label="Answered posts"
                value={selectedStats.counts.communityPostAnswered}
                accent="text-ink-soft"
              />
            </div>
          </AdminCard>

          {/* Health panel */}
          <AdminCard
            title="Health"
            subtitle="What needs attention"
          >
            <div className="flex flex-wrap items-center gap-3">
              <HealthChip
                label="Pending review"
                value={selectedStats.health.pendingReview}
                severity={selectedStats.health.pendingReview > 5 ? 'warn' : 'ok'}
                to="/admin/document-insights"
              />
              <HealthChip
                label="Stale items (>90d)"
                value={selectedStats.health.staleItems}
                severity={selectedStats.health.staleItems > 0 ? 'warn' : 'ok'}
              />
              <HealthChip
                label="Auto-promoted this week"
                value={selectedStats.health.autoPromotedThisWeek}
                severity="ok"
              />
            </div>
          </AdminCard>

          {/* Search test — type a question, see what the AI retrieves */}
          <AdminCard
            title="Test retrieval"
            subtitle="Type a question like a community member would. The top hits shown here are what fetchContext returns to the auto-answer pipeline."
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !searching) runSearch();
                }}
                placeholder="e.g. How do I apply for leave?"
                className="flex-1 px-3 py-2 rounded-md border border-border bg-bg text-sm text-ink"
              />
              <button
                type="button"
                onClick={runSearch}
                disabled={!question.trim() || searching}
                className="px-4 py-2 rounded-md bg-accent text-bg text-sm font-medium disabled:opacity-50"
              >
                {searching ? 'Searching…' : 'Run'}
              </button>
            </div>

            {searchError && (
              <p className="mt-3 text-sm text-danger">{searchError}</p>
            )}

            {hits.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs text-ink-faint">
                  Top {hits.length} hits (rank × confidence × sourceWeight × freshness)
                </p>
                {hits.map((h, idx) => (
                  <div
                    key={`${h.source}:${h.sourceId ?? idx}`}
                    className="border border-border rounded-lg p-3 bg-card"
                  >
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <Badge status="default" label={h.source} />
                      <span className="text-xs text-ink-faint tabular-nums">
                        rank={h.rank.toFixed(3)} · conf={h.confidence.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-sm text-ink font-medium leading-snug">
                      {h.question}
                    </p>
                    <p className="text-xs text-ink-soft mt-1 leading-relaxed line-clamp-3">
                      {h.answer}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </AdminCard>

          {/* Link out to existing per-resource admin surfaces */}
          <AdminCard
            title="Add knowledge"
            subtitle="Route to the existing admin surfaces for content edits. Bulk ingestion is wired on the backend — see docs/auth_samagama.md for the contract."
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <SurfaceLink
                to={`/admin/context-sources?batchId=${selectedBatchId}`}
                title="Web pages"
                hint="Add URLs for the retriever to scrape. Web pages are global (not per-batch) but the API accepts the batchId for traceability."
              />
              <SurfaceLink
                to="/admin/document-insights"
                title="Document insights"
                hint="Upload PDFs / DOCX / images. AI extracts Q&A which lands in the admin review queue before going live."
              />
              <SurfaceLink
                to={`/admin/faqs?batchId=${selectedBatchId}`}
                title="FAQs"
                hint="Curated Q&A. Manually-authored FAQs get a high retrieval confidence weight."
              />
            </div>
          </AdminCard>

          {/* ─── Bulk ingestion ─────────────────────────────────────────────
              Three sub-panels fed by the same backend endpoints shipped in
              commit cac4c8d:
                • POST /admin/train/bulk-urls
                • POST /admin/train/bulk-documents
                • POST /admin/train/promote-cross-program
              All three reuse `selectedBatchId` from the header selector so
              admins stay in the "this program" mental model. Buttons are
              disabled until a batch is selected.
              NOTE: Panel 3 source row is selected via a text input for the
              ProgramKnowledge _id (MVP) — see commit message for the
              program-knowledge listing follow-up. */}
          <AdminCard
            title="Bulk ingestion"
            subtitle="Feed the AI knowledge base for this program in bulk. Each request runs server-side and surfaces failures inline."
          >
            <div className="space-y-6">
              <BulkUrlsPanel batchId={selectedBatchId} />
              <BulkDocsPanel batchId={selectedBatchId} />
              <BulkPromotePanel
                currentBatchId={selectedBatchId}
                availableBatches={stats.map((s) => ({
                  batchId: s.batchId,
                  batchName: s.batchName,
                }))}
              />
            </div>
          </AdminCard>
        </>
      )}
    </div>
  );
}

function CountCard({
  label,
  value,
  accent,
  note,
}: {
  label: string;
  value: number;
  accent: string;
  note?: string;
}) {
  return (
    <div className="border border-border rounded-lg p-3 bg-bg">
      <p className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums mt-1 ${accent}`}>{value}</p>
      {note && <p className="text-[10px] text-ink-faint mt-0.5">{note}</p>}
    </div>
  );
}

function HealthChip({
  label,
  value,
  severity,
  to,
}: {
  label: string;
  value: number;
  severity: 'ok' | 'warn';
  to?: string;
}) {
  const colorClass =
    severity === 'warn' ? 'border-warning/30 bg-warning/5 text-warning' : 'border-border bg-card text-ink';
  const inner = (
    <div className="flex items-baseline gap-2">
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-ink-soft">{label}</span>
    </div>
  );
  if (to) {
    return (
      <Link
        to={to}
        className={`px-3 py-2 rounded-lg border ${colorClass} hover:shadow-sm transition-shadow`}
      >
        {inner}
      </Link>
    );
  }
  return <div className={`px-3 py-2 rounded-lg border ${colorClass}`}>{inner}</div>;
}

function SurfaceLink({ to, title, hint }: { to: string; title: string; hint: string }) {
  return (
    <Link
      to={to}
      className="block p-3 border border-border rounded-lg bg-bg hover:border-border-hover hover:shadow-sm transition-all"
    >
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="text-xs text-ink-soft mt-1 leading-relaxed">{hint}</p>
    </Link>
  );
}

// ─── Bulk URLs panel ───────────────────────────────────────────────────────
//
// Multi-line textarea → split → POST /admin/train/bulk-urls. Caps to the
// first MAX_URLS=50 lines as a defensive client-side guard (the backend
// will reject anything > 50 with a 400 anyway).
const MAX_URLS = 50;

function BulkUrlsPanel({ batchId }: { batchId: string }) {
  const [raw, setRaw] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkUrlsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const disabled = !batchId;

  const urls = useMemo(
    () =>
      raw
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    [raw],
  );

  const submit = async () => {
    if (urls.length === 0 || !batchId) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await adminApi.post<BulkUrlsResponse>('/admin/train/bulk-urls', {
        urls,
        batchId,
      });
      setResult(res.data);
      if (res.data.added.length > 0) setRaw('');
    } catch (err) {
      setError(friendlyError(err, 'Bulk URL ingest failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <AdminSectionLabel label="Bulk URLs" />
      <textarea
        rows={6}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder={'https://example.com/docs\nhttps://example.com/faq'}
        disabled={disabled}
        className="w-full px-3 py-2 rounded-md border border-border bg-bg text-sm text-ink disabled:opacity-50 font-mono"
      />
      <p className="text-[11px] text-ink-faint mt-1">
        One URL per line. Max {MAX_URLS} per batch.
        {urls.length > 0 && ` ${urls.length} queued.`}
      </p>
      <div className="mt-3">
        <button
          type="button"
          onClick={submit}
          disabled={disabled || submitting || urls.length === 0 || urls.length > MAX_URLS}
          className="px-4 py-2 rounded-md bg-accent text-bg text-sm font-medium disabled:opacity-50"
        >
          {submitting ? 'Ingesting…' : `Ingest ${urls.length > 0 ? `(${urls.length})` : 'URLs'}`}
        </button>
        {disabled && (
          <span className="ml-3 text-xs text-ink-faint">Pick a program first.</span>
        )}
      </div>

      {error && (
        <div className="mt-3 border border-danger/40 bg-danger/5 rounded-md px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}
      <BulkUrlsResult result={result} />
    </div>
  );
}

function BulkUrlsResult({ result }: { result: BulkUrlsResponse | null }) {
  if (!result) return null;
  const { added, failed } = result;
  if (added.length === 0 && failed.length === 0) {
    return (
      <p className="mt-3 text-sm text-ink-faint">No URLs were processed.</p>
    );
  }
  return (
    <div className="mt-3 space-y-2">
      <p className="text-sm text-ink">
        Added <span className="font-semibold tabular-nums">{added.length}</span> ·{' '}
        Failed <span className={`font-semibold tabular-nums ${failed.length > 0 ? 'text-danger' : 'text-ink-faint'}`}>{failed.length}</span>
      </p>
      {added.length > 0 && failed.length === 0 && (
        <p className="text-xs text-success">All URLs queued successfully.</p>
      )}
      {failed.length > 0 && (
        <div className="border border-danger/40 bg-danger/5 rounded-md overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-danger/10">
              <tr>
                <th className="text-left px-3 py-1.5 font-semibold text-danger">URL</th>
                <th className="text-left px-3 py-1.5 font-semibold text-danger">Reason</th>
              </tr>
            </thead>
            <tbody>
              {failed.map((f, idx) => (
                <tr key={`${f.url}-${idx}`} className="border-t border-danger/20">
                  <td className="px-3 py-1.5 font-mono text-ink-soft break-all">{f.url}</td>
                  <td className="px-3 py-1.5 text-danger">{f.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Bulk Documents panel ───────────────────────────────────────────────────
//
// Multi-file picker → client-side base64 → POST /admin/train/bulk-documents.
// Limit 20 files (matches MAX_DOCS_PER_REQUEST=20 on the backend). Each file
// is converted via FileReader.readAsDataURL → strip the "data:...;base64,"
// prefix before sending.

function BulkDocsPanel({ batchId }: { batchId: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [result, setResult] = useState<BulkDocsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const disabled = !batchId;

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const picked = Array.from(e.target.files);
    setFiles((prev) => {
      const merged = [...prev, ...picked];
      return merged.slice(0, 20);
    });
    // Allow re-selecting the same file twice.
    e.target.value = '';
  };

  const removeAt = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    if (files.length === 0 || !batchId) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    setProgressLabel(null);
    try {
      const documents: Array<{
        title: string;
        contentBase64: string;
        mimeType: string;
        filename: string;
      }> = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (!f) continue;
        setProgressLabel(`Encoding ${i + 1} / ${files.length}: ${f.name}`);
        const contentBase64 = await toBase64(f);
        documents.push({
          title: f.name.replace(/\.[^.]+$/, ''),
          contentBase64,
          mimeType: f.type || 'application/octet-stream',
          filename: f.name,
        });
      }
      setProgressLabel(`Uploading ${documents.length} / ${documents.length}…`);
      const res = await adminApi.post<BulkDocsResponse>('/admin/train/bulk-documents', {
        documents,
        batchId,
      });
      setResult(res.data);
      if (res.data.accepted.length > 0) setFiles([]);
    } catch (err) {
      setError(friendlyError(err, 'Bulk document upload failed.'));
    } finally {
      setSubmitting(false);
      setProgressLabel(null);
    }
  };

  return (
    <div>
      <AdminSectionLabel label="Bulk documents" />
      <input
        type="file"
        multiple
        accept=".pdf,.docx,.xlsx,image/*"
        onChange={onPick}
        disabled={disabled || submitting}
        className="block text-sm text-ink file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-accent file:text-bg file:text-sm file:font-medium disabled:opacity-50"
      />
      <p className="text-[11px] text-ink-faint mt-1">
        Up to 20 files. PDF, DOCX, XLSX, and images. 8MB max each.
      </p>

      {files.length > 0 && (
        <ul className="mt-3 border border-border rounded-md divide-y divide-border bg-card max-h-56 overflow-auto">
          {files.map((f, idx) => (
            <li
              key={`${f.name}-${idx}-${f.size}`}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate text-ink">{f.name}</p>
                <p className="text-[11px] text-ink-faint">{formatBytes(f.size)} · {f.type || 'unknown type'}</p>
              </div>
              <button
                type="button"
                onClick={() => removeAt(idx)}
                disabled={submitting}
                className="px-2 py-0.5 rounded-md text-xs text-ink-soft hover:text-danger disabled:opacity-50"
                aria-label={`Remove ${f.name}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3">
        <button
          type="button"
          onClick={submit}
          disabled={disabled || submitting || files.length === 0 || files.length > 20}
          className="px-4 py-2 rounded-md bg-accent text-bg text-sm font-medium disabled:opacity-50"
        >
          {submitting ? 'Uploading…' : `Ingest documents${files.length > 0 ? ` (${files.length})` : ''}`}
        </button>
        {disabled && (
          <span className="ml-3 text-xs text-ink-faint">Pick a program first.</span>
        )}
        {/*
          S3-05 (MEDIUM) fix: previously the button was just `disabled` at
          files.length > 20 with no visible banner. Admins would see the
          button grey out and not understand why. Now we surface a
          clear message: the backend caps at 20 per request, so if
          the user picks more they need to split into batches.
        */}
        {files.length > 20 && (
          <span className="ml-3 text-xs text-warning" data-testid="bulk-docs-truncate-banner">
            Backend caps at 20 files per request — pick the first 20 and submit again to add more.
          </span>
        )}
        {submitting && progressLabel && (
          <span className="ml-3 text-xs text-ink-soft">{progressLabel}</span>
        )}
      </div>

      {error && (
        <div className="mt-3 border border-danger/40 bg-danger/5 rounded-md px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}
      <BulkDocsResult result={result} />
    </div>
  );
}

function BulkDocsResult({ result }: { result: BulkDocsResponse | null }) {
  if (!result) return null;
  const { accepted, failed } = result;
  if (accepted.length === 0 && failed.length === 0) {
    return <p className="mt-3 text-sm text-ink-faint">No documents were processed.</p>;
  }
  return (
    <div className="mt-3 space-y-2">
      <p className="text-sm text-ink">
        Accepted <span className="font-semibold tabular-nums">{accepted.length}</span> ·{' '}
        Failed <span className={`font-semibold tabular-nums ${failed.length > 0 ? 'text-danger' : 'text-ink-faint'}`}>{failed.length}</span>
      </p>
      {accepted.length > 0 && failed.length === 0 && (
        <p className="text-xs text-success">All uploads queued for processing.</p>
      )}
      {failed.length > 0 && (
        <div className="border border-danger/40 bg-danger/5 rounded-md overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-danger/10">
              <tr>
                <th className="text-left px-3 py-1.5 font-semibold text-danger">Title</th>
                <th className="text-left px-3 py-1.5 font-semibold text-danger">Reason</th>
              </tr>
            </thead>
            <tbody>
              {failed.map((f, idx) => (
                <tr key={`${f.title}-${idx}`} className="border-t border-danger/20">
                  <td className="px-3 py-1.5 text-ink-soft">{f.title}</td>
                  <td className="px-3 py-1.5 text-danger">{f.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ─── ProgramKnowledgePicker ──────────────────────────────────────────────
// Source-row picker for the Cross-program Promote panel. Calls
// GET /admin/train/program-knowledge?search=... with a 300ms debounce,
// renders a dropdown of up to 20 matches. Clicking a row sets the
// selection. The selected row's id is exposed via onChange; the panel
// uses it as `programKnowledgeId` in the promote request.
//
// UX details:
// - Empty search returns the most recent 20 rows (the backend's
//   default sort), so the dropdown is never empty when there ARE rows.
// - Debounce 300ms so each keystroke doesn't fire a request.
// - Click-outside closes the dropdown (no external hook needed; we
//   just track an open flag and close on blur or on a row click).
// - Selected row is shown as a pill with a clear button, mirroring the
//   pattern used in the FAQ multi-select components elsewhere.
function ProgramKnowledgePicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  const [raw, setRaw] = useState('');
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ProgramKnowledgeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debouncedSearch = useDebounce(raw, 300);

  // Reset the visible search when a value is selected from outside
  // (e.g. when a parent resets the form). We keep `raw` as-is so the
  // user can still see what they typed; just close the dropdown.
  useEffect(() => {
    if (!value) {
      setRaw('');
      setRows([]);
      setOpen(false);
    }
  }, [value]);

  // Fetch on debounced search change. Empty search returns the most
  // recent rows (per the backend's default).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await adminApi.get<{ rows: ProgramKnowledgeRow[] }>(
          '/admin/train/program-knowledge',
          { params: { search: debouncedSearch, limit: 20 } },
        );
        if (!cancelled) setRows(res.data.rows);
      } catch (err) {
        if (!cancelled) setError(friendlyError(err, 'Failed to search program knowledge'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  const selectedRow = value ? rows.find((r) => r.id === value) : undefined;
  // If we just selected, the row may have left `rows` between fetches.
  // S3-03 (MEDIUM) fix: previously this block was an empty
  // `if (lastSelected?.id !== selectedRow.id) { /* comment only */ }`
  // — the developer intended to update a ref synchronously during
  // render, but React doesn't allow that. The actual update is
  // already done correctly by the useEffect below; this block
  // was unreachable dead code. Remove the dead branch.
  const [lastSelected, setLastSelected] = useState<ProgramKnowledgeRow | null>(null);
  useEffect(() => {
    if (selectedRow) setLastSelected(selectedRow);
    else if (!value) setLastSelected(null);
  }, [selectedRow, value]);
  const displayRow = selectedRow ?? lastSelected;

  return (
    <div className="relative">
      <span className="text-xs text-ink-soft">Source ProgramKnowledge row</span>
      {displayRow ? (
        <div className="mt-1 flex items-start gap-2 px-3 py-2 rounded-md border border-border bg-card">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-ink font-medium truncate" title={displayRow.question}>
              {displayRow.question}
            </p>
            <p className="text-[11px] text-ink-faint mt-0.5">
              <span className="font-mono">{displayRow.id.slice(-8)}</span>
              {' · '}
              {displayRow.batchName}
              {' · '}
              {displayRow.seedSource}
              {' · '}
              boost {displayRow.confidenceBoost.toFixed(2)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange('')}
            disabled={disabled}
            className="text-xs text-ink-faint hover:text-ink disabled:opacity-50"
            title="Clear selection"
          >
            ✕
          </button>
        </div>
      ) : (
        <input
          type="text"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay close so a click on a dropdown item still fires.
            // 200ms is enough to feel instant; less than the 300ms debounce
            // so we don't lose race-y clicks.
            setTimeout(() => setOpen(false), 200);
          }}
          placeholder="Search by question, answer, or keywords…"
          disabled={disabled}
          className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-bg text-sm text-ink disabled:opacity-50"
        />
      )}

      {open && !displayRow && (
        <div className="absolute z-20 mt-1 w-full max-h-72 overflow-auto border border-border rounded-md bg-card shadow-float">
          {loading && (
            <p className="px-3 py-2 text-xs text-ink-faint">Searching…</p>
          )}
          {!loading && error && (
            <p className="px-3 py-2 text-xs text-danger">{error}</p>
          )}
          {!loading && !error && rows.length === 0 && (
            <p className="px-3 py-2 text-xs text-ink-faint">
              {debouncedSearch ? 'No matches.' : 'No rows yet.'}
            </p>
          )}
          {!loading && !error && rows.length > 0 && (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      // onMouseDown instead of onClick so we beat the
                      // input's blur handler and the row actually picks.
                      e.preventDefault();
                    }}
                    onClick={() => {
                      onChange(r.id);
                      setRaw('');
                      setOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-bg focus:bg-bg focus:outline-none"
                  >
                    <p className="text-sm text-ink font-medium truncate" title={r.question}>
                      {r.question}
                    </p>
                    <p className="text-[11px] text-ink-faint mt-0.5">
                      <span className="font-mono">{r.id.slice(-8)}</span>
                      {' · '}
                      {r.batchName}
                      {' · '}
                      {r.seedSource}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Bulk Promote panel ─────────────────────────────────────────────────────
//
// MVP simplification: there is no GET /admin/program-knowledge listing
// endpoint on the backend, so source row selection is a text input where the
// admin pastes a ProgramKnowledge _id. Target batches come from the same
// `stats` array already loaded for the header dropdown. TODO follow-up:
// surface a real listing + search once the backend exposes it.

function BulkPromotePanel({
  currentBatchId,
  availableBatches,
}: {
  currentBatchId: string;
  availableBatches: { batchId: string; batchName: string }[];
}) {
  const [sourceId, setSourceId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkPromoteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const disabled = !currentBatchId;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () =>
    setSelected(new Set(availableBatches.map((b) => b.batchId)));
  const clearAll = () => setSelected(new Set());

  const submit = async () => {
    if (selected.size === 0 || !sourceId.trim()) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const targetBatchIds = Array.from(selected);
      const res = await adminApi.post<BulkPromoteResponse>(
        '/admin/train/promote-cross-program',
        {
          programKnowledgeId: sourceId.trim(),
          targetBatchIds,
        },
      );
      setResult(res.data);
    } catch (err) {
      setError(friendlyError(err, 'Cross-program promote failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <AdminSectionLabel label="Cross-program promote" />
      <ProgramKnowledgePicker
        value={sourceId}
        onChange={setSourceId}
        disabled={disabled || submitting}
      />

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-xs text-ink-soft">Target batches ({selected.size} selected)</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              disabled={disabled}
              className="text-xs px-2 py-1 rounded-md border border-border text-ink-soft hover:text-ink disabled:opacity-50"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={disabled}
              className="text-xs px-2 py-1 rounded-md border border-border text-ink-soft hover:text-ink disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="border border-border rounded-md bg-card max-h-48 overflow-auto divide-y divide-border">
          {availableBatches.length === 0 && (
            <p className="px-3 py-2 text-xs text-ink-faint">No batches loaded yet.</p>
          )}
          {availableBatches.map((b) => (
            <label
              key={b.batchId}
              className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-bg"
            >
              <input
                type="checkbox"
                checked={selected.has(b.batchId)}
                onChange={() => toggle(b.batchId)}
                disabled={disabled || submitting}
                className="accent-accent"
              />
              <span className={b.batchId === currentBatchId ? 'font-semibold text-ink' : 'text-ink'}>
                {b.batchName}
              </span>
              {b.batchId === currentBatchId && (
                <span className="text-[10px] uppercase text-ink-faint">current</span>
              )}
            </label>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={submit}
          disabled={disabled || submitting || selected.size === 0 || !sourceId.trim()}
          className="px-4 py-2 rounded-md bg-accent text-bg text-sm font-medium disabled:opacity-50"
        >
          {submitting
            ? 'Promoting…'
            : `Promote to ${selected.size} ${selected.size === 1 ? 'batch' : 'batches'}`}
        </button>
        {disabled && (
          <span className="ml-3 text-xs text-ink-faint">Pick a program first.</span>
        )}
      </div>

      {error && (
        <div className="mt-3 border border-danger/40 bg-danger/5 rounded-md px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}
      <BulkPromoteResult result={result} />
    </div>
  );
}

function BulkPromoteResult({ result }: { result: BulkPromoteResponse | null }) {
  if (!result) return null;
  const { promoted, skippedDuplicates, invalidBatchIds } = result;
  return (
    <div className="mt-3 space-y-2">
      <p className="text-sm text-ink">
        Promoted <span className="font-semibold tabular-nums">{promoted.length}</span> ·{' '}
        Skipped <span className="font-semibold tabular-nums">{skippedDuplicates.length}</span> duplicates
      </p>
      {invalidBatchIds.length > 0 && (
        <div className={warningBorder}>
          <p className="font-semibold mb-1">{invalidBatchIds.length} invalid batch id(s) ignored:</p>
          <ul className="list-disc list-inside space-y-0.5 font-mono break-all">
            {invalidBatchIds.map((id, idx) => (
              <li key={`${id}-${idx}`}>{id}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}