import { useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import adminApi from '../utils/adminApi';
import { AdminStatCard } from '../components/ui/AdminStatCard';
import Modal from '../components/common/Modal';
import { TableSkeleton } from '../components/common/SkeletonLoader';

// ── Types ──────────────────────────────────────────────────────────────────────

type Sentiment = 'outdated' | 'unclear' | 'incomplete' | 'wrong' | 'positive' | 'other';

interface FeedbackItem {
  _id: string;
  question: string;
  aiAnswer: string;
  rating: number;
  comment: string;
  faqId: string | null;
  faqQuestion: string;
  hasFaqSource: boolean;
  sentiment: Sentiment;
  askCount: number;
  avgRating: number;
  comments: string[];
  attentionScore: number;
  needsAttention: boolean;
  createdAt: string;
}

interface FeedbackResponse {
  items: FeedbackItem[];
  total: number;
  page: number;
  pages: number;
}

interface FeedbackStats {
  totalFeedback: number;
  avgRatingOverall: number;
  withFaqSource: number;
  withoutFaqSource: number;
  needsAttentionCount: number;
  sentimentBreakdown: Record<string, number>;
}

interface ToastState { msg: string; type: 'success' | 'warn' | 'error'; }

interface EditFormState {
  question: string;
  answer: string;
  category: string;
}

// ── Toast ──────────────────────────────────────────────────────────────────────

function Toast({ toast }: { toast: ToastState }) {
  const cls =
    toast.type === 'error'
      ? 'admin-toast-error'
      : toast.type === 'warn'
      ? 'admin-toast-warn'
      : 'admin-toast-success';
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg text-xs font-medium border ${cls}`}
    >
      {toast.msg}
    </motion.div>
  );
}

// ── Sentiment badge ────────────────────────────────────────────────────────────

const SENTIMENT_COLORS: Record<Sentiment, string> = {
  positive:   'bg-success/10 text-success border-success/20',
  outdated:   'bg-amber-500/10 text-amber-600 border-amber-500/20',
  unclear:    'bg-blue-500/10 text-blue-600 border-blue-500/20',
  incomplete: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  wrong:      'bg-danger/10 text-danger border-danger/20',
  other:      'bg-mist text-ink-soft border-border',
};

function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${SENTIMENT_COLORS[sentiment]}`}>
      {sentiment}
    </span>
  );
}

// ── Stars display ──────────────────────────────────────────────────────────────

function Stars({ value }: { value: number }) {
  const rounded = Math.round(value);
  return (
    <span className="inline-flex items-center gap-0.5 text-xs">
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} className={s <= rounded ? 'text-amber-400' : 'text-border-medium'}>★</span>
      ))}
      <span className="ml-1 text-ink-faint text-[10px] tabular-nums">{value.toFixed(1)}</span>
    </span>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AdminAIInsights() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'faq' | 'nosource'>('faq');
  const [sentimentFilter, setSentimentFilter] = useState('');
  const [minRating, setMinRating] = useState('');
  const [maxRating, setMaxRating] = useState('');
  const [sort, setSort] = useState('attentionScore');
  const [toast, setToast] = useState<ToastState | null>(null);

  // Expand / edit
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<FeedbackItem | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({ question: '', answer: '', category: '' });
  const [submitting, setSubmitting] = useState(false);

  // Create FAQ (no-source tab)
  const [createItem, setCreateItem] = useState<FeedbackItem | null>(null);
  const [createForm, setCreateForm] = useState<EditFormState>({ question: '', answer: '', category: '' });

  const showToast = (msg: string, type: ToastState['type'] = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchStats = useCallback(() => {
    adminApi.get<{ data: FeedbackStats }>('/admin/ai-feedback/stats')
      .then((r) => setStats(r.data.data))
      .catch(() => {});
  }, []);

  const fetchItems = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: '20',
      hasFaqSource: tab === 'faq' ? 'true' : 'false',
      sort,
    });
    if (sentimentFilter) params.set('sentiment', sentimentFilter);
    if (minRating)       params.set('minRating', minRating);
    if (maxRating)       params.set('maxRating', maxRating);

    adminApi.get<{ data: FeedbackResponse }>(`/admin/ai-feedback?${params}`)
      .then((r) => {
        setItems(r.data.data.items);
        setTotal(r.data.data.total);
        setPages(r.data.data.pages);
      })
      .catch(() => showToast('Failed to load AI feedback', 'error'))
      .finally(() => setLoading(false));
  }, [page, tab, sentimentFilter, minRating, maxRating, sort]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => { setPage(1); }, [tab, sentimentFilter, minRating, maxRating, sort]);

  // ── Edit existing FAQ from feedback ─────────────────────────────────────────

  const openEditModal = (item: FeedbackItem) => {
    setEditItem(item);
    setEditForm({
      question: item.faqQuestion || item.question,
      answer: '',
      category: '',
    });
  };

  const handleEditSubmit = async () => {
    if (!editItem?.faqId) return;
    if (!editForm.question.trim() || !editForm.answer.trim() || !editForm.category.trim()) {
      showToast('All fields are required', 'warn');
      return;
    }
    setSubmitting(true);
    try {
      await adminApi.patch(`/admin/ai-feedback/${editItem.faqId}/edit-faq`, {
        question: editForm.question,
        answer: editForm.answer,
        category: editForm.category,
      });
      showToast('FAQ updated from feedback ✓');
      setEditItem(null);
      fetchItems();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Failed to update FAQ', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Create new FAQ from no-source feedback ───────────────────────────────────

  const openCreateModal = (item: FeedbackItem) => {
    setCreateItem(item);
    setCreateForm({ question: item.question, answer: '', category: '' });
  };

  const handleCreateSubmit = async () => {
    if (!createForm.question.trim() || !createForm.answer.trim() || !createForm.category.trim()) {
      showToast('All fields are required', 'warn');
      return;
    }
    setSubmitting(true);
    try {
      await adminApi.post('/admin/faq', {
        question: createForm.question,
        answer: createForm.answer,
        category: createForm.category,
        status: 'approved',
      });
      showToast('FAQ created ✓');
      setCreateItem(null);
      fetchItems();
      fetchStats();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Failed to create FAQ', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Rating stats derived ───────────────────────────────────────────────────

  const ratingAsScore = stats
    ? Math.round((stats.avgRatingOverall / 5) * 100)
    : 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 max-w-6xl">
      <AnimatePresence>{toast && <Toast toast={toast} />}</AnimatePresence>

      {/* Header */}
      <div>
        <p className="text-sm text-ink-faint">
          Track AI response quality and fix underperforming FAQs.
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <AdminStatCard
            label="Total Feedback"
            value={stats.totalFeedback}
          />
          <AdminStatCard
            label="Avg Rating (out of 100)"
            value={ratingAsScore}
            sub={`${stats.avgRatingOverall.toFixed(2)} / 5.00 stars`}
          />
          <AdminStatCard
            label="Needs Attention"
            value={stats.needsAttentionCount}
            alert={stats.needsAttentionCount > 0}
          />
          <AdminStatCard
            label="No FAQ Source"
            value={stats.withoutFaqSource}
            sub="Missing knowledge entries"
          />
        </div>
      )}

      {/* Sentiment breakdown */}
      {stats && Object.keys(stats.sentimentBreakdown).length > 0 && (
        <div className="admin-card-surface px-4 py-3">
          <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-2">Sentiment breakdown</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.sentimentBreakdown).map(([s, count]) => (
              <span
                key={s}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${SENTIMENT_COLORS[s as Sentiment] ?? 'bg-mist text-ink-soft border-border'}`}
              >
                {s} <span className="font-semibold">({count})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {(['faq', 'nosource'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-accent text-accent'
                : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            {t === 'faq' ? '📋 FAQ-Linked' : '🔍 No Source'}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 pb-1 flex-wrap">
          <select
            value={sentimentFilter}
            onChange={(e) => setSentimentFilter(e.target.value)}
            className="admin-select text-xs"
          >
            <option value="">All sentiments</option>
            <option value="positive">Positive</option>
            <option value="outdated">Outdated</option>
            <option value="unclear">Unclear</option>
            <option value="incomplete">Incomplete</option>
            <option value="wrong">Wrong</option>
            <option value="other">Other</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="admin-select text-xs"
          >
            <option value="attentionScore">Sort: Attention Score</option>
            <option value="createdAt">Sort: Newest First</option>
          </select>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-ink-faint">Rating:</span>
            <input
              type="number" min="1" max="5" step="0.5" placeholder="Min"
              value={minRating}
              onChange={(e) => setMinRating(e.target.value)}
              className="admin-input text-xs w-14 py-1"
            />
            <span className="text-[10px] text-ink-faint">–</span>
            <input
              type="number" min="1" max="5" step="0.5" placeholder="Max"
              value={maxRating}
              onChange={(e) => setMaxRating(e.target.value)}
              className="admin-input text-xs w-14 py-1"
            />
          </div>
        </div>
      </div>

      {/* Card list */}
      {loading ? (
        <TableSkeleton rows={6} />
      ) : items.length === 0 ? (
        <div className="admin-empty py-12 text-center text-ink-faint text-sm">
          No feedback in this category yet.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const isExpanded = expandedId === item._id;
            return (
              <div
                key={item._id}
                className={`admin-card-surface transition-all duration-200 ${
                  item.needsAttention ? 'border-amber/30 bg-amber/5' : ''
                }`}
              >
                {/* Row header */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : item._id)}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Colored dot system: 🔴 needsAttention, 🟡 askCount>5, 🟢 otherwise */}
                      {item.needsAttention ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-danger">
                          <span className="w-2 h-2 rounded-full bg-danger inline-block" />
                          Needs attention
                        </span>
                      ) : item.askCount > 5 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600">
                          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                          Trending
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-success">
                          <span className="w-2 h-2 rounded-full bg-success inline-block" />
                          OK
                        </span>
                      )}
                      <SentimentBadge sentiment={item.sentiment} />
                      <span className="text-[10px] text-ink-faint">
                        Asked {item.askCount}×
                      </span>
                    </div>
                    <p className="text-sm font-medium text-ink mt-1 truncate" title={item.question}>
                      {item.question}
                    </p>
                    {item.faqQuestion && (
                      <p className="text-xs text-ink-faint mt-0.5 truncate">
                        FAQ: {item.faqQuestion}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Stars value={item.avgRating} />
                    <span className="text-[10px] text-ink-faint">
                      {new Date(item.createdAt).toLocaleDateString('en-IN')}
                    </span>
                  </div>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`shrink-0 mt-1 transition-transform duration-200 text-ink-faint ${isExpanded ? 'rotate-180' : ''}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-border px-4 py-4 space-y-3">
                    <div>
                      <p className="admin-label">AI Answer</p>
                      <p className="text-xs text-ink-soft whitespace-pre-wrap bg-mist rounded-lg px-3 py-2 border border-border max-h-40 overflow-y-auto">
                        {item.aiAnswer}
                      </p>
                    </div>
                    {item.comments.length > 0 && (
                      <div>
                        <p className="admin-label">User comments ({item.comments.length})</p>
                        <ul className="space-y-1 mt-1">
                          {item.comments.filter(Boolean).map((c, i) => (
                            <li
                              key={i}
                              className="text-xs text-ink-soft bg-mist border border-border rounded-lg px-3 py-2"
                            >
                              {c}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      {tab === 'faq' && item.faqId && (
                        <button
                          onClick={() => openEditModal(item)}
                          className="admin-btn-primary text-xs px-3 py-1.5"
                        >
                          Edit FAQ
                        </button>
                      )}
                      {tab === 'nosource' && (
                        <button
                          onClick={() => openCreateModal(item)}
                          className="admin-btn-primary text-xs px-3 py-1.5"
                        >
                          Create FAQ
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="admin-pagination">
          <span>Page {page} of {pages} · {total} results</span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="admin-pagination-btn"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="admin-pagination-btn"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Edit FAQ Modal */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="Edit FAQ from Feedback">
        {editItem && (
          <div className="space-y-3">
            <div className="admin-card-surface px-3 py-2">
              <p className="admin-label">User asked</p>
              <p className="text-sm text-ink font-medium">"{editItem.question}"</p>
              <div className="mt-1.5">
                <Stars value={editItem.avgRating} />
                {editItem.comments.filter(Boolean).length > 0 && (
                  <p className="text-xs text-ink-soft mt-1 italic">
                    "{editItem.comments.filter(Boolean)[0]}"
                  </p>
                )}
              </div>
            </div>
            <div>
              <label className="admin-label">FAQ Question</label>
              <input
                type="text"
                value={editForm.question}
                onChange={(e) => setEditForm((f) => ({ ...f, question: e.target.value }))}
                className="admin-input w-full mt-1"
                placeholder="Updated question text"
              />
            </div>
            <div>
              <label className="admin-label">Answer</label>
              <textarea
                value={editForm.answer}
                onChange={(e) => setEditForm((f) => ({ ...f, answer: e.target.value }))}
                rows={5}
                className="admin-input w-full mt-1 resize-none"
                placeholder="Improved answer..."
              />
            </div>
            <div>
              <label className="admin-label">Category</label>
              <input
                type="text"
                value={editForm.category}
                onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                className="admin-input w-full mt-1"
                placeholder="e.g. Submission, Eligibility…"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button onClick={() => setEditItem(null)} className="admin-btn-ghost text-xs px-3 py-1.5">
                Cancel
              </button>
              <button
                onClick={handleEditSubmit}
                disabled={submitting}
                className="admin-btn-primary text-xs px-4 py-1.5"
              >
                {submitting ? 'Saving…' : 'Save FAQ'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create FAQ Modal (no-source tab) */}
      <Modal open={!!createItem} onClose={() => setCreateItem(null)} title="Create FAQ from Feedback">
        {createItem && (
          <div className="space-y-3">
            <div className="admin-card-surface px-3 py-2">
              <p className="admin-label">Gap identified</p>
              <p className="text-sm text-ink font-medium">"{createItem.question}"</p>
              <Stars value={createItem.avgRating} />
            </div>
            <div>
              <label className="admin-label">FAQ Question</label>
              <input
                type="text"
                value={createForm.question}
                onChange={(e) => setCreateForm((f) => ({ ...f, question: e.target.value }))}
                className="admin-input w-full mt-1"
                placeholder="Refined question for the FAQ"
              />
            </div>
            <div>
              <label className="admin-label">Answer</label>
              <textarea
                value={createForm.answer}
                onChange={(e) => setCreateForm((f) => ({ ...f, answer: e.target.value }))}
                rows={5}
                className="admin-input w-full mt-1 resize-none"
                placeholder="Official answer..."
              />
            </div>
            <div>
              <label className="admin-label">Category</label>
              <input
                type="text"
                value={createForm.category}
                onChange={(e) => setCreateForm((f) => ({ ...f, category: e.target.value }))}
                className="admin-input w-full mt-1"
                placeholder="e.g. General, Registration…"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button onClick={() => setCreateItem(null)} className="admin-btn-ghost text-xs px-3 py-1.5">
                Cancel
              </button>
              <button
                onClick={handleCreateSubmit}
                disabled={submitting}
                className="admin-btn-primary text-xs px-4 py-1.5"
              >
                {submitting ? 'Creating…' : 'Create FAQ'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
