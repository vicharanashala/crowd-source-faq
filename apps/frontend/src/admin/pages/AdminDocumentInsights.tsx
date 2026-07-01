/**
 * AdminDocumentInsights — review queue for AI-extracted insights
 * from user-uploaded documents (images / PDFs / DOCX / XLSX).
 *
 * Mirrors AdminZoomInsights' layout (status filter, list, per-row
 * approve/reject/promote actions) but adds the searchMatchCount
 * badge + a "Run auto-promote" header button (manual trigger of
 * the cron's `promotePopularNow` endpoint).
 *
 * Insights are sorted by `searchMatchCount` desc so popular ones
 * float to the top — that's the signal the auto-promote cron
 * uses, so the admin sees the same ranking the cron will act on.
 */

import { useEffect, useState } from 'react';
import adminApi from '../utils/adminApi';
import { AdminStatCard } from '../components/ui/AdminStatCard';

interface DocumentInsight {
  _id: string;
  documentId: string;
  type: 'FAQ' | 'Announcement' | 'Policy' | 'HowTo';
  question: string;
  answer_or_content: string;
  status: 'pending_review' | 'approved' | 'rejected' | 'promoted';
  confidence_score: number;
  searchMatchCount: number;
  publishedFaqId?: string;
  reviewedAt?: string;
  promotionReason?: string;
  createdAt: string;
}

interface InsightsResponse {
  items: DocumentInsight[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

type StatusFilter = 'pending_review' | 'approved' | 'rejected' | 'promoted';

function timeAgo(d: string): string {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function TypeBadge({ type }: { type: DocumentInsight['type'] }) {
  const styles: Record<DocumentInsight['type'], string> = {
    FAQ: 'bg-blue-500/10 text-blue-400',
    Announcement: 'bg-purple-500/10 text-purple-400',
    Policy: 'bg-amber-500/10 text-amber-400',
    HowTo: 'bg-emerald-500/10 text-emerald-400',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${styles[type]}`}>
      {type}
    </span>
  );
}

function StatusBadge({ status }: { status: DocumentInsight['status'] }) {
  const styles: Record<DocumentInsight['status'], string> = {
    pending_review: 'bg-warning/10 text-warning',
    approved:       'bg-success/10 text-success',
    rejected:       'bg-danger/10 text-danger',
    promoted:       'bg-blue-400/10 text-blue-400',
  };
  const labels: Record<DocumentInsight['status'], string> = {
    pending_review: 'Pending Review',
    approved:       'Approved',
    rejected:       'Rejected',
    promoted:       'Promoted',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function InsightCardSkeleton() {
  return (
    <div className="admin-card-surface p-5 space-y-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-5 w-16 bg-mist rounded" />
        <div className="h-5 w-24 bg-mist rounded" />
      </div>
      <div className="h-4 w-3/4 bg-mist rounded" />
      <div className="h-4 w-full bg-mist rounded" />
      <div className="h-3 w-1/2 bg-mist rounded" />
    </div>
  );
}

export default function AdminDocumentInsights() {
  const [insights, setInsights] = useState<DocumentInsight[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending_review');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [promoteLoading, setPromoteLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const LIMIT = 15;

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchInsights = () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    params.set('status', statusFilter);
    adminApi.get<InsightsResponse>(`/admin/documents/insights?${params}`)
      .then(res => {
        setInsights(res.data.items);
        setTotal(res.data.total);
        setPages(res.data.pages);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchInsights(); }, [page, statusFilter]);

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    setActionLoading(id);
    try {
      await adminApi.patch(`/admin/documents/insights/${id}`, { action });
      fetchInsights();
    } catch {
      showToast('Failed to update insight.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePromote = async (id: string) => {
    setActionLoading(id);
    try {
      await adminApi.patch(`/admin/documents/insights/${id}`, { action: 'promote' });
      showToast('Promoted to FAQ.');
      fetchInsights();
    } catch {
      showToast('Promotion failed.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRunAutoPromote = async () => {
    setPromoteLoading(true);
    try {
      const res = await adminApi.post<{ scanned: number; promoted: number; skipped: number; errors: number; threshold: number }>(
        '/admin/documents/insights/promote-popular',
      );
      showToast(
        `Auto-promote run: ${res.data.promoted} promoted (${res.data.scanned} scanned, threshold=${res.data.threshold}).`,
      );
      fetchInsights();
    } catch {
      showToast('Auto-promote run failed.', 'error');
    } finally {
      setPromoteLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg text-xs font-medium border ${
          toast.type === 'error' ? 'bg-danger/10 text-danger border-danger/30' : 'bg-success/10 text-success border-success/30'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-ink-faint -mt-2">
          Insights extracted from user-uploaded documents (images, PDFs, DOCX, XLSX) by the OCR + AI pipeline.
          Sorted by how often an UnresolvedSearch log semantically matches — the auto-promote cron uses the
          same signal.
        </p>
        <button
          type="button"
          onClick={handleRunAutoPromote}
          disabled={promoteLoading}
          className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 disabled:opacity-50"
        >
          {promoteLoading ? 'Running…' : 'Run auto-promote'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <AdminStatCard label="Total" value={total} />
        <AdminStatCard label="Pending" value={insights.filter(i => i.status === 'pending_review').length} />
        <AdminStatCard label="Approved" value={insights.filter(i => i.status === 'approved').length} />
        <AdminStatCard label="Promoted" value={insights.filter(i => i.status === 'promoted').length} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {(['pending_review', 'approved', 'rejected', 'promoted'] as const).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === s
                ? 'bg-accent text-white'
                : 'bg-mist text-ink-soft hover:bg-mist/70'
            }`}
          >
            {s === 'pending_review' ? 'Pending' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          <InsightCardSkeleton /><InsightCardSkeleton /><InsightCardSkeleton />
        </div>
      ) : insights.length === 0 ? (
        <div className="admin-card-surface p-12 text-center text-sm text-ink-soft">
          No {statusFilter.replace('_', ' ')} insights.
        </div>
      ) : (
        <div className="space-y-3">
          {insights.map(i => (
            <div key={i._id} className="admin-card-surface p-5 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <TypeBadge type={i.type} />
                <StatusBadge status={i.status} />
                {i.searchMatchCount > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-pink-500/10 text-pink-400" title="UnresolvedSearch log match count">
                    🔥 {i.searchMatchCount} match{i.searchMatchCount === 1 ? '' : 'es'}
                  </span>
                )}
                {i.confidence_score > 0 && (
                  <span className="text-[10px] text-ink-faint">AI: {Math.round(i.confidence_score * 100)}%</span>
                )}
                <span className="text-[10px] text-ink-faint ml-auto">{timeAgo(i.createdAt)}</span>
              </div>
              {i.question && (
                <p className="text-sm font-semibold text-ink leading-snug">{i.question}</p>
              )}
              <p className="text-sm text-ink-soft leading-relaxed whitespace-pre-wrap">
                {i.answer_or_content}
              </p>
              {i.promotionReason && (
                <p className="text-[11px] text-ink-faint italic">↳ {i.promotionReason}</p>
              )}
              {i.publishedFaqId && (
                <p className="text-[11px] text-blue-400">→ FAQ <code className="font-mono">{i.publishedFaqId}</code></p>
              )}

              {i.status === 'pending_review' && (
                <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                  <button
                    type="button"
                    onClick={() => handleAction(i._id, 'approve')}
                    disabled={actionLoading === i._id}
                    className="px-3 py-1.5 rounded-lg bg-success/15 text-success text-xs font-semibold hover:bg-success/25 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePromote(i._id)}
                    disabled={actionLoading === i._id}
                    className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 disabled:opacity-50"
                  >
                    Promote to FAQ
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAction(i._id, 'reject')}
                    disabled={actionLoading === i._id}
                    className="px-3 py-1.5 rounded-lg bg-danger/15 text-danger text-xs font-semibold hover:bg-danger/25 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            type="button"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg text-xs bg-mist text-ink-soft hover:bg-mist/70 disabled:opacity-50"
          >
            ← Prev
          </button>
          <span className="text-xs text-ink-soft tabular-nums">Page {page} of {pages}</span>
          <button
            type="button"
            onClick={() => setPage(p => Math.min(pages, p + 1))}
            disabled={page === pages}
            className="px-3 py-1.5 rounded-lg text-xs bg-mist text-ink-soft hover:bg-mist/70 disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
