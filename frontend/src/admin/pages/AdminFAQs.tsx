import React, { useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import FreshnessTierSelector from '../../components/ui/FreshnessTierSelector';
import adminApi from '../utils/adminApi';
import Badge from '../components/common/Badge';
import Modal from '../components/common/Modal';
import { TableSkeleton } from '../components/common/SkeletonLoader';

function useDebounce<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return v;
}

interface FAQ { _id: string; question: string; answer: string; category: string; status: 'approved' | 'pending' | 'rejected'; views: number; helpfulVotes: number; createdAt: string; freshnessTier?: 'evergreen' | 'seasonal' | 'volatile'; reviewIntervalDays?: number; reviewStatus?: 'verified' | 'pending_review' | 'update_requested'; }
interface FAQApiResponse { faqs: FAQ[]; total: number; pages: number; categories?: string[]; }
interface Toast { msg: string; type: 'success' | 'warn' | 'error'; }

function Toast({ toast }: { toast: Toast }) {
  const c = toast.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : toast.type === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700';
  return <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
    className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg text-xs font-medium border ${c}`}>{toast.msg}</motion.div>;
}

export default function AdminFAQs() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sort, setSort] = useState('-createdAt');
  const [editModal, setEditModal] = useState(false);
  const [editFaq, setEditFaq] = useState<FAQ | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [newFaq, setNewFaq] = useState<{
    question: string;
    answer: string;
    category: string;
    status: FAQ['status'];
    freshnessTier: 'evergreen' | 'seasonal' | 'volatile';
    reviewIntervalDays: number;
  }>({ question: '', answer: '', category: '', status: 'approved', freshnessTier: 'evergreen', reviewIntervalDays: 0 });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const debouncedSearch = useDebounce(search, 350);

  const showToast = (msg: string, type: Toast['type'] = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };
  const fetchFaqs = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '15', sort });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (statusFilter) params.set('status', statusFilter);
    if (categoryFilter) params.set('category', categoryFilter);
    adminApi.get<FAQApiResponse>(`/admin/faqs?${params}`)
      .then(r => { setFaqs(r.data.faqs); setTotal(r.data.total); setPages(r.data.pages); setCategories(r.data.categories || []); })
      .finally(() => setLoading(false));
  }, [page, debouncedSearch, statusFilter, categoryFilter, sort]);

  useEffect(() => { fetchFaqs(); }, [fetchFaqs]);
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, categoryFilter]);

  const handleApprove = async (id: string) => { await adminApi.post('/admin/faq/approve', { id }); showToast('Approved'); fetchFaqs(); };
  const handleReject  = async (id: string) => { await adminApi.post('/admin/faq/reject', { id }); showToast('Rejected', 'warn'); fetchFaqs(); };
  const handleDelete  = async (id: string) => { if (!confirm('Delete this FAQ?')) return; await adminApi.delete(`/admin/faq/${id}`); showToast('Deleted', 'error'); fetchFaqs(); };
  const handleEdit = async () => {
    if (!editFaq) return; setSaving(true);
    try { await adminApi.put(`/admin/faq/${editFaq._id}`, { question: editFaq.question, answer: editFaq.answer, category: editFaq.category, status: editFaq.status }); showToast('Saved'); setEditModal(false); fetchFaqs(); }
    catch { showToast('Save failed', 'error'); }
    finally { setSaving(false); }
  };
  const handleAdd = async () => {
    setSaving(true);
    try { await adminApi.post('/admin/faq', { question: newFaq.question, answer: newFaq.answer, category: newFaq.category, status: newFaq.status, freshnessTier: newFaq.freshnessTier, reviewIntervalDays: newFaq.reviewIntervalDays }); showToast('Created'); setAddModal(false); setNewFaq({ question: '', answer: '', category: '', status: 'approved' as const, freshnessTier: 'evergreen' as const, reviewIntervalDays: 0 }); fetchFaqs(); }
    catch { showToast('Create failed', 'error'); }
    finally { setSaving(false); }
  };

  const th = 'px-3 py-2.5 text-left text-[10px] font-semibold text-admin-muted uppercase tracking-wide';
  const td = 'px-3 py-3 text-sm text-admin-text';

  return (
    <div className="space-y-4 max-w-6xl">
      <AnimatePresence>{toast && <Toast toast={toast} />}</AnimatePresence>

      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-semibold text-admin-text">FAQs</h2><p className="text-sm text-admin-muted mt-0.5">{total} total</p></div>
        <button onClick={() => setAddModal(true)} className="px-4 py-2 rounded-md text-sm font-medium text-white bg-admin-bg hover:bg-admin-surface transition-colors">+ Add FAQ</button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-admin-muted" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-md text-sm text-admin-text placeholder-admin-muted bg-admin-card border border-white/5 outline-none focus:border-admin-purple/50 transition-colors" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-2.5 py-1.5 rounded-md text-sm text-admin-text bg-admin-card border border-white/5 outline-none focus:border-admin-purple/50">
          <option value="">All Status</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
        </select>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="px-2.5 py-1.5 rounded-md text-sm text-admin-text bg-admin-card border border-white/5 outline-none focus:border-admin-purple/50">
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-admin-card border border-white/5 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="bg-admin-bg border-b border-white/5">
              <th className={th}>Question</th><th className={th}>Category</th><th className={th}>Status</th>
              <th className={`${th} text-right`}>Views</th><th className={`${th} text-right`}>Votes</th><th className={th}>Date</th>
              <th className={`${th} text-right`}>Actions</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={7} className="px-3 py-6"><TableSkeleton rows={8} /></td></tr> :
               faqs.length === 0 ? <tr><td colSpan={7} className="px-3 py-12 text-center text-sm text-admin-muted">No FAQs found</td></tr> :
               faqs.map(faq => (
                <tr key={faq._id} className="border-b border-white/5 last:border-0 hover:bg-admin-bg transition-colors">
                  <td className={`${td} max-w-[220px] truncate`} title={faq.question}>{faq.question}</td>
                  <td className={`${td} text-admin-muted`}>{faq.category}</td>
                  <td className={td}><Badge status={faq.status as 'approved'|'pending'|'rejected'} /></td>
                  <td className={`${td} text-right tabular-nums text-admin-muted`}>{faq.views ?? 0}</td>
                  <td className={`${td} text-right tabular-nums text-admin-muted`}>{faq.helpfulVotes ?? 0}</td>
                  <td className={`${td} text-admin-muted`}>{new Date(faq.createdAt).toLocaleDateString('en-IN')}</td>
                  <td className={`${td} text-right`}>
                    <div className="flex items-center justify-end gap-1">
                      {faq.status !== 'approved' && <button onClick={() => handleApprove(faq._id)} className="w-6 h-6 flex items-center justify-center rounded text-admin-muted hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="Approve"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg></button>}
                      {faq.status !== 'rejected' && <button onClick={() => handleReject(faq._id)} className="w-6 h-6 flex items-center justify-center rounded text-admin-muted hover:text-amber-600 hover:bg-amber-50 transition-colors" title="Reject"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
                      <button onClick={() => { setEditFaq({ ...faq, freshnessTier: (faq as any).freshnessTier ?? 'evergreen', reviewIntervalDays: (faq as any).reviewIntervalDays ?? 0 }); setEditModal(true); }} className="w-6 h-6 flex items-center justify-center rounded text-admin-muted hover:text-admin-text hover:bg-admin-surface transition-colors" title="Edit"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                      <button onClick={() => handleDelete(faq._id)} className="w-6 h-6 flex items-center justify-center rounded text-admin-muted hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5 text-sm text-admin-muted">
            <span>Page {page} of {pages} · {total} results</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded-md hover:bg-admin-surface disabled:opacity-30 transition-colors">← Prev</button>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="px-3 py-1 rounded-md hover:bg-admin-surface disabled:opacity-30 transition-colors">Next →</button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="Edit FAQ">
        {editFaq && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-admin-text mb-1">Question</label>
              <input value={editFaq.question} onChange={e => setEditFaq(f => f ? { ...f, question: e.target.value } : null)}
                className="w-full px-3 py-2 rounded-md text-sm text-admin-text bg-admin-bg border border-white/5 outline-none focus:border-admin-purple/50" />
            </div>
            <div>
              <label className="block text-xs font-medium text-admin-text mb-1">Answer</label>
              <textarea rows={4} value={editFaq.answer} onChange={e => setEditFaq(f => f ? { ...f, answer: e.target.value } : null)}
                className="w-full px-3 py-2 rounded-md text-sm text-admin-text bg-admin-bg border border-white/5 outline-none focus:border-admin-purple/50 resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-admin-text mb-1">Category</label>
                <input value={editFaq.category} onChange={e => setEditFaq(f => f ? { ...f, category: e.target.value } : null)}
                  className="w-full px-3 py-2 rounded-md text-sm text-admin-text bg-admin-bg border border-white/5 outline-none focus:border-admin-purple/50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-admin-text mb-1">Status</label>
                <select value={editFaq.status} onChange={e => setEditFaq(f => f ? { ...f, status: e.target.value as FAQ['status'] } : null)}
                  className="w-full px-3 py-2 rounded-md text-sm text-admin-text bg-admin-bg border border-white/5 outline-none focus:border-admin-purple/50">
                  <option value="approved">Approved</option><option value="pending">Pending</option><option value="rejected">Rejected</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-admin-text mb-1.5">Freshness Tier</label>
              <FreshnessTierSelector
                value={editFaq.freshnessTier ?? 'evergreen'}
                onChange={t => setEditFaq(f => f ? { ...f, freshnessTier: t, reviewIntervalDays: t === 'evergreen' ? 0 : f.reviewIntervalDays || (t === 'seasonal' ? 15 : 4) } : null)}
                reviewIntervalDays={editFaq.reviewIntervalDays ?? 0}
                onIntervalChange={d => setEditFaq(f => f ? { ...f, reviewIntervalDays: d } : null)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditModal(false)} className="px-4 py-2 rounded-md text-sm text-admin-muted hover:text-admin-text hover:bg-admin-surface transition-colors">Cancel</button>
              <button onClick={handleEdit} disabled={saving} className="px-4 py-2 rounded-md text-sm font-medium text-white bg-admin-bg hover:bg-admin-surface disabled:opacity-40 transition-colors">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Modal */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add FAQ">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-admin-text mb-1">Question</label>
            <input value={newFaq.question} onChange={e => setNewFaq(f => ({ ...f, question: e.target.value }))} placeholder="Enter the question…"
              className="w-full px-3 py-2 rounded-md text-sm text-admin-text placeholder-admin-muted bg-admin-bg border border-white/5 outline-none focus:border-admin-purple/50" />
          </div>
          <div>
            <label className="block text-xs font-medium text-admin-text mb-1">Answer</label>
            <textarea rows={4} value={newFaq.answer} onChange={e => setNewFaq(f => ({ ...f, answer: e.target.value }))} placeholder="Enter the answer…"
              className="w-full px-3 py-2 rounded-md text-sm text-admin-text placeholder-admin-muted bg-admin-bg border border-white/5 outline-none focus:border-admin-purple/50 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-admin-text mb-1">Category</label>
              <input value={newFaq.category} onChange={e => setNewFaq(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Technical"
                className="w-full px-3 py-2 rounded-md text-sm text-admin-text placeholder-admin-muted bg-admin-bg border border-white/5 outline-none focus:border-admin-purple/50" />
            </div>
            <div>
              <label className="block text-xs font-medium text-admin-text mb-1">Status</label>
              <select value={newFaq.status} onChange={e => setNewFaq(f => ({ ...f, status: e.target.value as typeof newFaq.status }))}
                className="w-full px-3 py-2 rounded-md text-sm text-admin-text bg-admin-bg border border-white/5 outline-none focus:border-admin-purple/50">
                <option value="approved">Approved</option><option value="pending">Pending</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-admin-text mb-1.5">Freshness Tier</label>
            <FreshnessTierSelector
              value={newFaq.freshnessTier}
              onChange={t => setNewFaq(f => ({ ...f, freshnessTier: t, reviewIntervalDays: t === 'evergreen' ? 0 : f.reviewIntervalDays || (t === 'seasonal' ? 15 : 4) }))}
              reviewIntervalDays={newFaq.reviewIntervalDays}
              onIntervalChange={d => setNewFaq(f => ({ ...f, reviewIntervalDays: d }))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setAddModal(false)} className="px-4 py-2 rounded-md text-sm text-admin-muted hover:text-admin-text hover:bg-admin-surface transition-colors">Cancel</button>
            <button onClick={handleAdd} disabled={saving || !newFaq.question || !newFaq.answer || !newFaq.category}
              className="px-4 py-2 rounded-md text-sm font-medium text-white bg-admin-bg hover:bg-admin-surface disabled:opacity-40 transition-colors">{saving ? 'Creating…' : 'Create FAQ'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
