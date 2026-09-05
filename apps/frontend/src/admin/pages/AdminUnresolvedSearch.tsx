import { useEffect, useState, useCallback } from 'react'
import { adminBtnGhost, adminBtnPrimary, adminInput, adminLabel, adminSearchInput, adminSelect, adminTextarea } from '../../styles/style_config';
import { AnimatePresence, motion } from 'framer-motion';
import adminApi from '../utils/adminApi';
import Badge from '../components/common/Badge';
import Modal from '../components/common/Modal';
import { TableSkeleton } from '../components/common/SkeletonLoader';
import { useDebounce } from '../../hooks/useDebounce';

interface UnresolvedItem {
  _id: string;
  query: string;
  faqId: { _id: string; question: string; category: string } | null;
  userId: { _id: string; name: string; email: string } | null;
  feedback: string;
  status: 'pending' | 'addressed';
  resolution: 'faq_updated' | 'community_post_created' | 'dismissed' | null;
  resolvedBy: { name: string } | null;
  createdAt: string;
}

interface UnresolvedResponse {
  items: UnresolvedItem[];
  total: number;
  page: number;
  pages: number;
}

interface TopQuery {
  _id: string;
  count: number;
}

interface StatsResponse {
  pending: number;
  total: number;
  addressed: number;
  topQueries: TopQuery[];
}

interface Toast { msg: string; type: 'success' | 'warn' | 'error'; }

interface AdminBatch { _id: string; name: string; isActive: boolean; }

function Toast({ toast }: { toast: Toast }) {
  const c = toast.type === 'error' ? 'admin-toast-error' : toast.type === 'warn' ? 'admin-toast-warn' : 'admin-toast-success';
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg text-xs font-medium border ${c}`}
    >
      {toast.msg}
    </motion.div>
  );
}

export default function AdminUnresolvedSearch() {
  const [items, setItems] = useState<UnresolvedItem[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'pending' | 'addressed' | ''>('');
  const [toast, setToast] = useState<Toast | null>(null);
  const [viewItem, setViewItem] = useState<UnresolvedItem | null>(null);
  const [resolving, setResolving] = useState(false);
  const [selectedForResolve, setSelectedForResolve] = useState<UnresolvedItem | null>(null);
  const debouncedSearch = useDebounce(search, 350);

  // "Create FAQ from this" form state
  const [showCreateFaq, setShowCreateFaq] = useState(false);
  const [faqAnswer, setFaqAnswer] = useState('');
  const [faqCategory, setFaqCategory] = useState('');
  const [faqBatchId, setFaqBatchId] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [batches, setBatches] = useState<AdminBatch[]>([]);
  const [creatingFaq, setCreatingFaq] = useState(false);

  const showToast = (msg: string, type: Toast['type'] = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchItems = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '15' });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (statusFilter) params.set('status', statusFilter);
    adminApi.get<UnresolvedResponse>(`/search/unresolved-list?${params}`)
      .then(r => { setItems(r.data.items); setTotal(r.data.total); setPages(r.data.pages); })
      .catch(() => showToast('Failed to load', 'error'))
      .finally(() => setLoading(false));
  }, [page, debouncedSearch, statusFilter]);

  const fetchStats = useCallback(() => {
    adminApi.get<StatsResponse>('/search/unresolved-stats')
      .then(r => setStats(r.data))
      .catch(() => {});
  }, []);

  const loadCategories = useCallback(() => {
    adminApi.get<string[]>('/faq/categories')
      .then(r => setCategories(r.data))
      .catch(() => {});
  }, []);

  const loadBatches = useCallback(() => {
    adminApi.get<{ batches: AdminBatch[] }>('/batches/admin/all')
      .then(r => {
        const active = (r.data.batches ?? []).filter(b => b.isActive);
        setBatches(active);
        if (active.length === 1 && !faqBatchId) {
          setFaqBatchId(active[0]._id);
        }
      })
      .catch(() => {});
  }, [faqBatchId]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter]);

  const handleResolve = async (resolution: UnresolvedItem['resolution'], faqId?: string) => {
    if (!selectedForResolve) return;
    setResolving(true);
    try {
      const body: Record<string, unknown> = { resolution };
      if (faqId) body.faqId = faqId;
      await adminApi.patch(`/search/unresolved/${selectedForResolve._id}/resolve`, body);
      showToast('Marked as ' + (resolution === 'faq_updated' ? 'FAQ updated' : resolution === 'community_post_created' ? 'Community post created' : 'Dismissed'), 'success');
      setSelectedForResolve(null);
      resetCreateFaqForm();
      fetchItems();
      fetchStats();
    } catch {
      showToast('Failed to resolve', 'error');
    } finally {
      setResolving(false);
    }
  };

  const resetCreateFaqForm = () => {
    setShowCreateFaq(false);
    setFaqAnswer('');
    setFaqCategory('');
    setCreatingFaq(false);
  };

  const handleOpenCreateFaq = () => {
    setShowCreateFaq(true);
    loadCategories();
    loadBatches();
  };

  const handleCreateFaqAndResolve = async () => {
    if (!selectedForResolve || !faqAnswer.trim() || !faqCategory.trim() || !faqBatchId) return;
    setCreatingFaq(true);
    try {
      // Step 1: Create the FAQ
      const res = await adminApi.post<{ faq: { _id: string } }>('/admin/faq', {
        question: selectedForResolve.query,
        answer: faqAnswer.trim(),
        category: faqCategory.trim(),
        batchId: faqBatchId,
      });
      const newFaqId = res.data.faq._id;

      // Step 2: Resolve the unresolved entry with linked FAQ
      await handleResolve('faq_updated', newFaqId);
      showToast('FAQ created and feedback resolved');
    } catch {
      showToast('Failed to create FAQ', 'error');
    } finally {
      setCreatingFaq(false);
    }
  };

  const spamPatterns = ['test', 'vaibhav', 'nigga', 'awdawd', 'one two ka four', 'hehehe', ',epw'];
  const handleBulkDeleteSpam = async () => {
    if (!window.confirm(`Delete all unresolved entries matching spam patterns?\n\nThis will remove entries with queries containing: ${spamPatterns.join(', ')}\n\nThis action cannot be undone.`)) return;
    setResolving(true);
    try {
      const results = await Promise.allSettled(
        spamPatterns.map((p: string) => adminApi.post('/search/unresolved/bulk-delete', { queryPattern: p }))
      );
      const succeeded = results.filter((r: PromiseSettledResult<unknown>) => r.status === 'fulfilled').length;
      const failed = results.filter((r: PromiseSettledResult<unknown>) => r.status === 'rejected').length;
      showToast(`Deleted spam entries (${succeeded}/${spamPatterns.length} patterns applied${failed ? `, ${failed} failed` : ''})`, succeeded > 0 ? 'success' : 'warn');
      fetchItems();
      fetchStats();
    } catch {
      showToast('Bulk delete failed', 'error');
    }
  };

  return (
    <div className="space-y-4 max-w-6xl">
      <AnimatePresence>{toast && <Toast toast={toast} />}</AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-faint">Searches that returned no matching FAQ</p>
        <button
          onClick={handleBulkDeleteSpam}
          className="px-3 py-1.5 rounded-md text-xs font-medium bg-danger/10 border border-danger/20 text-danger hover:bg-danger/20 transition-colors"
        >
          Delete spam entries
        </button>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="admin-stat-mini px-4 py-3">
            <p className="text-xs text-ink-faint">Pending review</p>
            <p className="text-2xl font-semibold text-ink mt-1">{stats.pending}</p>
          </div>
          <div className="admin-stat-mini px-4 py-3">
            <p className="text-xs text-ink-faint">Total submitted</p>
            <p className="text-2xl font-semibold text-ink mt-1">{stats.total}</p>
          </div>
          <div className="admin-stat-mini px-4 py-3">
            <p className="text-xs text-ink-faint">Addressed</p>
            <p className="text-2xl font-semibold text-ink mt-1">{stats.addressed}</p>
          </div>
        </div>
      )}

      {/* Top problematic queries */}
      {stats && stats.topQueries.length > 0 && (
        <div className="admin-card-surface px-4 py-3">
          <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-2">Most complained-about queries</p>
          <div className="flex flex-wrap gap-2">
            {stats.topQueries.map(q => (
              <span key={q._id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-danger/10 border border-danger/20 text-xs text-danger">
                {q._id} <span className="font-semibold">({q.count})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" placeholder="Search queries…" value={search} onChange={e => setSearch(e.target.value)}
            className={`${adminSearchInput}`} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as '' | 'pending' | 'addressed')}
          className={`${adminSelect}`}>
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="addressed">Addressed</option>
        </select>
      </div>

      {/* Table */}
      <div className="admin-table-wrap">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="admin-thead-row">
                <th className="admin-th">Query</th>
                <th className="admin-th">FAQ Shown</th>
                <th className="admin-th">User</th>
                <th className="admin-th">Feedback</th>
                <th className="admin-th">Status</th>
                <th className="admin-th">Date</th>
                <th className="admin-th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-3 py-6"><TableSkeleton rows={8} /></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="admin-empty">No feedback found</td></tr>
              ) : items.map(item => (
                <tr key={item._id} className="admin-tr">
                  <td className="admin-td max-w-[160px] truncate" title={item.query}>{item.query}</td>
                  <td className="admin-td max-w-[140px] truncate">
                    {item.faqId ? (
                      <button className="text-accent hover:text-accent/70 text-left truncate block text-xs"
                        onClick={() => setViewItem(item)}
                        title={item.faqId.question}>
                        {item.faqId.question}
                      </button>
                    ) : <span className="text-ink-faint text-xs">—</span>}
                  </td>
                  <td className="admin-td text-ink-faint text-xs">{item.userId?.name ?? 'Anonymous'}</td>
                  <td className="admin-td max-w-[180px] truncate text-xs text-ink-soft" title={item.feedback}>{item.feedback}</td>
                  <td className="admin-td">
                    <Badge
                      status={item.status === 'pending' ? 'pending' : 'approved'}
                      label={item.status === 'pending' ? 'Pending' : 'Addressed'}
                      showDot={false}
                    />
                  </td>
                  <td className="admin-td text-ink-faint text-xs">{new Date(item.createdAt).toLocaleDateString('en-IN')}</td>
                  <td className="admin-td text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setViewItem(item)}
                        className="w-6 h-6 flex items-center justify-center rounded text-ink-faint hover:text-ink hover:bg-mist transition-colors"
                        title="View">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                        </svg>
                      </button>
                      {item.status === 'pending' && (
                        <button onClick={() => setSelectedForResolve(item)}
                          className="w-6 h-6 flex items-center justify-center rounded text-ink-faint hover:text-accent hover:bg-accent/10 transition-colors"
                          title="Resolve">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="admin-pagination">
            <span>Page {page} of {pages} · {total} results</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="admin-pagination-btn">← Prev</button>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="admin-pagination-btn">Next →</button>
            </div>
          </div>
        )}
      </div>

      {/* Detail modal */}
      <Modal open={!!viewItem} onClose={() => setViewItem(null)} title="Feedback Detail">
        {viewItem && (
          <div className="space-y-3">
            <div>
              <p className={`${adminLabel}`}>Query</p>
              <p className="text-sm text-ink font-medium">"{viewItem.query}"</p>
            </div>
            {viewItem.faqId && (
              <div>
                <p className={`${adminLabel}`}>FAQ Shown</p>
                <p className="text-sm text-ink">{viewItem.faqId.question}</p>
                <p className="text-xs text-ink-faint mt-0.5">{viewItem.faqId.category}</p>
              </div>
            )}
            <div>
              <p className={`${adminLabel}`}>User</p>
              <p className="text-sm text-ink-soft">{viewItem.userId?.name ?? 'Anonymous'} ({viewItem.userId?.email ?? '—'})</p>
            </div>
            <div>
              <p className={`${adminLabel}`}>Feedback</p>
              <p className="text-sm text-ink whitespace-pre-wrap bg-mist rounded-lg px-3 py-2 border border-border">{viewItem.feedback}</p>
            </div>
            <div>
              <p className={`${adminLabel}`}>Status</p>
              <Badge status={viewItem.status === 'pending' ? 'pending' : 'approved'} label={viewItem.status === 'pending' ? 'Pending' : 'Addressed'} showDot={false} />
              {viewItem.resolution && (
                <p className="text-xs text-ink-faint mt-1">Resolution: {viewItem.resolution.replace('_', ' ')}</p>
              )}
            </div>
            <div className="flex justify-end pt-2 border-t border-border">
              <button onClick={() => setViewItem(null)} className={`${adminBtnGhost} text-xs px-3 py-1.5`}>Close</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Resolve modal */}
      <Modal open={!!selectedForResolve} onClose={() => { setSelectedForResolve(null); resetCreateFaqForm(); }} title="Resolve Feedback">
        {selectedForResolve && (
          <div className="space-y-3">
            <div>
              <p className={`${adminLabel}`}>Query</p>
              <p className="text-sm text-ink font-medium">"{selectedForResolve.query}"</p>
            </div>
            <div>
              <p className={`${adminLabel}`}>User feedback</p>
              <p className="text-sm text-ink whitespace-pre-wrap bg-mist rounded-lg px-3 py-2 border border-border">{selectedForResolve.feedback}</p>
            </div>
            <div className="border-t border-border pt-3">
              <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-2">Mark as</p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => handleResolve('faq_updated')}
                  disabled={resolving}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-border hover:bg-mist hover:border-border-medium transition-colors disabled:opacity-50">
                  <span className="text-sm font-medium text-ink">FAQ Updated</span>
                  <span className="text-xs text-ink-faint block mt-0.5">I updated the existing FAQ to address this query</span>
                </button>
                <button
                  onClick={handleOpenCreateFaq}
                  disabled={resolving || showCreateFaq}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-accent/30 bg-accent/5 hover:bg-accent/10 hover:border-accent/50 transition-colors disabled:opacity-50">
                  <span className="text-sm font-medium text-accent">Create FAQ from this</span>
                  <span className="text-xs text-ink-faint block mt-0.5">Create a new FAQ using this query as the question</span>
                </button>
                <button
                  onClick={() => handleResolve('community_post_created')}
                  disabled={resolving}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-border hover:bg-mist hover:border-border-medium transition-colors disabled:opacity-50">
                  <span className="text-sm font-medium text-ink">Community Post Created</span>
                  <span className="text-xs text-ink-faint block mt-0.5">Created a community Q&A to address this question</span>
                </button>
                <button
                  onClick={() => handleResolve('dismissed')}
                  disabled={resolving}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-border hover:bg-mist transition-colors disabled:opacity-50">
                  <span className="text-sm font-medium text-ink-soft">Dismissed</span>
                  <span className="text-xs text-ink-faint block mt-0.5">Not actionable — ignore this entry</span>
                </button>
              </div>
            </div>

            {/* Inline "Create FAQ from this" form */}
            {showCreateFaq && (
              <div className="border-t border-border pt-3 space-y-3">
                <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide">New FAQ</p>
                <div>
                  <label className={`${adminLabel}`}>Question</label>
                  <input
                    type="text"
                    value={selectedForResolve.query}
                    readOnly
                    className={`${adminInput} w-full bg-mist cursor-not-allowed`}
                  />
                </div>
                <div>
                  <label className={`${adminLabel}`}>Answer <span className="text-danger">*</span></label>
                  <textarea
                    value={faqAnswer}
                    onChange={e => setFaqAnswer(e.target.value)}
                    rows={4}
                    placeholder="Write the answer to this question…"
                    className={`${adminTextarea} w-full`}
                  />
                </div>
                <div>
                  <label className={`${adminLabel}`}>Category <span className="text-danger">*</span></label>
                  <select
                    value={faqCategory}
                    onChange={e => setFaqCategory(e.target.value)}
                    className={`${adminSelect} w-full`}
                  >
                    <option value="">Select category…</option>
                    {categories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`${adminLabel}`}>Program <span className="text-danger">*</span></label>
                  <select
                    value={faqBatchId}
                    onChange={e => setFaqBatchId(e.target.value)}
                    className={`${adminSelect} w-full`}
                  >
                    <option value="">Select program…</option>
                    {batches.map(b => (
                      <option key={b._id} value={b._id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleCreateFaqAndResolve}
                    disabled={creatingFaq || !faqAnswer.trim() || !faqCategory || !faqBatchId}
                    className={`${adminBtnPrimary} text-xs px-4 py-2`}
                  >
                    {creatingFaq ? 'Creating…' : 'Create FAQ & Resolve'}
                  </button>
                  <button
                    onClick={resetCreateFaqForm}
                    className={`${adminBtnGhost} text-xs px-3 py-1.5`}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button onClick={() => { setSelectedForResolve(null); resetCreateFaqForm(); }} className={`${adminBtnGhost} text-xs px-3 py-1.5`}>Cancel</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
