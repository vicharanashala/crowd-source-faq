import React, { useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import adminApi from '../utils/adminApi';
import Badge from '../components/common/Badge';
import Modal from '../components/common/Modal';
import { TableSkeleton } from '../components/common/SkeletonLoader';

function useDebounce<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

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

function Toast({ toast }: { toast: Toast }) {
  const c = toast.type === 'error' ? 'bg-red-50 border-red-200 text-red-700'
    : toast.type === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-700'
    : 'bg-emerald-50 border-emerald-200 text-emerald-700';
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
  const showToast = (msg: string, type: Toast['type'] = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchItems = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '15' });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (statusFilter) params.set('status', statusFilter);
    adminApi.get<UnresolvedResponse>(`/admin/search/unresolved-list?${params}`)
      .then(r => { setItems(r.data.items); setTotal(r.data.total); setPages(r.data.pages); })
      .catch(() => showToast('Failed to load', 'error'))
      .finally(() => setLoading(false));
  }, [page, debouncedSearch, statusFilter]);

  const fetchStats = useCallback(() => {
    adminApi.get<StatsResponse>('/admin/search/unresolved-stats')
      .then(r => setStats(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter]);

  const handleResolve = async (resolution: UnresolvedItem['resolution']) => {
    if (!selectedForResolve) return;
    setResolving(true);
    try {
      await adminApi.patch(`/admin/search/unresolved/${selectedForResolve._id}/resolve`, { resolution });
      showToast('Marked as ' + (resolution === 'faq_updated' ? 'FAQ updated' : resolution === 'community_post_created' ? 'Community post created' : 'Dismissed'), 'success');
      setSelectedForResolve(null);
      fetchItems();
      fetchStats();
    } catch {
      showToast('Failed to resolve', 'error');
    } finally {
      setResolving(false);
    }
  };

  // Bulk delete spam patterns
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

  const th = 'px-3 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide';
  const td = 'px-3 py-3 text-sm text-gray-800';

  return (
    <div className="space-y-4 max-w-6xl">
      <AnimatePresence>{toast && <Toast toast={toast} />}</AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Unresolved Search Feedback</h2>
          <p className="text-sm text-gray-500 mt-0.5">Queries where FAQ results didn't answer the user's question</p>
        </div>
        <button
          onClick={handleBulkDeleteSpam}
          className="px-3 py-1.5 rounded-md text-xs font-medium bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 hover:border-red-300 transition-colors"
        >
          Delete spam entries
        </button>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            <p className="text-xs text-gray-500">Pending review</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">{stats.pending}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            <p className="text-xs text-gray-500">Total submitted</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">{stats.total}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            <p className="text-xs text-gray-500">Addressed</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">{stats.addressed}</p>
          </div>
        </div>
      )}

      {/* Top problematic queries */}
      {stats && stats.topQueries.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Most complained-about queries</p>
          <div className="flex flex-wrap gap-2">
            {stats.topQueries.map(q => (
              <span key={q._id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 border border-red-100 text-xs text-red-700">
                {q._id} <span className="font-semibold">({q.count})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" placeholder="Search queries…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-md text-sm text-gray-800 placeholder-gray-400 bg-white border border-gray-200 outline-none focus:border-gray-400 transition-colors" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as '' | 'pending' | 'addressed')}
          className="px-2.5 py-1.5 rounded-md text-sm text-gray-700 bg-white border border-gray-200 outline-none focus:border-gray-400">
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="addressed">Addressed</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className={th}>Query</th>
                <th className={th}>FAQ Shown</th>
                <th className={th}>User</th>
                <th className={th}>Feedback</th>
                <th className={th}>Status</th>
                <th className={th}>Date</th>
                <th className={`${th} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-3 py-6"><TableSkeleton rows={8} /></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-gray-400">No feedback found</td></tr>
              ) : items.map(item => (
                <tr key={item._id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                  <td className={`${td} max-w-[160px] truncate`} title={item.query}>{item.query}</td>
                  <td className={`${td} max-w-[140px] truncate`}>
                    {item.faqId ? (
                      <button className="text-accent hover:text-accent/70 text-left truncate block text-xs"
                        onClick={() => setViewItem(item)}
                        title={item.faqId.question}>
                        {item.faqId.question}
                      </button>
                    ) : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                  <td className={`${td} text-gray-500 text-xs`}>{item.userId?.name ?? 'Anonymous'}</td>
                  <td className={`${td} max-w-[180px] truncate text-xs`} title={item.feedback}>{item.feedback}</td>
                  <td className={td}>
                    <Badge
                      status={item.status === 'pending' ? 'pending' : 'approved'}
                      label={item.status === 'pending' ? 'Pending' : 'Addressed'}
                      showDot={false}
                    />
                  </td>
                  <td className={`${td} text-gray-500 text-xs`}>{new Date(item.createdAt).toLocaleDateString('en-IN')}</td>
                  <td className={`${td} text-right`}>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setViewItem(item)}
                        className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-800 hover:bg-gray-100 transition-colors"
                        title="View">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                        </svg>
                      </button>
                      {item.status === 'pending' && (
                        <button onClick={() => setSelectedForResolve(item)}
                          className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-accent hover:bg-accent-light transition-colors"
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
            <span>Page {page} of {pages} · {total} results</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1 rounded-md hover:bg-gray-100 disabled:opacity-30 transition-colors">← Prev</button>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
                className="px-3 py-1 rounded-md hover:bg-gray-100 disabled:opacity-30 transition-colors">Next →</button>
            </div>
          </div>
        )}
      </div>

      {/* Detail modal */}
      <Modal open={!!viewItem} onClose={() => setViewItem(null)} title="Feedback Detail">
        {viewItem && (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Query</p>
              <p className="text-sm text-gray-900 font-medium">"{viewItem.query}"</p>
            </div>
            {viewItem.faqId && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">FAQ Shown</p>
                <p className="text-sm text-gray-800">{viewItem.faqId.question}</p>
                <p className="text-xs text-gray-400 mt-0.5">{viewItem.faqId.category}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">User</p>
              <p className="text-sm text-gray-700">{viewItem.userId?.name ?? 'Anonymous'} ({viewItem.userId?.email ?? '—'})</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Feedback</p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">{viewItem.feedback}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Status</p>
              <Badge status={viewItem.status === 'pending' ? 'pending' : 'approved'} label={viewItem.status === 'pending' ? 'Pending' : 'Addressed'} showDot={false} />
              {viewItem.resolution && (
                <p className="text-xs text-gray-400 mt-1">Resolution: {viewItem.resolution.replace('_', ' ')}</p>
              )}
            </div>
            <div className="flex justify-end pt-2 border-t border-gray-100">
              <button onClick={() => setViewItem(null)} className="px-3 py-1.5 rounded-md text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors">Close</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Resolve modal */}
      <Modal open={!!selectedForResolve} onClose={() => setSelectedForResolve(null)} title="Resolve Feedback">
        {selectedForResolve && (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Query</p>
              <p className="text-sm text-gray-900 font-medium">"{selectedForResolve.query}"</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">User feedback</p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">{selectedForResolve.feedback}</p>
            </div>
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Mark as</p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => handleResolve('faq_updated')}
                  disabled={resolving}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:bg-accent-light hover:border-accent/40 transition-colors disabled:opacity-50">
                  <span className="text-sm font-medium text-gray-900">FAQ Updated</span>
                  <span className="text-xs text-gray-500 block mt-0.5">I updated the existing FAQ to address this query</span>
                </button>
                <button
                  onClick={() => handleResolve('community_post_created')}
                  disabled={resolving}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:bg-accent-light hover:border-accent/40 transition-colors disabled:opacity-50">
                  <span className="text-sm font-medium text-gray-900">Community Post Created</span>
                  <span className="text-xs text-gray-500 block mt-0.5">Created a community Q&A to address this question</span>
                </button>
                <button
                  onClick={() => handleResolve('dismissed')}
                  disabled={resolving}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50">
                  <span className="text-sm font-medium text-gray-700">Dismissed</span>
                  <span className="text-xs text-gray-400 block mt-0.5">Not actionable — ignore this entry</span>
                </button>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={() => setSelectedForResolve(null)} className="px-3 py-1.5 rounded-md text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors">Cancel</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
