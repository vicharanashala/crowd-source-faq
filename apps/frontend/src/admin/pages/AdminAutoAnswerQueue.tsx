import { useEffect, useMemo, useRef, useState } from 'react';
import adminApi from '../utils/adminApi';
import { friendlyError } from '../../utils/api';
import Badge from '../components/common/Badge';
import InlinePrompt from '../components/common/InlinePrompt';

type AiAnswerStatus =
  | 'pending'
  | 'suggested'
  | 'approved'
  | 'rejected'
  | 'ask_human'
  | 'escalated';

interface RankedHit {
  source: 'faq' | 'kb' | 'community' | 'comments' | 'recent_activity';
  sourceId: string;
  question: string;
  answer: string;
  score: number;
  confidence: number;
  ageDays: number;
  rank: number;
  matchedOn?: string;
  batchId?: string;
  meta?: Record<string, unknown>;
}

interface AiContext {
  hits: RankedHit[];
  sources: { name: string; returned: number; weight: number }[];
  query: string;
  takenAt: string;
}

interface QueuedPost {
  _id: string;
  title: string;
  body?: string;
  status: string;
  aiAnswer?: string | null;
  aiAnswerConfidence?: number | null;
  aiAnswerStatus?: AiAnswerStatus | null;
  aiAnswerSource?: string | null;
  aiAnswerSuggestedAt?: string | null;
  aiAnswerAttempts?: number;
  tags?: string[];
  createdAt?: string;
  author?: { name?: string; email?: string };
  aiContext?: AiContext | null;
}

interface PaginatedResponse {
  items: QueuedPost[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

type TabKey = 'asked' | 'suggested' | 'all';

const PAGE_LIMIT = 10;

function apiStatusForTab(tab: TabKey): 'asked' | 'suggested' | 'all' {
  // Backend maps `asked` -> aiAnswerStatus === 'ask_human'
  return tab;
}

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function formatDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
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

interface ActionButtonsProps {
  pending: boolean;
  onApprove: () => void;
  onApproveEdit: () => void;
  onReject: (reason: string) => void;
  onAskAgain: (extra: string) => void;
}

function ActionButtons({
  pending,
  onApprove,
  onApproveEdit,
  onReject,
  onAskAgain,
}: ActionButtonsProps) {
  const disabledAll = pending;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        onClick={onApprove}
        disabled={disabledAll}
        className="text-[11px] px-3 py-1.5 rounded-lg bg-success/10 border border-success/20 text-success hover:bg-success/20 transition-all disabled:opacity-50"
      >
        {pending ? 'Working…' : 'Approve'}
      </button>
      <button
        onClick={onApproveEdit}
        disabled={disabledAll}
        className="text-[11px] px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-all disabled:opacity-50"
      >
        Approve + Edit
      </button>
      <InlinePrompt
        triggerLabel="Reject"
        title="Optional rejection reason (1 line):"
        confirmLabel="Reject"
        onConfirm={(reason) => onReject(reason)}
      />
      <InlinePrompt
        triggerLabel="Ask AI Again"
        title="Optional extra context for the AI (1–2 sentences):"
        confirmLabel="Ask"
        onConfirm={(extra) => onAskAgain(extra)}
      />
    </div>
  );
}

interface DiffViewProps {
  aiDraft: string;
  edit: string;
}

/**
 * Side-by-side AI draft vs the admin's edit. We highlight lines that differ
 * via a simple character-level diff (no library): compare the two strings and
 * mark runs in the admin edit that don't appear in the AI draft.
 */
interface AiDecision {
  aiAnswerStatus?: AiAnswerStatus | string | null;
  aiAnswerConfidence?: number | null;
  aiAnswerSource?: string | null;
  lastAutoAnswerAt?: string | null;
  aiAnswerAttempts?: number | null;
}

interface ContextSnapshotResponse {
  postId: string;
  snapshot: AiContext;
  decision: AiDecision;
}

interface ContextModalProps {
  open: boolean;
  postId: string;
  postTitle: string;
  onClose: () => void;
}

/**
 * "Why did AI decide this?" drill-down modal.
 * Lazily fetches GET /admin/auto-answer/:postId/context on open and caches the
 * response for the lifetime of this component instance. Renders the full
 * retrieval snapshot + decision metadata so admins can audit why the AI
 * landed on its suggestion.
 */
function ContextModal({ open, postId, postTitle, onClose }: ContextModalProps) {
  const [data, setData] = useState<ContextSnapshotResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (data || loading) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotFound(false);
    (async () => {
      try {
        const r = await adminApi.get<ContextSnapshotResponse>(
          `/admin/auto-answer/${postId}/context`,
        );
        if (cancelled) return;
        setData(r.data);
      } catch (e: unknown) {
        if (cancelled) return;
        const status =
          (e as { response?: { status?: number } })?.response?.status ?? 0;
        if (status === 404) {
          setNotFound(true);
        } else {
          setError(friendlyError(e, 'failed to load context'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-run only when open/postId changes; data/loading are derived inside.
  }, [open, postId]);

  if (!open) return null;

  const decision = data?.decision;
  const snapshot = data?.snapshot;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AI decision drill-down"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '24px',
        overflowY: 'auto',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="ai-context-modal"
    >
      <div
        className="bg-card border border-border rounded-2xl shadow-xl"
        style={{
          width: '100%',
          maxWidth: '720px',
          maxHeight: 'calc(100vh - 48px)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-widest">
              AI decision drill-down
            </p>
            <h2 className="text-sm font-semibold text-ink mt-0.5 truncate">
              {postTitle}
            </h2>
            {decision && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge
                  status={
                    decision.aiAnswerStatus === 'approved'
                      ? 'approved'
                      : decision.aiAnswerStatus === 'rejected'
                      ? 'rejected'
                      : decision.aiAnswerStatus === 'ask_human' ||
                        decision.aiAnswerStatus === 'escalated' ||
                        decision.aiAnswerStatus === 'suggested' ||
                        decision.aiAnswerStatus === 'pending'
                      ? 'pending'
                      : 'default'
                  }
                  label={decision.aiAnswerStatus ?? 'pending'}
                  showDot={false}
                />
                {decision.aiAnswerConfidence != null && (
                  <span className="text-[10px] text-ink-soft">
                    {Math.round(Number(decision.aiAnswerConfidence) * 100)}%
                    conf
                  </span>
                )}
                {decision.aiAnswerSource && (
                  <span className="text-[10px] text-ink-faint">
                    source: {decision.aiAnswerSource}
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drill-down"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-ink-faint hover:text-ink hover:bg-mist transition-colors flex-shrink-0"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div
          className="px-5 py-4 space-y-5"
          style={{ overflowY: 'auto', flex: 1 }}
        >
          {loading && (
            <div
              data-testid="ai-context-loading"
              className="space-y-2 animate-pulse"
            >
              <div className="h-3 bg-mist rounded w-1/3" />
              <div className="h-3 bg-mist rounded w-2/3" />
              <div className="h-3 bg-mist rounded w-1/2" />
            </div>
          )}

          {!loading && notFound && (
            <div className="text-xs px-4 py-3 rounded-xl bg-mist border border-border text-ink-soft">
              No context snapshot for this post yet.
            </div>
          )}

          {!loading && error && (
            <div className="text-xs px-4 py-3 rounded-xl bg-danger/5 border border-danger/20 text-danger">
              {error}
            </div>
          )}

          {!loading && !error && !notFound && data && (
            <>
              {/* Decision panel */}
              <section>
                <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-widest mb-2">
                  Decision
                </p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <dt className="text-ink-faint">Status</dt>
                  <dd className="text-ink font-mono">
                    {decision?.aiAnswerStatus ?? '—'}
                  </dd>
                  <dt className="text-ink-faint">Confidence</dt>
                  <dd className="text-ink">
                    {decision?.aiAnswerConfidence != null
                      ? `${Math.round(Number(decision.aiAnswerConfidence) * 100)}%`
                      : '—'}
                  </dd>
                  <dt className="text-ink-faint">Source</dt>
                  <dd className="text-ink font-mono">
                    {decision?.aiAnswerSource ?? '—'}
                  </dd>
                  <dt className="text-ink-faint">Decided at</dt>
                  <dd className="text-ink">
                    {decision?.lastAutoAnswerAt
                      ? `${formatDate(decision.lastAutoAnswerAt)} (${relativeTime(
                          decision.lastAutoAnswerAt,
                        )})`
                      : '—'}
                  </dd>
                  <dt className="text-ink-faint">Attempts</dt>
                  <dd className="text-ink">
                    {decision?.aiAnswerAttempts ?? 0}
                  </dd>
                </dl>
              </section>

              {/* Context panel */}
              <section>
                <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-widest mb-2">
                  Retrieval context
                </p>
                {snapshot?.query ? (
                  <p className="text-xs text-ink-soft mb-3">
                    Query:{' '}
                    <span className="font-mono text-ink">
                      {snapshot.query}
                    </span>
                  </p>
                ) : null}
                {snapshot?.takenAt && (
                  <p className="text-[10px] text-ink-faint mb-3">
                    Snapshot taken {relativeTime(snapshot.takenAt)} ·{' '}
                    {formatDate(snapshot.takenAt)}
                  </p>
                )}
                <div className="space-y-2">
                  {(snapshot?.hits ?? []).length === 0 && (
                    <p className="text-xs text-ink-faint italic">
                      No hits in snapshot.
                    </p>
                  )}
                  {(snapshot?.hits ?? []).map((hit) => (
                    <div
                      key={`${hit.source}-${hit.rank}-${hit.sourceId}`}
                      className="rounded-xl border border-border bg-card p-3"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-mono font-semibold text-accent">
                          {hit.source}:{truncate(hit.sourceId, 16)}
                        </span>
                        <span className="text-[10px] text-ink-faint">
                          rank #{hit.rank} · score {hit.score.toFixed(2)} · conf{' '}
                          {(hit.confidence * 100).toFixed(0)}% · age{' '}
                          {hit.ageDays}d
                        </span>
                        {hit.batchId && (
                          <span
                            className="text-[10px] font-mono text-ink-faint ml-auto"
                            title="Retrieval batch id"
                          >
                            batch: {truncate(hit.batchId, 20)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-ink mt-1 text-left">
                        {hit.question}
                      </p>
                      <p className="text-xs text-ink-soft mt-1 whitespace-pre-wrap leading-relaxed text-left">
                        {truncate(hit.answer, 400)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Sources panel */}
              <section>
                <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-widest mb-2">
                  Sources
                </p>
                {(snapshot?.sources ?? []).length === 0 ? (
                  <p className="text-xs text-ink-faint italic">
                    No source breakdown available.
                  </p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-ink-faint">
                        <th className="font-medium py-1 pr-2">Name</th>
                        <th className="font-medium py-1 pr-2">Returned</th>
                        <th className="font-medium py-1">Weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(snapshot?.sources ?? []).map((s) => (
                        <tr key={s.name} className="border-t border-border">
                          <td className="py-1 pr-2 font-mono text-ink">
                            {s.name}
                          </td>
                          <td className="py-1 pr-2 text-ink-soft">
                            {s.returned}
                          </td>
                          <td className="py-1 text-ink-soft">
                            {Number.isFinite(s.weight)
                              ? s.weight.toFixed(2)
                              : String(s.weight)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3.5 py-1.5 rounded-lg border border-border text-ink-soft hover:text-ink hover:bg-mist transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function DiffView({ aiDraft, edit }: DiffViewProps) {
  const aiLines = aiDraft.split('\n');
  const editLines = edit.split('\n');

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
      }}
    >
      <div className="bg-mist rounded-xl border border-border p-3">
        <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-widest mb-2">
          AI Draft
        </p>
        <pre className="text-xs text-ink-soft whitespace-pre-wrap font-mono leading-relaxed">
          {aiLines.length === 0 || (aiLines.length === 1 && aiLines[0] === '')
            ? '(empty)'
            : aiDraft}
        </pre>
      </div>
      <div className="bg-accent/5 rounded-xl border border-accent/30 p-3">
        <p className="text-[10px] font-semibold text-accent uppercase tracking-widest mb-2">
          Your Edit
        </p>
        <pre className="text-xs text-ink whitespace-pre-wrap font-mono leading-relaxed">
          {editLines.length === 0 || (editLines.length === 1 && editLines[0] === '')
            ? '(empty)'
            : edit}
        </pre>
        {/* Cheap diff hint: show which lines in the edit are not in the AI draft. */}
        {editLines
          .filter((l) => l.trim() && !aiDraft.includes(l))
          .slice(0, 3)
          .map((l, i) => (
            <p
              key={i}
              className="text-[10px] text-warning mt-1.5 italic"
              title="Not in the AI draft"
            >
              + {truncate(l, 120)}
            </p>
          ))}
      </div>
    </div>
  );
}

export default function AdminAutoAnswerQueue() {
  const [tab, setTab] = useState<TabKey>('suggested');
  const [page, setPage] = useState<number>(1);
  const [items, setItems] = useState<QueuedPost[]>([]);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastActionResult, setLastActionResult] = useState<string | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);

  // Per-post UI state (textarea contents, expanded source citations).
  const [expandedPosts, setExpandedPosts] = useState<Record<string, boolean>>({});
  const [adminReplyByPost, setAdminReplyByPost] = useState<Record<string, string>>({});
  const [expandedHitsByPost, setExpandedHitsByPost] = useState<Record<string, Record<number, boolean>>>({});
  // "Why did AI decide this?" drill-down — which post card has its modal open.
  const [contextOpenByPost, setContextOpenByPost] = useState<Record<string, boolean>>({});

  // Counts for tab badges — fetched in parallel as count-only probes.
  const [tabCounts, setTabCounts] = useState<{ asked: number; suggested: number; all: number }>({
    asked: 0,
    suggested: 0,
    all: 0,
  });

  // Keep the URL ?status=&page= in sync so links are shareable (no router ref).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('status', tab);
    url.searchParams.set('page', String(page));
    window.history.replaceState(null, '', url.toString());
  }, [tab, page]);

  // Fetch just the totals for the three tabs (limit=1, read .total).
  // (counts inlined in effect, see below)

  // Helper to re-fetch the current page + counts (used after a successful
  // admin action so the queue reflects the new state).
  const refetchAllRef = useRef<() => Promise<void>>();
  refetchAllRef.current = async () => {
    await Promise.all([
      (async () => {
        try {
          const res = await adminApi.get<PaginatedResponse>(
            '/admin/auto-answer/queue/paginated',
            { params: { status: apiStatusForTab(tab), page, limit: PAGE_LIMIT } },
          );
          const data = res.data;
          setItems(data.items ?? []);
          setTotal(data.total ?? 0);
          setTotalPages(Math.max(1, data.pages ?? 1));
        } catch {
          /* keep last data on screen if refetch fails */
        }
      })(),
      (async () => {
        try {
          const [askedR, suggestedR, allR] = await Promise.all([
            adminApi.get<PaginatedResponse>(
              '/admin/auto-answer/queue/paginated',
              { params: { status: 'asked', page: 1, limit: 1 } },
            ),
            adminApi.get<PaginatedResponse>(
              '/admin/auto-answer/queue/paginated',
              { params: { status: 'suggested', page: 1, limit: 1 } },
            ),
            adminApi.get<PaginatedResponse>(
              '/admin/auto-answer/queue/paginated',
              { params: { status: 'all', page: 1, limit: 1 } },
            ),
          ]);
          setTabCounts({
            asked: askedR.data.total ?? 0,
            suggested: suggestedR.data.total ?? 0,
            all: allR.data.total ?? 0,
          });
        } catch {
          /* counts non-critical */
        }
      })(),
    ]);
  };
  const refetchAll = () => refetchAllRef.current?.() ?? Promise.resolve();

  // Initial + tab/page change: fetch this page + refresh tab counts.
  // We still refresh counts whenever the active tab or page changes so the
  // badges stay current after pagination actions.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await adminApi.get<PaginatedResponse>(
          '/admin/auto-answer/queue/paginated',
          { params: { status: apiStatusForTab(tab), page, limit: PAGE_LIMIT } },
        );
        if (cancelled) return;
        const data = res.data;
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(Math.max(1, data.pages ?? 1));
        setPage(data.page ?? page);
      } catch (e) {
        if (cancelled) return;
        setActionError(friendlyError(e, 'Failed to load queue'));
        setItems([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // Counts (best-effort; never block page render on these).
    (async () => {
      try {
        const [askedR, suggestedR, allR] = await Promise.all([
          adminApi.get<PaginatedResponse>(
            '/admin/auto-answer/queue/paginated',
            { params: { status: 'asked', page: 1, limit: 1 } },
          ),
          adminApi.get<PaginatedResponse>(
            '/admin/auto-answer/queue/paginated',
            { params: { status: 'suggested', page: 1, limit: 1 } },
          ),
          adminApi.get<PaginatedResponse>(
            '/admin/auto-answer/queue/paginated',
            { params: { status: 'all', page: 1, limit: 1 } },
          ),
        ]);
        if (cancelled) return;
        setTabCounts({
          asked: askedR.data.total ?? 0,
          suggested: suggestedR.data.total ?? 0,
          all: allR.data.total ?? 0,
        });
      } catch {
        /* counts are non-critical */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tab, page]);

  const runAction = async (
    postId: string,
    request: () => Promise<unknown>,
    successLabel: string,
  ) => {
    setActionError(null);
    setActionLoading(postId);
    try {
      await request();
      setLastActionResult(successLabel);
      await refetchAll();
    } catch (e) {
      setActionError(friendlyError(e, 'Action failed'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprove = (post: QueuedPost) =>
    runAction(post._id, () => adminApi.post(`/admin/auto-answer/${post._id}/approve`, {}), 'Approved');

  const handleApproveEdit = (post: QueuedPost) => {
    const answer = (adminReplyByPost[post._id] ?? '').trim();
    if (!answer) {
      setActionError('Type your answer in the admin reply box before approving with edit.');
      return;
    }
    runAction(
      post._id,
      () => adminApi.post(`/admin/auto-answer/${post._id}/approve-edit`, { answer }),
      'Approved with edit',
    );
  };

  const handleReject = (post: QueuedPost, reason: string) =>
    runAction(
      post._id,
      () => adminApi.post(`/admin/auto-answer/${post._id}/reject`, { reason: reason || undefined }),
      'Rejected',
    );

  const handleAskAgain = (post: QueuedPost, extra: string) =>
    runAction(
      post._id,
      () =>
        adminApi.post(`/admin/auto-answer/${post._id}/ask-ai-again`, {
          extraContext: extra || undefined,
        }),
      'Asked AI again',
    );

  const handleRunAutoAnswer = async () => {
    setRunLoading(true);
    setRunResult(null);
    try {
      const r = await adminApi.post('/admin/community/auto-answer');
      setRunResult(
        `${r.data.message} — processed: ${r.data.processed}, auto-approved: ${r.data.auto_approved}, suggested: ${r.data.suggested}, escalated: ${r.data.escalated}, errors: ${r.data.errors}`,
      );
      await refetchAll();
    } catch (e) {
      setRunResult(`Error: ${friendlyError(e, 'Run failed')}`);
    } finally {
      setRunLoading(false);
    }
  };

  const handleDryRun = async () => {
    setRunLoading(true);
    setRunResult(null);
    try {
      const r = await adminApi.get('/admin/community/auto-answer', { params: { dry_run: 'true' } });
      setRunResult(`Dry run: would process ${r.data.would_process} posts`);
    } catch (e) {
      setRunResult(`Error: ${friendlyError(e, 'Dry run failed')}`);
    } finally {
      setRunLoading(false);
    }
  };

  const tabBar: { key: TabKey; label: string; count: number }[] = useMemo(
    () => [
      { key: 'asked', label: 'Asked', count: tabCounts.asked },
      { key: 'suggested', label: 'Suggested', count: tabCounts.suggested },
      { key: 'all', label: 'All', count: tabCounts.all },
    ],
    [tabCounts],
  );

  const setAdminReply = (postId: string, value: string) =>
    setAdminReplyByPost((prev) => ({ ...prev, [postId]: value }));

  const togglePostExpanded = (postId: string) =>
    setExpandedPosts((prev) => ({ ...prev, [postId]: !prev[postId] }));

  const toggleHitExpanded = (postId: string, rank: number) =>
    setExpandedHitsByPost((prev) => ({
      ...prev,
      [postId]: { ...(prev[postId] ?? {}), [rank]: !(prev[postId]?.[rank] ?? false) },
    }));

  const openContextModal = (postId: string) =>
    setContextOpenByPost((prev) => ({ ...prev, [postId]: true }));
  const closeContextModal = (postId: string) =>
    setContextOpenByPost((prev) => ({ ...prev, [postId]: false }));

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold text-ink">AI Auto-Answer Queue</h1>
          <p className="text-xs text-ink-faint mt-0.5">
            Review suggested answers, ask AI again, or escalate to a human moderator
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDryRun}
            disabled={runLoading}
            className="text-xs px-3.5 py-1.5 rounded-lg border border-border text-ink-soft hover:text-ink hover:bg-mist transition-all disabled:opacity-50"
          >
            Dry Run
          </button>
          <button
            onClick={handleRunAutoAnswer}
            disabled={runLoading}
            className="text-xs px-3.5 py-1.5 rounded-lg bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-all disabled:opacity-50"
          >
            {runLoading ? 'Running…' : 'Run Now'}
          </button>
        </div>
      </div>

      {/* Manual-run result banner */}
      {runResult && (
        <div
          className={`text-xs px-4 py-3 rounded-xl border ${
            runResult.startsWith('Error')
              ? 'bg-danger/5 border-danger/20 text-danger'
              : 'bg-card border-border text-ink'
          }`}
        >
          {runResult}
        </div>
      )}

      {/* Action error banner */}
      {actionError && (
        <div className="text-xs px-4 py-3 rounded-xl bg-danger/5 border border-danger/20 text-danger">
          {actionError}
        </div>
      )}

      {/* Last action success banner */}
      {lastActionResult && (
        <div className="text-xs px-4 py-3 rounded-xl bg-success/5 border border-success/20 text-success">
          {lastActionResult}
        </div>
      )}

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Auto-answer queue filter"
        className="flex items-center gap-1"
      >
        {tabBar.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => {
                setTab(t.key);
                setPage(1);
              }}
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

      {/* Queue */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-card border border-border rounded-xl p-4 animate-pulse"
            >
              <div className="h-4 bg-mist rounded w-3/4 mb-2" />
              <div className="h-3 bg-mist rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-card border border-border rounded-xl px-6 py-12 text-center">
          <p className="text-sm text-ink-faint">
            No posts in this queue. All caught up 🎉
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((post) => {
            const postPending = actionLoading === post._id;
            const isOpen = !!expandedPosts[post._id];
            const editValue = adminReplyByPost[post._id] ?? '';
            const hasAiDraft = post.aiAnswerStatus === 'suggested' && !!post.aiAnswer;
            return (
              <div
                key={post._id}
                className="bg-card border border-border rounded-xl overflow-hidden"
              >
                {/* Header */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <button
                      type="button"
                      onClick={() => togglePostExpanded(post._id)}
                      className="flex-1 min-w-0 text-left"
                      aria-expanded={isOpen}
                    >
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="text-sm font-semibold text-ink">
                          {post.title}
                        </h3>
                        <Badge
                          status={
                            post.aiAnswerStatus === 'approved'
                              ? 'approved'
                              : post.aiAnswerStatus === 'rejected'
                              ? 'rejected'
                              : post.aiAnswerStatus === 'ask_human' ||
                                  post.aiAnswerStatus === 'escalated' ||
                                  post.aiAnswerStatus === 'suggested' ||
                                  post.aiAnswerStatus === 'pending'
                              ? 'pending'
                              : 'default'
                          }
                          label={post.aiAnswerStatus ?? 'pending'}
                          showDot={false}
                        />
                        {post.aiAnswerConfidence != null && (
                          <span
                            className={`text-[10px] font-medium ${
                              post.aiAnswerConfidence >= 0.85
                                ? 'text-success'
                                : 'text-warning'
                            }`}
                          >
                            {Math.round(post.aiAnswerConfidence * 100)}% conf
                          </span>
                        )}
                        {typeof post.aiAnswerAttempts === 'number' &&
                          post.aiAnswerAttempts > 0 && (
                            <span className="text-[10px] text-ink-faint">
                              attempts: {post.aiAnswerAttempts}
                            </span>
                          )}
                      </div>
                      <p className="text-xs text-ink-faint line-clamp-2 text-left">
                        {post.body}
                      </p>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className="text-[10px] text-ink-faint">
                          by {post.author?.name ?? 'Unknown'}
                        </span>
                        {post.createdAt && (
                          <span className="text-[10px] text-ink-faint">
                            {formatDate(post.createdAt)}
                          </span>
                        )}
                        {post.aiAnswerSource && (
                          <span className="text-[10px] text-ink-faint">
                            source: {post.aiAnswerSource}
                          </span>
                        )}
                        <span className="text-[10px] text-ink-faint">
                          {isOpen ? '▾ hide actions' : '▸ show actions'}
                        </span>
                      </div>
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
                    {/* AI draft answer */}
                    {hasAiDraft && (
                      <div className="bg-mist rounded-xl p-4 border border-border">
                        <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-widest mb-2">
                          AI Suggested Answer
                        </p>
                        <pre className="text-sm text-ink/80 leading-relaxed whitespace-pre-wrap font-mono">
                          {post.aiAnswer}
                        </pre>
                        {post.aiAnswerConfidence != null && (
                          <p className="text-[10px] text-ink-faint mt-2">
                            Confidence: {Math.round(post.aiAnswerConfidence * 100)}%
                            {post.aiAnswerSource ? ` · ${post.aiAnswerSource}` : ''}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Source citations */}
                    {post.aiContext?.hits && post.aiContext.hits.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-widest mb-2">
                          Source Citations ({post.aiContext.hits.length})
                        </p>
                        <div className="space-y-2">
                          {post.aiContext.hits.slice(0, 3).map((hit) => {
                            const open = !!expandedHitsByPost[post._id]?.[hit.rank];
                            return (
                              <button
                                key={`${hit.source}-${hit.rank}-${hit.sourceId}`}
                                type="button"
                                onClick={() => toggleHitExpanded(post._id, hit.rank)}
                                className="w-full text-left rounded-xl border border-border bg-card hover:bg-mist transition-colors"
                              >
                                <div className="p-3">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] font-mono font-semibold text-accent">
                                      {hit.source}:{truncate(hit.sourceId, 16)}
                                    </span>
                                    <span className="text-[10px] text-ink-faint">
                                      rank #{hit.rank} · score{' '}
                                      {hit.score.toFixed(2)} · conf{' '}
                                      {(hit.confidence * 100).toFixed(0)}% · age{' '}
                                      {hit.ageDays}d
                                    </span>
                                    <span className="ml-auto text-[10px] text-ink-faint">
                                      {open ? '▾' : '▸'}
                                    </span>
                                  </div>
                                  <p className="text-xs text-ink mt-1 line-clamp-2 text-left">
                                    {hit.question}
                                  </p>
                                  {open && (
                                    <div className="mt-2 text-xs text-ink-soft leading-relaxed text-left">
                                      <p className="font-semibold text-ink mb-1">
                                        Answer
                                      </p>
                                      <p className="whitespace-pre-wrap">
                                        {hit.answer}
                                      </p>
                                      {hit.matchedOn && (
                                        <p className="text-[10px] text-ink-faint mt-2">
                                          Matched on: {hit.matchedOn}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        {post.aiContext.query && (
                          <p className="text-[10px] text-ink-faint mt-2">
                            Retrieval query:{' '}
                            <span className="font-mono">
                              {truncate(post.aiContext.query, 140)}
                            </span>
                          </p>
                        )}
                      </div>
                    )}

                    {/* Diff view — only when editing an AI draft */}
                    {hasAiDraft && editValue.trim().length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-widest mb-2">
                          Preview — AI vs Your edit
                        </p>
                        <DiffView
                          aiDraft={post.aiAnswer ?? ''}
                          edit={editValue}
                        />
                      </div>
                    )}

                    {/* Admin reply textarea */}
                    <div>
                      <label
                        htmlFor={`reply-${post._id}`}
                        className="text-[10px] font-semibold text-ink-faint uppercase tracking-widest block mb-1.5"
                      >
                        Admin reply{' '}
                        <span className="lowercase font-normal text-ink-faint">
                          (required for Approve + Edit)
                        </span>
                      </label>
                      <textarea
                        id={`reply-${post._id}`}
                        value={editValue}
                        onChange={(e) => setAdminReply(post._id, e.target.value)}
                        placeholder="Replace the AI draft with your own answer, or leave blank to approve as-is…"
                        rows={4}
                        className="w-full rounded-xl border border-border bg-mist px-3 py-2 text-xs text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 resize-y"
                      />
                    </div>

                    {/* Action buttons */}
                    <ActionButtons
                      pending={postPending}
                      onApprove={() => handleApprove(post)}
                      onApproveEdit={() => handleApproveEdit(post)}
                      onReject={(reason) => handleReject(post, reason)}
                      onAskAgain={(extra) => handleAskAgain(post, extra)}
                    />

                    {/* "Why did AI decide this?" drill-down — only when the AI has
                        actually produced a decision and persisted context for this
                        post. Matches the existing `Ask AI Again` eligibility set
                        (suggested / ask_human / escalated). */}
                    {post.aiContext &&
                      (post.aiAnswerStatus === 'suggested' ||
                        post.aiAnswerStatus === 'ask_human' ||
                        post.aiAnswerStatus === 'escalated') && (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => openContextModal(post._id)}
                            className="text-[11px] px-3 py-1.5 rounded-lg bg-mist border border-border text-ink-soft hover:text-ink hover:bg-border transition-all"
                          >
                            Why did AI decide this?
                          </button>
                        </div>
                      )}

                    {/* Drill-down modal — only mounted while open so the lazy
                        fetch + cache lifecycle is per-card. */}
                    {contextOpenByPost[post._id] && (
                      <ContextModal
                        open={true}
                        postId={post._id}
                        postTitle={post.title}
                        onClose={() => closeContextModal(post._id)}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && items.length > 0 && (
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="text-xs px-3 py-1.5 rounded-lg border border-border bg-card text-ink-soft hover:text-ink hover:bg-mist transition-all disabled:opacity-40"
          >
            ← Prev
          </button>
          <p className="text-[11px] text-ink-soft">
            Page {page} of {totalPages}{' '}
            <span className="text-ink-faint">({total} total)</span>
          </p>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="text-xs px-3 py-1.5 rounded-lg border border-border bg-card text-ink-soft hover:text-ink hover:bg-mist transition-all disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
