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
import { AdminCard } from '../components/ui/AdminCard';
import Badge from '../components/common/Badge';
import { useCurrentProgramId } from '../../hooks/useProgramScopedApi';

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
                accent={selectedStats.counts.documentInsightPending > 0 ? 'text-amber-600' : 'text-ink-soft'}
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
    severity === 'warn' ? 'border-amber-500/40 bg-amber-500/5 text-amber-700' : 'border-border bg-card text-ink';
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