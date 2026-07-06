import { useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import adminApi from '../utils/adminApi';
import Badge from '../components/common/Badge';
import Modal from '../components/common/Modal';
import { TableSkeleton } from '../components/common/SkeletonLoader';
import { useDebounce } from '../../hooks/useDebounce';
import { getCategoryIcon, getCategoryTheme } from '../../components/faq/faqUtils';

interface CommunityPost {
  _id: string;
  title: string;
  body: string;
  status: 'answered' | 'unanswered';
  author: { _id: string; name: string; email: string };
  comments: Array<{ _id: string; body: string; author: { name: string }; verified: boolean }>;
  upvotes: string[];
  createdAt: string;
  answer?: string;
  reports?: Array<{ reportedBy: string; reason: string; createdAt?: string }>;
  tags?: string[];
}
interface CommunityPostsResponse {
  posts: CommunityPost[];
  total: number;
  page: number;
  pages: number;
  categories?: Array<{ name: string; count: number }>;
}
interface Toast { msg: string; type: 'success' | 'warn' | 'error'; }

function Toast({ toast }: { toast: Toast }) {
  const c = toast.type === 'error' ? 'admin-toast-error' : toast.type === 'warn' ? 'admin-toast-warn' : 'admin-toast-success';
  return <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg text-xs font-medium border ${c}`}>{toast.msg}</motion.div>;
}

export default function AdminCommunity() {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [categories, setCategories] = useState<Array<{ name: string; count: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);
  const [viewPost, setViewPost] = useState<CommunityPost | null>(null);
  const debouncedSearch = useDebounce(search, 350);
  const showToast = (msg: string, type: Toast['type'] = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const fetchPosts = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '12' });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (statusFilter) params.set('status', statusFilter);
    if (categoryFilter) params.set('category', categoryFilter);
    adminApi.get<CommunityPostsResponse>(`/admin/community/posts?${params}`).then(r => {
      setPosts(r.data.posts);
      setTotal(r.data.total);
      setPages(r.data.pages);
      setCategories(r.data.categories || []);
    }).finally(() => setLoading(false));
  }, [page, debouncedSearch, statusFilter, categoryFilter]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, categoryFilter]);
  const handleDelete = async (id: string) => { if (!confirm('Delete this post?')) return; try { await adminApi.delete(`/admin/community/${id}`); showToast('Deleted', 'error'); fetchPosts(); } catch { showToast('Delete failed', 'error'); } };

  return (
    <div className="space-y-4 max-w-6xl">
      <AnimatePresence>{toast && <Toast toast={toast} />}</AnimatePresence>
      <p className="text-sm text-ink-faint -mt-2">{total} total posts</p>

      {/* Category Selection Cards */}
      <div className="flex flex-wrap gap-3 pt-1 pb-3">
        {/* All Categories Card */}
        <button
          type="button"
          onClick={() => setCategoryFilter('')}
          className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all hover:shadow-md cursor-pointer min-w-[140px] flex-1 sm:flex-initial ${
            categoryFilter === ''
              ? 'bg-accent-light/10 border-accent/30 text-accent ring-1 ring-accent/30'
              : 'bg-card border-border text-ink hover:border-border-hover'
          }`}
        >
          <div className="w-8 h-8 rounded-lg bg-mist flex items-center justify-center text-ink-soft mb-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="9" />
              <rect x="14" y="3" width="7" height="5" />
              <rect x="14" y="12" width="7" height="9" />
              <rect x="3" y="16" width="7" height="5" />
            </svg>
          </div>
          <span className="text-xs font-bold tracking-tight">All Categories</span>
          <span className="text-[10px] text-ink-faint mt-1 font-semibold">{total} posts</span>
        </button>

        {/* Dynamic Category Cards */}
        {categories.map((cat) => {
          const isActive = categoryFilter === cat.name;
          const theme = getCategoryTheme(cat.name);
          const icon = getCategoryIcon(cat.name);
          return (
            <button
              key={cat.name}
              type="button"
              onClick={() => setCategoryFilter(cat.name)}
              className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all hover:shadow-md cursor-pointer min-w-[140px] flex-1 sm:flex-initial ${
                isActive
                  ? 'bg-accent-light/10 border-accent/30 text-accent ring-1 ring-accent/30'
                  : 'bg-card border-border text-ink hover:border-border-hover'
              }`}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center mb-2"
                style={{
                  backgroundColor: isActive ? 'rgba(16,185,129,0.1)' : 'var(--bg-mist, #f5f5f7)',
                  color: isActive ? theme.ctaColorDark || 'rgb(var(--accent-rgb))' : 'var(--text-ink-soft, #515154)',
                }}
              >
                {icon}
              </div>
              <span className="text-xs font-bold tracking-tight capitalize truncate w-full" title={cat.name}>
                {cat.name}
              </span>
              <span className="text-[10px] text-ink-faint mt-1 font-semibold">
                {cat.count} {cat.count === 1 ? 'post' : 'posts'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" placeholder="Search posts…" value={search} onChange={e => setSearch(e.target.value)} className="admin-search-input" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="admin-select">
          <option value="">All Status</option><option value="unanswered">Unanswered</option><option value="answered">Answered</option>
        </select>
      </div>

      <div className="admin-table-wrap">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="admin-thead-row">
              <th className="admin-th">Title</th><th className="admin-th">Author</th><th className="admin-th">Status</th><th className="admin-th text-right">Reports</th><th className="admin-th text-right">Comments</th><th className="admin-th text-right">Upvotes</th><th className="admin-th">Date</th><th className="admin-th text-right">Actions</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={8} className="px-3 py-6"><TableSkeleton rows={8} /></td></tr> :
               posts.length === 0 ? <tr><td colSpan={8} className="admin-empty">No posts found</td></tr> :
               posts.map(post => (
                <tr
                  key={post._id}
                  className="admin-tr hover:bg-mist/40 transition-colors cursor-pointer"
                  onClick={() => setViewPost(post)}
                >
                  <td className="admin-td max-w-[180px] truncate" title={post.title}>
                    {(() => {
                      const programName = typeof (post as any).batchId === 'object' && (post as any).batchId !== null && 'name' in (post as any).batchId
                        ? ((post as any).batchId as { name: string }).name
                        : null;
                      return (
                        <div className="inline-flex items-center gap-1 mr-2">
                          {programName && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-accent-light text-accent text-[9px] font-bold uppercase tracking-wider">
                              {programName}
                            </span>
                          )}
                          {post.tags && post.tags[0] && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-mist text-ink-soft border border-border/80 text-[9px] font-bold uppercase tracking-wider capitalize">
                              {post.tags[0]}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                    {post.title}
                  </td>
                  <td className="admin-td text-ink-faint">{post.author?.name ?? '—'}</td>
                  <td className="admin-td"><Badge status={post.status === 'answered' ? 'approved' : 'pending'} label={post.status} showDot={false} /></td>
                  <td className="admin-td text-right">
                    {(post.reports?.length ?? 0) > 0 ? (
                      <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-danger/10 border border-danger/20 text-[10px] font-bold text-danger">{post.reports!.length}</span>
                    ) : (
                      <span className="text-ink-faint/30">—</span>
                    )}
                  </td>
                  <td className="admin-td text-right text-ink-faint tabular-nums">{post.comments?.length ?? 0}</td>
                  <td className="admin-td text-right text-ink-faint tabular-nums">{post.upvotes?.length ?? 0}</td>
                  <td className="admin-td text-ink-faint">{new Date(post.createdAt).toLocaleDateString('en-IN')}</td>
                  <td className="admin-td text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setViewPost(post)} className="w-6 h-6 flex items-center justify-center rounded text-ink-faint hover:text-ink hover:bg-mist transition-colors" title="View"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
                      <button onClick={() => handleDelete(post._id)} className="w-6 h-6 flex items-center justify-center rounded text-ink-faint hover:text-danger hover:bg-danger/10 transition-colors" title="Delete"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && <div className="admin-pagination"><span>Page {page} of {pages} · {total} results</span><div className="flex gap-1"><button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="admin-pagination-btn">← Prev</button><button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="admin-pagination-btn">Next →</button></div></div>}
      </div>

      <Modal open={!!viewPost} onClose={() => setViewPost(null)} title="Post Details">
        {viewPost && (
          <div className="space-y-3">
            <div><p className="admin-label">Title</p><p className="text-sm text-ink">{viewPost.title}</p></div>
            {(() => {
              const programName = typeof (viewPost as any).batchId === 'object' && (viewPost as any).batchId !== null && 'name' in (viewPost as any).batchId
                ? ((viewPost as any).batchId as { name: string }).name
                : null;
              if (!programName) return null;
              return (
                <div>
                  <p className="admin-label">Program</p>
                  <p className="text-sm text-ink-soft">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-accent-light text-accent text-[9px] font-bold uppercase tracking-wider">
                      {programName}
                    </span>
                  </p>
                </div>
              );
            })()}
            <div><p className="admin-label">Author</p><p className="text-sm text-ink-soft">{viewPost.author?.name} ({viewPost.author?.email})</p></div>
            <div><p className="admin-label">Body</p><p className="text-sm text-ink-soft whitespace-pre-wrap">{viewPost.body}</p></div>
            <div><p className="admin-label">Status</p><Badge status={viewPost.status === 'answered' ? 'approved' : 'pending'} label={viewPost.status} showDot={false} /></div>
            {viewPost.answer && <div><p className="admin-label">Official Answer</p><p className="text-sm text-success whitespace-pre-wrap border-l-2 border-success/40 pl-3">{viewPost.answer}</p></div>}
            {viewPost.reports && viewPost.reports.length > 0 && (
              <div className="p-3 rounded-lg bg-danger/10 border border-danger/20">
                <p className="text-xs font-semibold text-danger mb-2">⚠ {viewPost.reports.length} Report{viewPost.reports.length !== 1 ? 's' : ''}</p>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {viewPost.reports.map((r, i) => (
                    <div key={i} className="text-xs text-danger/80 bg-card rounded-lg px-3 py-2 border border-danger/15">
                      {r.reason}{r.createdAt ? ` — ${new Date(r.createdAt).toLocaleDateString('en-IN')}` : ''}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="admin-label">Comments ({viewPost.comments?.length ?? 0})</p>
              {viewPost.comments?.length ? (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {viewPost.comments.map(c => (
                    <div key={c._id} className="text-sm text-ink-soft bg-mist rounded-lg px-3 py-2 border border-border">
                      <span className="font-medium text-ink">{c.author?.name ?? '—'}: </span>{c.body}
                      {c.verified && <span className="ml-2 text-success">✓</span>}
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-ink-faint">No comments</p>}
            </div>
            <div className="flex justify-between pt-2 border-t border-border">
              <span className="text-xs text-ink-faint">{new Date(viewPost.createdAt).toLocaleString('en-IN')}</span>
              <div className="flex gap-2">
                <button onClick={() => { handleDelete(viewPost._id); setViewPost(null); }} className="px-3 py-1.5 rounded-md text-xs font-medium text-danger hover:bg-danger/10 transition-colors">Delete</button>
                <button onClick={() => setViewPost(null)} className="admin-btn-ghost px-3 py-1.5 text-xs">Close</button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
