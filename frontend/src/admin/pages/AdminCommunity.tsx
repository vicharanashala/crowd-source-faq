import React, { useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import adminApi from '../utils/adminApi';
import Badge from '../components/common/Badge';
import Modal from '../components/common/Modal';
import { TableSkeleton } from '../components/common/SkeletonLoader';

function useDebounce<T>(value: T, delay: number): T { const [v, setV] = useState(value); useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]); return v; }
interface CommunityPost { _id: string; title: string; body: string; status: 'answered' | 'unanswered'; author: { _id: string; name: string; email: string }; comments: Array<{ _id: string; body: string; author: { name: string }; verified: boolean }>; upvotes: string[]; createdAt: string; answer?: string; reports?: Array<{ reportedBy: string; reason: string; createdAt?: string }>; }
interface CommunityPostsResponse { posts: CommunityPost[]; total: number; page: number; pages: number; }
interface Toast { msg: string; type: 'success' | 'warn' | 'error'; }

function Toast({ toast }: { toast: Toast }) {
  const c = toast.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : toast.type === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700';
  return <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg text-xs font-medium border ${c}`}>{toast.msg}</motion.div>;
}

export default function AdminCommunity() {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);
  const [viewPost, setViewPost] = useState<CommunityPost | null>(null);
  const debouncedSearch = useDebounce(search, 350);
  const showToast = (msg: string, type: Toast['type'] = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const fetchPosts = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '12' });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (statusFilter) params.set('status', statusFilter);
    adminApi.get<CommunityPostsResponse>(`/admin/community/posts?${params}`).then(r => { setPosts(r.data.posts); setTotal(r.data.total); setPages(r.data.pages); }).finally(() => setLoading(false));
  }, [page, debouncedSearch, statusFilter]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter]);
  const handleDelete = async (id: string) => { if (!confirm('Delete this post?')) return; try { await adminApi.delete(`/admin/community/${id}`); showToast('Deleted', 'error'); fetchPosts(); } catch { showToast('Delete failed', 'error'); } };

  const th = 'px-3 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide';
  const td = 'px-3 py-3 text-sm text-gray-800';

  return (
    <div className="space-y-4 max-w-6xl">
      <AnimatePresence>{toast && <Toast toast={toast} />}</AnimatePresence>
      <div><h2 className="text-lg font-semibold text-gray-900">Community</h2><p className="text-sm text-gray-500 mt-0.5">{total} total posts</p></div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" placeholder="Search posts…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-md text-sm text-gray-800 placeholder-gray-400 bg-white border border-gray-200 outline-none focus:border-gray-400 transition-colors" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-2.5 py-1.5 rounded-md text-sm text-gray-700 bg-white border border-gray-200 outline-none focus:border-gray-400">
          <option value="">All Status</option><option value="unanswered">Unanswered</option><option value="answered">Answered</option>
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="bg-gray-50 border-b border-gray-200">
              <th className={th}>Title</th><th className={th}>Author</th><th className={th}>Status</th><th className={`${th} text-right`}>Reports</th><th className={`${th} text-right`}>Comments</th><th className={`${th} text-right`}>Upvotes</th><th className={th}>Date</th><th className={`${th} text-right`}>Actions</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={8} className="px-3 py-6"><TableSkeleton rows={8} /></td></tr> :
               posts.length === 0 ? <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-gray-400">No posts found</td></tr> :
               posts.map(post => (
                <tr key={post._id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                  <td className={`${td} max-w-[180px] truncate`} title={post.title}>{post.title}</td>
                  <td className={`${td} text-gray-500`}>{post.author?.name ?? '—'}</td>
                  <td className={td}><Badge status={post.status === 'answered' ? 'approved' : 'pending'} label={post.status} showDot={false} /></td>
                  <td className={`${td} text-right`}>
                    {(post.reports?.length ?? 0) > 0 ? (
                      <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-50 border border-red-200 text-[10px] font-bold text-red-600">{post.reports!.length}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className={`${td} text-right text-gray-500 tabular-nums`}>{post.comments?.length ?? 0}</td>
                  <td className={`${td} text-right text-gray-500 tabular-nums`}>{post.upvotes?.length ?? 0}</td>
                  <td className={`${td} text-gray-500`}>{new Date(post.createdAt).toLocaleDateString('en-IN')}</td>
                  <td className={`${td} text-right`}>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setViewPost(post)} className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-800 hover:bg-gray-100 transition-colors" title="View"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
                      <button onClick={() => handleDelete(post._id)} className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500"><span>Page {page} of {pages} · {total} results</span><div className="flex gap-1"><button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded-md hover:bg-gray-100 disabled:opacity-30 transition-colors">← Prev</button><button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="px-3 py-1 rounded-md hover:bg-gray-100 disabled:opacity-30 transition-colors">Next →</button></div></div>}
      </div>

      <Modal open={!!viewPost} onClose={() => setViewPost(null)} title="Post Details">
        {viewPost && (
          <div className="space-y-3">
            <div><p className="text-xs font-medium text-gray-500 mb-1">Title</p><p className="text-sm text-gray-900">{viewPost.title}</p></div>
            <div><p className="text-xs font-medium text-gray-500 mb-1">Author</p><p className="text-sm text-gray-700">{viewPost.author?.name} ({viewPost.author?.email})</p></div>
            <div><p className="text-xs font-medium text-gray-500 mb-1">Body</p><p className="text-sm text-gray-800 whitespace-pre-wrap">{viewPost.body}</p></div>
            <div><p className="text-xs font-medium text-gray-500 mb-1">Status</p><Badge status={viewPost.status === 'answered' ? 'approved' : 'pending'} label={viewPost.status} showDot={false} /></div>
            {viewPost.answer && <div><p className="text-xs font-medium text-gray-500 mb-1">Official Answer</p><p className="text-sm text-emerald-700 whitespace-pre-wrap border-l-2 border-emerald-300 pl-3">{viewPost.answer}</p></div>}
            {viewPost.reports && viewPost.reports.length > 0 && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-xs font-semibold text-red-600 mb-2">⚠ {viewPost.reports.length} Report{viewPost.reports.length !== 1 ? 's' : ''}</p>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {viewPost.reports.map((r, i) => (
                    <div key={i} className="text-xs text-red-700 bg-white rounded-lg px-3 py-2 border border-red-100">
                      {r.reason}{r.createdAt ? ` — ${new Date(r.createdAt).toLocaleDateString('en-IN')}` : ''}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Comments ({viewPost.comments?.length ?? 0})</p>
              {viewPost.comments?.length ? <div className="space-y-1.5 max-h-40 overflow-y-auto">{viewPost.comments.map(c => <div key={c._id} className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100"><span className="font-medium">{c.author?.name ?? '—'}: </span>{c.body}{c.verified && <span className="ml-2 text-emerald-500">✓</span>}</div>)}</div> : <p className="text-xs text-gray-400">No comments</p>}
            </div>
            <div className="flex justify-between pt-2 border-t border-gray-100">
              <span className="text-xs text-gray-400">{new Date(viewPost.createdAt).toLocaleString('en-IN')}</span>
              <div className="flex gap-2">
                <button onClick={() => { handleDelete(viewPost._id); setViewPost(null); }} className="px-3 py-1.5 rounded-md text-xs font-medium text-red-600 hover:bg-red-50 transition-colors">Delete</button>
                <button onClick={() => setViewPost(null)} className="px-3 py-1.5 rounded-md text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors">Close</button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
