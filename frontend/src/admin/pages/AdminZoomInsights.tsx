import { useEffect, useState } from 'react';
import adminApi from '../utils/adminApi';

interface ZoomInsight {
  _id: string;
  meetingId: { _id: string; topic: string; startTime: string };
  type: 'FAQ' | 'Announcement';
  question?: string;
  answer_or_content: string;
  confidence_score: number;
  status: 'pending_review' | 'approved' | 'rejected';
  transcript_snippet?: string;
  publishedFaqId?: string;
  reviewedAt?: string;
  createdAt: string;
}

interface InsightsResponse {
  insights: ZoomInsight[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

type StatusFilter = 'all' | 'pending_review' | 'approved' | 'rejected';
type TypeFilter = 'all' | 'FAQ' | 'Announcement';

function timeAgo(d: string): string {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function TypeBadge({ type }: { type: ZoomInsight['type'] }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
      type === 'FAQ'
        ? 'bg-blue-500/10 text-blue-400'
        : 'bg-purple-500/10 text-purple-400'
    }`}>
      {type}
    </span>
  );
}

function StatusBadge({ status }: { status: ZoomInsight['status'] }) {
  const styles: Record<ZoomInsight['status'], string> = {
    pending_review: 'bg-warning/10 text-warning',
    approved:       'bg-success/10 text-success',
    rejected:       'bg-danger/10 text-danger',
  };
  const labels: Record<ZoomInsight['status'], string> = {
    pending_review: 'Pending Review',
    approved:       'Approved',
    rejected:       'Rejected',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function ConfidenceBar({ score }: { score: number }) {
  if (!score || score < 30) return null;
  const color = score >= 80 ? 'bg-success' : score >= 60 ? 'bg-blue-400' : 'bg-warning';
  return (
    <div className="inline-flex items-center gap-1.5" title={`AI confidence: ${Math.round(score)}%`}>
      <div className="h-1 w-12 bg-border rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] text-ink-faint font-medium">{Math.round(score)}%</span>
    </div>
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

export default function AdminZoomInsights() {
  const [insights, setInsights] = useState<ZoomInsight[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [stats, setStats] = useState({ pending_review: 0, approved: 0, rejected: 0, total: 0 });

  const LIMIT = 15;

  const fetchInsights = () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (typeFilter !== 'all') params.set('type', typeFilter);
    adminApi.get<InsightsResponse>(`/zoom/insights?${params}`)
      .then(res => { setInsights(res.data.insights); setTotal(res.data.total); setPages(res.data.pages); })
      .finally(() => setLoading(false));
  };

  const fetchStats = () => {
    Promise.all([
      adminApi.get<{ total: number }>('/zoom/insights?limit=0&status=pending_review'),
      adminApi.get<{ total: number }>('/zoom/insights?limit=0&status=approved'),
      adminApi.get<{ total: number }>('/zoom/insights?limit=0&status=rejected'),
      adminApi.get<{ total: number }>('/zoom/insights?limit=0'),
    ]).then(([pend, appr, rej, all]) => {
      setStats({ pending_review: pend.data.total, approved: appr.data.total, rejected: rej.data.total, total: all.data.total });
    }).catch(() => {});
  };

  useEffect(() => { fetchInsights(); }, [page, statusFilter, typeFilter]);
  useEffect(() => { fetchStats(); }, []);

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    setActionLoading(id);
    try {
      await adminApi.put(`/zoom/insights/${id}`, { status: action === 'approve' ? 'approved' : 'rejected' });
      fetchInsights();
      fetchStats();
    } catch { /* silent */ }
    finally { setActionLoading(null); }
  };

  const handleConvertToFAQ = async (id: string) => {
    setActionLoading(id);
    try {
      await adminApi.post(`/zoom/insights/${id}/convert-to-faq`);
      fetchInsights();
      fetchStats();
    } catch { /* silent */ }
    finally { setActionLoading(null); }
  };

  const STATUS_TABS: { key: StatusFilter; label: string }[] = [
    { key: 'all',           label: 'All' },
    { key: 'pending_review', label: 'Pending Review' },
    { key: 'approved',      label: 'Approved' },
    { key: 'rejected',      label: 'Rejected' },
  ];

  const TYPE_TABS: { key: TypeFilter; label: string }[] = [
    { key: 'all',          label: 'All Types' },
    { key: 'FAQ',          label: 'FAQs' },
    { key: 'Announcement', label: 'Announcements' },
  ];

  return (
    <div className="space-y-5 max-w-5xl">
      <h1 className="text-xl font-bold text-ink">Zoom Insights</h1>
      <p className="text-sm text-ink-faint -mt-2">Review AI-extracted FAQs and announcements before publishing</p>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="admin-stat-mini p-4">
          <p className="text-xs text-ink-faint font-medium">Pending Review</p>
          <p className="text-2xl font-bold text-warning mt-1">{stats.pending_review}</p>
        </div>
        <div className="admin-stat-mini p-4">
          <p className="text-xs text-ink-faint font-medium">Approved</p>
          <p className="text-2xl font-bold text-success mt-1">{stats.approved}</p>
        </div>
        <div className="admin-stat-mini p-4">
          <p className="text-xs text-ink-faint font-medium">Rejected</p>
          <p className="text-2xl font-bold text-danger mt-1">{stats.rejected}</p>
        </div>
        <div className="admin-stat-mini p-4">
          <p className="text-xs text-ink-faint font-medium">Total</p>
          <p className="text-2xl font-bold text-ink mt-1">{stats.total}</p>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider mr-1">Status:</span>
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setStatusFilter(tab.key); setPage(1); }}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                statusFilter === tab.key
                  ? 'bg-accent/10 border-accent/20 text-accent'
                  : 'bg-card border-border text-ink-soft hover:text-ink hover:bg-mist'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="w-px h-4 bg-border" />
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider mr-1">Type:</span>
          {TYPE_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setTypeFilter(tab.key); setPage(1); }}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                typeFilter === tab.key
                  ? 'bg-accent/10 border-accent/20 text-accent'
                  : 'bg-card border-border text-ink-soft hover:text-ink hover:bg-mist'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Insight cards */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <InsightCardSkeleton key={i} />)}
        </div>
      ) : insights.length === 0 ? (
        <div className="admin-empty admin-card-surface rounded-xl border border-border">
          <svg className="mx-auto mb-3 text-ink-faint" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <p className="text-sm text-ink-faint font-medium">No insights found</p>
          <p className="text-xs text-ink-faint/60 mt-1">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="space-y-3">
          {insights.map(insight => (
            <div key={insight._id} className="admin-card-surface p-5 hover:border-border-medium transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0 space-y-2.5">

                  {/* Badges + confidence */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <TypeBadge type={insight.type} />
                    <StatusBadge status={insight.status} />
                    <ConfidenceBar score={insight.confidence_score} />
                  </div>

                  {/* Question (FAQ only) */}
                  {insight.type === 'FAQ' && insight.question && (
                    <p className="text-sm font-semibold text-ink">{insight.question}</p>
                  )}

                  {/* Answer / announcement content */}
                  <p className="text-sm text-ink/90 leading-relaxed">{insight.answer_or_content}</p>

                  {/* Transcript excerpt (collapsible) */}
                  {insight.transcript_snippet && insight.transcript_snippet.length > 20 && (
                    <details className="text-xs text-ink-faint">
                      <summary className="cursor-pointer hover:text-ink-soft select-none pl-3 border-l-2 border-border italic">
                        Show transcript excerpt
                      </summary>
                      <p className="mt-1.5 pl-3 border-l-2 border-accent/30 italic max-w-2xl text-ink-faint">
                        "{insight.transcript_snippet}"
                      </p>
                    </details>
                  )}

                  {/* Source meeting */}
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-faint shrink-0">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    <span className="text-xs text-ink-soft font-medium truncate max-w-xs">
                      {insight.meetingId.topic}
                    </span>
                    <span className="text-ink-faint/40">·</span>
                    <span className="text-xs text-ink-faint">{timeAgo(insight.meetingId.startTime)}</span>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-col gap-2 shrink-0">
                  {insight.status === 'pending_review' && (
                    <>
                      <button
                        onClick={() => handleAction(insight._id, 'approve')}
                        disabled={actionLoading === insight._id}
                        className="admin-btn-success text-xs px-3 py-1.5"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleAction(insight._id, 'reject')}
                        disabled={actionLoading === insight._id}
                        className="admin-btn-danger text-xs px-3 py-1.5"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {insight.status === 'approved' && insight.type === 'FAQ' && !insight.publishedFaqId && (
                    <button
                      onClick={() => handleConvertToFAQ(insight._id)}
                      disabled={actionLoading === insight._id}
                      className="text-xs px-3 py-1.5 rounded-md font-medium text-white bg-blue-500 hover:bg-blue-400 disabled:opacity-50 transition-colors"
                    >
                      Publish as FAQ
                    </button>
                  )}
                  {insight.publishedFaqId && (
                    <span className="px-3 py-1.5 rounded-md text-xs font-medium bg-mist text-ink-faint text-center">
                      Published
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="admin-pagination admin-card-surface rounded-xl">
          <span>Page {page} of {pages} · {total} insights</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="admin-pagination-btn">← Prev</button>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= pages} className="admin-pagination-btn">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
