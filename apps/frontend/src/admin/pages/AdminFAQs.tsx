import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import FreshnessTierSelector from '../../components/faq/FreshnessTierSelector';
import adminApi from '../utils/adminApi';
import Badge from '../components/common/Badge';
import Modal from '../components/common/Modal';
import { TableSkeleton } from '../components/common/SkeletonLoader';
import { useDebounce } from '../../hooks/useDebounce';


interface FAQ {
  _id: string;
  question: string;
  answer: string;
  category: string;
  batchId?: string | null;
  status: 'approved' | 'pending' | 'rejected';
  views: number;
  helpfulVotes: number;
  createdAt: string;
  freshnessTier?: 'evergreen' | 'seasonal' | 'volatile';
  reviewIntervalDays?: number;
  reviewStatus?: 'verified' | 'pending_review' | 'update_requested';
}
interface FAQApiResponse { faqs: FAQ[]; total: number; pages: number; categories?: string[]; }
interface AdminBatch { _id: string; name: string; isActive: boolean; faqCount: number; approvedCount?: number; }
interface Toast { msg: string; type: 'success' | 'warn' | 'error'; }

function Toast({ toast }: { toast: Toast }) {
  const c = toast.type === 'error' ? 'admin-toast-error' : toast.type === 'warn' ? 'admin-toast-warn' : 'admin-toast-success';
  return <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
    className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg text-xs font-medium border ${c}`}>{toast.msg}</motion.div>;
}

/** Map a batch's ObjectId to a short name (for the table column). */
function useBatchMap(batches: AdminBatch[]): Map<string, string> {
  return React.useMemo(() => {
    const m = new Map<string, string>();
    for (const b of batches) m.set(b._id, b.name);
    return m;
  }, [batches]);
}

function CategoryDropdown({
  value,
  categories,
  onChange,
  placeholder = 'Select a category'
}: {
  value: string;
  categories: string[];
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const uniqueCategories = categories.filter(Boolean);

  const displayLabel = value === '__other__'
    ? 'Other (Enter custom name)...'
    : (value || placeholder);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-3 py-2 rounded-md text-sm text-ink bg-bg-secondary border border-border outline-none focus:border-accent transition-colors text-left"
      >
        <span className={value ? 'text-ink' : 'text-ink-faint'}>{displayLabel}</span>
        <svg className={`w-4 h-4 text-ink-faint transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-bg-secondary shadow-lg z-50 py-1">
          <button
            type="button"
            onClick={() => {
              onChange('');
              setIsOpen(false);
            }}
            className="w-full text-left px-3 py-2 text-sm hover:bg-mist text-ink transition-colors font-medium border-b border-border/50 text-ink-faint"
          >
            — Clear Category —
          </button>
          {uniqueCategories.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => {
                onChange(cat);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-mist transition-colors ${value === cat ? 'bg-mist font-medium text-accent' : 'text-ink'}`}
            >
              {cat}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              onChange('__other__');
              setIsOpen(false);
            }}
            className={`w-full text-left px-3 py-2 text-sm hover:bg-mist transition-colors border-t border-border/50 ${value === '__other__' ? 'bg-mist font-medium text-accent' : 'text-ink'}`}
          >
            Other (Enter custom name)...
          </button>
        </div>
      )}
    </div>
  );
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
  const [batchFilter, setBatchFilter] = useState('');
  const [sort] = useState('-createdAt');
  const [editModal, setEditModal] = useState(false);
  const [editFaq, setEditFaq] = useState<FAQ | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [newFaq, setNewFaq] = useState<{
    question: string;
    answer: string;
    category: string;
    batchId: string;
    status: FAQ['status'];
    freshnessTier: 'evergreen' | 'seasonal' | 'volatile';
    reviewIntervalDays: number;
  }>({ question: '', answer: '', category: '', batchId: '', status: 'approved', freshnessTier: 'evergreen', reviewIntervalDays: 0 });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [addCategoryOption, setAddCategoryOption] = useState<string>('');
  const [editCategoryOption, setEditCategoryOption] = useState<string>('');
  const debouncedSearch = useDebounce(search, 350);

  // Batches for the selectors and list filter
  const [batches, setBatches] = useState<AdminBatch[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const batchMap = useBatchMap(batches);

  // M30 — toast timer pattern. Stored in a ref so it clears on unmount
  // (no setState-on-unmounted warnings) and on rapid new toasts (no
  // lingering old timer). Previously `setTimeout(() => setToast(null), 3000)`
  // ran unconditionally.
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string, type: Toast['type'] = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3000);
  };
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const loadBatches = useCallback(async () => {
    try {
      const res = await adminApi.get<{ batches: AdminBatch[] }>('/batches/admin/all');
      setBatches(res.data.batches ?? []);
    } catch {
      setBatches([]);
    } finally {
      setBatchesLoading(false);
    }
  }, []);
  useEffect(() => { void loadBatches(); }, [loadBatches]);

  const fetchFaqs = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '15', sort });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (statusFilter) params.set('status', statusFilter);
    if (categoryFilter) params.set('category', categoryFilter);
    if (batchFilter) params.set('batchId', batchFilter);
    adminApi.get<FAQApiResponse>(`/admin/faqs?${params}`)
      .then(r => { setFaqs(r.data.faqs); setTotal(r.data.total); setPages(r.data.pages); setCategories(r.data.categories || []); })
      .finally(() => setLoading(false));
  }, [page, debouncedSearch, statusFilter, categoryFilter, batchFilter, sort]);

  useEffect(() => { fetchFaqs(); }, [fetchFaqs]);
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, categoryFilter, batchFilter]);

  const handleApprove = async (id: string) => { await adminApi.post('/admin/faq/approve', { id }); showToast('Approved'); fetchFaqs(); };
  const handleReject  = async (id: string) => { await adminApi.post('/admin/faq/reject', { id }); showToast('Rejected', 'warn'); fetchFaqs(); };
  const handleDelete  = async (id: string) => { if (!confirm('Delete this FAQ?')) return; await adminApi.delete(`/admin/faq/${id}`); showToast('Deleted', 'error'); fetchFaqs(); void loadBatches(); };

  const handleEdit = async () => {
    if (!editFaq) return; setSaving(true);
    try {
      await adminApi.put(`/admin/faq/${editFaq._id}`, {
        question: editFaq.question,
        answer: editFaq.answer,
        category: editFaq.category,
        status: editFaq.status,
        batchId: editFaq.batchId || undefined,
      });
      showToast('Saved');
      setEditModal(false);
      fetchFaqs();
      void loadBatches();
    } catch { showToast('Save failed', 'error'); }
    finally { setSaving(false); }
  };

  const handleAdd = async () => {
    if (!newFaq.batchId) {
      showToast('Pick a program for this FAQ.', 'error');
      return;
    }
    setSaving(true);
    try {
      await adminApi.post('/admin/faq', {
        question: newFaq.question,
        answer: newFaq.answer,
        category: newFaq.category,
        batchId: newFaq.batchId,
        status: newFaq.status,
        freshnessTier: newFaq.freshnessTier,
        reviewIntervalDays: newFaq.reviewIntervalDays,
      });
      showToast('Created');
      setAddModal(false);
      setNewFaq({ question: '', answer: '', category: '', batchId: newFaq.batchId, status: 'approved', freshnessTier: 'evergreen', reviewIntervalDays: 0 });
      setAddCategoryOption('');
      fetchFaqs();
      void loadBatches();
    } catch { showToast('Create failed', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4 max-w-6xl">
      <AnimatePresence>{toast && <Toast toast={toast} />}</AnimatePresence>

      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-faint -mt-2">
          {total} total
          {batchFilter && batches.find((b) => b._id === batchFilter) && (
            <span className="ml-2 text-ink">· in {batches.find((b) => b._id === batchFilter)?.name}</span>
          )}
        </p>
        <button
          onClick={() => {
            // Pre-fill with the current filter or the first available batch
            setNewFaq((f) => ({ ...f, batchId: batchFilter || f.batchId || (batches[0]?._id ?? '') }));
            setAddCategoryOption('');
            setAddModal(true);
          }}
          className="admin-btn-primary"
          disabled={batchesLoading}
          title={batchesLoading ? 'Loading programs…' : ''}
        >
          + Add FAQ
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} className="admin-search-input" />
        </div>
        <select value={batchFilter} onChange={e => setBatchFilter(e.target.value)} className="admin-select" title="Filter by program">
          <option value="">All Programs</option>
          {batches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="admin-select">
          <option value="">All Status</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
        </select>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="admin-select">
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="admin-table-wrap">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="admin-thead-row">
              <th className="admin-th">Question</th>
              <th className="admin-th">Program</th>
              <th className="admin-th">Category</th>
              <th className="admin-th">Status</th>
              <th className="admin-th text-right">Views</th>
              <th className="admin-th text-right">Votes</th>
              <th className="admin-th">Date</th>
              <th className="admin-th text-right">Actions</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={8} className="px-3 py-6"><TableSkeleton rows={8} /></td></tr> :
               faqs.length === 0 ? <tr><td colSpan={8} className="admin-empty">No FAQs found</td></tr> :
               faqs.map(faq => (
                <tr key={faq._id} className="admin-tr">
                  <td className="admin-td max-w-[220px] truncate" title={faq.question}>{faq.question}</td>
                  <td className="admin-td">
                    {faq.batchId && batchMap.get(faq.batchId) ? (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-admin-purple/10 text-admin-purple-bright border border-admin-purple/20 font-medium">
                        {batchMap.get(faq.batchId)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-ink-faint italic">unassigned</span>
                    )}
                  </td>
                  <td className="admin-td text-ink-faint">{faq.category}</td>
                  <td className="admin-td"><Badge status={faq.status as 'approved'|'pending'|'rejected'} /></td>
                  <td className="admin-td text-right tabular-nums text-ink-faint">{faq.views ?? 0}</td>
                  <td className="admin-td text-right tabular-nums text-ink-faint">{faq.helpfulVotes ?? 0}</td>
                  <td className="admin-td text-ink-faint">{new Date(faq.createdAt).toLocaleDateString('en-IN')}</td>
                  <td className="admin-td text-right">
                    <div className="flex items-center justify-end gap-1">
                      {faq.status !== 'approved' && <button onClick={() => handleApprove(faq._id)} className="w-6 h-6 flex items-center justify-center rounded text-ink-faint hover:text-success hover:bg-success/10 transition-colors" title="Approve"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg></button>}
                      {faq.status !== 'rejected' && <button onClick={() => handleReject(faq._id)} className="w-6 h-6 flex items-center justify-center rounded text-ink-faint hover:text-warning hover:bg-warning/10 transition-colors" title="Reject"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
                      <button onClick={() => {
                        setEditFaq({ ...faq, batchId: faq.batchId ?? '', freshnessTier: (faq as any).freshnessTier ?? 'evergreen', reviewIntervalDays: (faq as any).reviewIntervalDays ?? 0 });
                        setEditCategoryOption(categories.includes(faq.category) ? faq.category : (faq.category ? '__other__' : ''));
                        setEditModal(true);
                      }} className="w-6 h-6 flex items-center justify-center rounded text-ink-faint hover:text-ink hover:bg-mist transition-colors" title="Edit"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                      <button onClick={() => handleDelete(faq._id)} className="w-6 h-6 flex items-center justify-center rounded text-ink-faint hover:text-danger hover:bg-danger/10 transition-colors" title="Delete"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
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

      {/* Edit Modal */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="Edit FAQ">
        {editFaq && (
          <div className="space-y-3">
            <div>
              <label className="admin-label">Question</label>
              <input value={editFaq.question} onChange={e => setEditFaq(f => f ? { ...f, question: e.target.value } : null)} className="admin-input" />
            </div>
            <div>
              <label className="admin-label">Answer</label>
              <textarea rows={4} value={editFaq.answer} onChange={e => setEditFaq(f => f ? { ...f, answer: e.target.value } : null)} className="admin-textarea" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="admin-label">Program</label>
                <select
                  value={editFaq.batchId ?? ''}
                  onChange={e => setEditFaq(f => f ? { ...f, batchId: e.target.value } : null)}
                  className="admin-select w-full"
                >
                  <option value="">— unassigned —</option>
                  {batches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="admin-label">Category</label>
                <CategoryDropdown
                  value={editCategoryOption}
                  categories={categories}
                  onChange={val => {
                    setEditCategoryOption(val);
                    if (val !== '__other__') {
                      setEditFaq(f => f ? { ...f, category: val } : null);
                    } else {
                      setEditFaq(f => f ? { ...f, category: '' } : null);
                    }
                  }}
                />
                {editCategoryOption === '__other__' && (
                  <input
                    value={editFaq.category}
                    onChange={e => setEditFaq(f => f ? { ...f, category: e.target.value } : null)}
                    placeholder="Enter custom category..."
                    className="admin-input mt-2"
                  />
                )}
              </div>
            </div>
            <div>
              <label className="admin-label">Status</label>
              <select value={editFaq.status} onChange={e => setEditFaq(f => f ? { ...f, status: e.target.value as FAQ['status'] } : null)} className="admin-select w-full">
                <option value="approved">Approved</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div>
              <label className="admin-label">Freshness Tier</label>
              <FreshnessTierSelector
                value={editFaq.freshnessTier ?? 'evergreen'}
                onChange={t => setEditFaq(f => f ? { ...f, freshnessTier: t, reviewIntervalDays: t === 'evergreen' ? 0 : f.reviewIntervalDays || (t === 'seasonal' ? 15 : 4) } : null)}
                reviewIntervalDays={editFaq.reviewIntervalDays ?? 0}
                onIntervalChange={d => setEditFaq(f => f ? { ...f, reviewIntervalDays: d } : null)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditModal(false)} className="admin-btn-ghost">Cancel</button>
              <button onClick={handleEdit} disabled={saving} className="admin-btn-primary">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Modal */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add FAQ">
        <div className="space-y-3">
          {batches.length === 0 && !batchesLoading && (
            <div className="admin-toast-warn border rounded-lg px-3 py-2 text-xs">
              No programs exist yet. <a href="/admin/batches" className="underline font-semibold">Create one first</a>.
            </div>
          )}
          <div>
            <label className="admin-label">Question</label>
            <input value={newFaq.question} onChange={e => setNewFaq(f => ({ ...f, question: e.target.value }))} placeholder="Enter the question…" className="admin-input" />
          </div>
          <div>
            <label className="admin-label">Answer</label>
            <textarea rows={4} value={newFaq.answer} onChange={e => setNewFaq(f => ({ ...f, answer: e.target.value }))} placeholder="Enter the answer…" className="admin-textarea" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="admin-label">Program <span className="text-danger">*</span></label>
              <select
                value={newFaq.batchId}
                onChange={e => setNewFaq(f => ({ ...f, batchId: e.target.value }))}
                className="admin-select w-full"
                required
              >
                <option value="">— Select a program —</option>
                {batches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="admin-label">Category</label>
              <CategoryDropdown
                value={addCategoryOption}
                categories={categories}
                onChange={val => {
                  setAddCategoryOption(val);
                  if (val !== '__other__') {
                    setNewFaq(f => ({ ...f, category: val }));
                  } else {
                    setNewFaq(f => ({ ...f, category: '' }));
                  }
                }}
              />
              {addCategoryOption === '__other__' && (
                <input
                  value={newFaq.category}
                  onChange={e => setNewFaq(f => ({ ...f, category: e.target.value }))}
                  placeholder="Enter custom category..."
                  className="admin-input mt-2"
                />
              )}
            </div>
          </div>
          <div>
            <label className="admin-label">Status</label>
            <select value={newFaq.status} onChange={e => setNewFaq(f => ({ ...f, status: e.target.value as typeof newFaq.status }))} className="admin-select w-full">
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          <div>
            <label className="admin-label">Freshness Tier</label>
            <FreshnessTierSelector
              value={newFaq.freshnessTier}
              onChange={t => setNewFaq(f => ({ ...f, freshnessTier: t, reviewIntervalDays: t === 'evergreen' ? 0 : f.reviewIntervalDays || (t === 'seasonal' ? 15 : 4) }))}
              reviewIntervalDays={newFaq.reviewIntervalDays}
              onIntervalChange={d => setNewFaq(f => ({ ...f, reviewIntervalDays: d }))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setAddModal(false)} className="admin-btn-ghost">Cancel</button>
            <button onClick={handleAdd} disabled={saving || !newFaq.question || !newFaq.answer || !newFaq.category || !newFaq.batchId} className="admin-btn-primary">{saving ? 'Creating…' : 'Create FAQ'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
