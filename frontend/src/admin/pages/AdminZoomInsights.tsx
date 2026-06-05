import React, { useEffect, useState } from 'react';
import adminApi from '../utils/adminApi';
import AdminLayout from '../components/layout/AdminLayout';

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
      type === 'FAQ' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
    }`}>
      {type}
    </span>
  );
}

function StatusBadge({ status }: { status: ZoomInsight['status'] }) {
  const styles: Record<ZoomInsight['status'], string> = {
    pending_review: 'bg-amber-100 text-amber-700',
    approved: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-red-100 text-red-700',
  };
  const labels: Record<ZoomInsight['status'], string> = {
    pending_review: 'Pending Review',
    approved: 'Approved',
    rejected: 'Rejected',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function ConfidenceBar({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-blue-500' : 'bg-amber-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-admin-surface rounded-full overflow-hidden max-w-[80px]">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-admin-muted font-medium">{Math.round(score)}%</span>
    </div>
  );
}

function InsightCardSkeleton() {
  return (
    <div className="bg-admin-card border border-white/5 rounded-lg p-5 space-y-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-5 w-16 bg-admin-surface rounded" />
        <div className="h-5 w-24 bg-admin-surface rounded" />
      </div>
      <div className="h-4 w-3/4 bg-admin-surface rounded" />
      <div className="h-4 w-full bg-admin-surface rounded" />
      <div className="h-3 w-1/2 bg-admin-surface rounded" />
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

  // Stats
  const [stats, setStats] = useState({ pending_review: 0, approved: 0, rejected: 0, total: 0 });

  const LIMIT = 15;

  const fetchInsights = () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (typeFilter !== 'all') params.set('type', typeFilter);
    adminApi.get<InsightsResponse>(`/zoom/insights?${params}`)
      .then(res => {
        setInsights(res.data.insights);
        setTotal(res.data.total);
        setPages(res.data.pages);
      })
      .finally(() => setLoading(false));
  };

  const fetchStats = () => {
    Promise.all([
      adminApi.get<{ insights: ZoomInsight[]; total: number }>('/zoom/insights?limit=0&status=pending_review'),
      adminApi.get<{ insights: ZoomInsight[]; total: number }>('/zoom/insights?limit=0&status=approved'),
      adminApi.get<{ insights: ZoomInsight[]; total: number }>('/zoom/insights?limit=0&status=rejected'),
      adminApi.get<{ insights: ZoomInsight[]; total: number }>('/zoom/insights?limit=0'),
    ]).then(([pend, appr, rej, all]) => {
      setStats({
        pending_review: pend.data.total,
        approved: appr.data.total,
        rejected: rej.data.total,
        total: all.data.total,
      });
    }).catch(() => {});
  };

  useEffect(() => { fetchInsights(); }, [page, statusFilter, typeFilter]);
  useEffect(() => { fetchStats(); }, []);

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    setActionLoading(id);
    try {
      await adminApi.put<{ insight: ZoomInsight }>(`/zoom/insights/${id}`, { status: action === 'approve' ? 'approved' : 'rejected' });
      fetchInsights();
      fetchStats();
    } catch {
      // handle silently or show toast
    } finally {
      setActionLoading(null);
    }
  };

  const handleConvertToFAQ = async (id: string) => {
    setActionLoading(id);
    try {
      await adminApi.post<{ faq: { _id: string } }>(`/zoom/insights/${id}/convert-to-faq`);
      fetchInsights();
      fetchStats();
    } catch {
      // handle silently
    } finally {
      setActionLoading(null);
    }
  };

  const STATUS_TABS: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending_review', label: 'Pending Review' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
  ];

  const TYPE_TABS: { key: TypeFilter; label: string }[] = [
    { key: 'all', label: 'All Types' },
    { key: 'FAQ', label: 'FAQs' },
    { key: 'Announcement', label: 'Announcements' },
  ];

  return (
    <AdminLayout>
      <div className="space-y-5 max-w-5xl">
        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold text-admin-text">Zoom Insights</h2>
          <p className="text-sm text-admin-muted mt-0.5">Review AI-extracted FAQs and announcements before publishing</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-admin-card border border-white/5 rounded-lg p-4">
            <p className="text-xs text-admin-muted font-medium">Pending Review</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">{stats.pending_review}</p>
          </div>
          <div className="bg-admin-card border border-white/5 rounded-lg p-4">
            <p className="text-xs text-admin-muted font-medium">Approved</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{stats.approved}</p>
          </div>
          <div className="bg-admin-card border border-white/5 rounded-lg p-4">
            <p className="text-xs text-admin-muted font-medium">Rejected</p>
            <p className="text-2xl font-bold text-red-600 mt-1">{stats.rejected}</p>
          </div>
          <div className="bg-admin-card border border-white/5 rounded-lg p-4">
            <p className="text-xs text-admin-muted font-medium">Total</p>
            <p className="text-2xl font-bold text-admin-text mt-1">{stats.total}</p>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="bg-admin-card border border-white/5 rounded-lg overflow-hidden">
          <div className="flex items-center gap-1 px-4 py-2.5 border-b border-white/5">
            <span className="text-[10px] font-semibold text-admin-muted uppercase mr-2">Status:</span>
            {STATUS_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => { setStatusFilter(tab.key); setPage(1); }}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                  statusFilter === tab.key
                    ? 'text-admin-text bg-admin-surface'
                    : 'text-admin-muted hover:text-admin-text hover:bg-admin-bg'
                }`}
              >
                {tab.label}
              </button>
            ))}
            <span className="mx-2 border-l border-white/5 h-4" />
            <span className="text-[10px] font-semibold text-admin-muted uppercase mr-2">Type:</span>
            {TYPE_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => { setTypeFilter(tab.key); setPage(1); }}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                  typeFilter === tab.key
                    ? 'text-admin-text bg-admin-surface'
                    : 'text-admin-muted hover:text-admin-text hover:bg-admin-bg'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Insights list */}
          <div className="divide-y divide-white/5">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <InsightCardSkeleton key={i} />)
            ) : insights.length === 0 ? (
              <div className="px-4 py-16 text-center">
                <svg className="mx-auto mb-3" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <p className="text-sm text-admin-muted font-medium">No insights found</p>
                <p className="text-xs text-admin-muted mt-1">Try adjusting your filters</p>
              </div>
            ) : (
              insights.map(insight => (
                <div key={insight._id} className="px-5 py-4 hover:bg-admin-bg">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Badges row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <TypeBadge type={insight.type} />
                        <StatusBadge status={insight.status} />
                        <ConfidenceBar score={insight.confidence_score} />
                      </div>

                      {/* Question (if FAQ) */}
                      {insight.type === 'FAQ' && insight.question && (
                        <p className="text-sm font-semibold text-admin-text">{insight.question}</p>
                      )}

                      {/* Answer / Content */}
                      <p className="text-sm text-admin-text">{insight.answer_or_content}</p>

                      {/* Transcript snippet */}
                      {insight.transcript_snippet && (
                        <p className="text-xs text-admin-muted italic pl-3 border-l-2 border-white/5 max-w-xl">
                          "{insight.transcript_snippet}"
                        </p>
                      )}

                      {/* Source meeting */}
                      <div className="flex items-center gap-2 pt-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                          <line x1="16" y1="2" x2="16" y2="6"/>
                          <line x1="8" y1="2" x2="8" y2="6"/>
                          <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        <span className="text-xs text-admin-muted font-medium truncate max-w-xs">
                          {insight.meetingId.topic}
                        </span>
                        <span className="text-xs text-admin-muted">·</span>
                        <span className="text-xs text-admin-muted">{timeAgo(insight.meetingId.startTime)}</span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col gap-2 shrink-0">
                      {insight.status === 'pending_review' && (
                        <>
                          <button
                            onClick={() => handleAction(insight._id, 'approve')}
                            disabled={actionLoading === insight._id}
                            className="px-3 py-1.5 rounded text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 transition-colors disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleAction(insight._id, 'reject')}
                            disabled={actionLoading === insight._id}
                            className="px-3 py-1.5 rounded text-xs font-medium text-white bg-red-600 hover:bg-red-500 transition-colors disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {insight.status === 'approved' && insight.type === 'FAQ' && !insight.publishedFaqId && (
                        <button
                          onClick={() => handleConvertToFAQ(insight._id)}
                          disabled={actionLoading === insight._id}
                          className="px-3 py-1.5 rounded text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50"
                        >
                          Publish as FAQ
                        </button>
                      )}
                      {insight.publishedFaqId && (
                        <span className="px-3 py-1.5 rounded text-xs font-medium bg-admin-surface text-admin-muted">
                          Published
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
              <span className="text-xs text-admin-muted">Page {page} of {pages} · {total} insights</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 text-xs rounded border border-white/5 hover:bg-admin-bg disabled:opacity-30 transition-colors"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= pages}
                  className="px-3 py-1 text-xs rounded border border-white/5 hover:bg-admin-bg disabled:opacity-30 transition-colors"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}