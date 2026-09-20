import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Footer from '../components/layout/Footer';
import CommunityPostCard from '../components/community/CommunityPostCard';
import ThreadDetail from '../components/community/ThreadDetail';
import { CommunityDoodles } from '../components/ui/PageDoodles';
import api from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import type { Post } from '../types/ui';

// ─── Local type — mirrors backend CommunityPostStatus; not imported from backend ──
type MyPostStatusFilter = 'all' | 'answered' | 'unanswered';

interface MyPostsApiResponse {
  posts: Post[];
  total: number;
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
}

const FILTER_TABS: { label: string; value: MyPostStatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Answered', value: 'answered' },
  { label: 'Pending', value: 'unanswered' },
];

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MyQuestionsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<MyPostStatusFilter>('all');
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Fetch the first page (or re-fetch when the filter changes)
  const fetchMyPosts = useCallback(() => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ limit: '20' });
    if (statusFilter !== 'all') params.set('status', statusFilter);

    api.get<MyPostsApiResponse>(`/community/my-posts?${params}`)
      .then((res) => {
        setPosts(res.data.posts ?? []);
        setTotal(res.data.total ?? 0);
        setHasMore(res.data.hasMore ?? false);
        setNextCursor(res.data.nextCursor ?? null);
      })
      .catch(() => setError('Failed to load your questions. Please try again.'))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => {
    fetchMyPosts();
  }, [fetchMyPosts]);

  // Load the next cursor page and append results
  const handleLoadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const params = new URLSearchParams({ limit: '20', cursor: nextCursor });
    if (statusFilter !== 'all') params.set('status', statusFilter);

    api.get<MyPostsApiResponse>(`/community/my-posts?${params}`)
      .then((res) => {
        setPosts(prev => [...prev, ...(res.data.posts ?? [])]);
        setHasMore(res.data.hasMore ?? false);
        setNextCursor(res.data.nextCursor ?? null);
      })
      .catch(() => setError('Failed to load more questions.'))
      .finally(() => setLoadingMore(false));
  }, [nextCursor, loadingMore, statusFilter]);

  const handleOpenThread = useCallback((post: Post) => {
    setSelectedPostId(post._id);
  }, []);

  const handleCloseThread = useCallback(() => {
    setSelectedPostId(null);
    fetchMyPosts();
  }, [fetchMyPosts]);

  // Bookmark toggle — no optimistic removal here since this is the user's OWN posts list
  const handleToggleBookmark = useCallback(async (postId: string) => {
    try {
      await api.post(`/community/${postId}/bookmark`);
      // Re-fetch to reflect the updated bookmark state on the card
      fetchMyPosts();
    } catch {
      // Silent — bookmark errors are non-critical on this page
    }
  }, [fetchMyPosts]);

  // Filter tab change resets pagination
  const handleFilterChange = (value: MyPostStatusFilter) => {
    setStatusFilter(value);
    setNextCursor(null);
    setPosts([]);
  };

  return (
    <div className="min-h-screen bg-bg grid-bg relative">
      <CommunityDoodles />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-20 sm:pt-24 pb-8 sm:pb-10 relative z-10">

        {/* Page header */}
        <div className="flex items-start justify-between gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-serif text-ink tracking-tight">
              My Questions
            </h1>
            <p className="mt-1 sm:mt-1.5 text-xs sm:text-sm text-ink-soft truncate">
              All questions you've posted to the community board
            </p>
            {!loading && (
              <p className="mt-0.5 text-[11px] text-ink-faint">
                {total} question{total !== 1 ? 's' : ''}
                {statusFilter !== 'all' ? ` · ${statusFilter === 'answered' ? 'answered' : 'pending'}` : ''}
              </p>
            )}
          </div>
        </div>

        {/* Filter tabs — All / Answered / Pending */}
        <div className="flex gap-1.5 mb-5 flex-wrap">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => handleFilterChange(tab.value)}
              className={[
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors border',
                statusFilter === tab.value
                  ? 'bg-accent text-accent-text border-accent/70'
                  : 'bg-card text-ink-soft border-border hover:bg-mist hover:text-ink',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Skeleton loading */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-card rounded-2xl border border-border shadow-subtle p-4 flex items-start gap-4 animate-pulse">
                <div className="w-9 h-9 rounded-xl bg-mist flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-mist rounded w-3/4" />
                  <div className="h-3 bg-mist rounded w-1/2" />
                  <div className="h-3 bg-mist rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="rounded-2xl bg-danger-light border border-danger/15 p-4 text-sm text-danger">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && posts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-mist flex items-center justify-center mb-4">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" className="text-ink-faint" strokeWidth="1.5">
                <circle cx="14" cy="14" r="10" />
                <path d="M14 10v4" strokeLinecap="round" />
                <circle cx="14" cy="18" r="0.5" fill="currentColor" strokeWidth="0" />
              </svg>
            </div>
            <p className="text-sm font-medium text-ink-soft">
              {statusFilter === 'all'
                ? "You haven't asked anything yet"
                : statusFilter === 'answered'
                ? 'No answered questions yet'
                : 'No pending questions'}
            </p>
            <p className="text-xs text-ink-faint mt-1">
              {statusFilter === 'all'
                ? 'Ask your first question on the community board.'
                : 'Try switching to the "All" tab to see everything.'}
            </p>
            {statusFilter === 'all' && (
              <button
                onClick={() => navigate('/community?ask=true')}
                className="mt-4 px-4 py-2 rounded-xl bg-accent text-accent-text text-sm font-medium hover:bg-accent/90 transition-colors"
              >
                Ask a Question
              </button>
            )}
          </div>
        )}

        {/* Post list */}
        {!loading && !error && posts.length > 0 && (
          <div className="space-y-3">
            {posts.map(post => (
              <CommunityPostCard
                key={post._id}
                post={post}
                onClick={handleOpenThread}
                currentUserId={user?._id || (user?.id as string | undefined)}
                onToggleBookmark={handleToggleBookmark}
              />
            ))}

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="px-5 py-2 rounded-xl border border-border bg-card text-sm text-ink-soft hover:bg-mist hover:text-ink transition-colors disabled:opacity-50"
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="h-12" />
      </main>

      <Footer />

      {/* Full-screen thread detail overlay — same pattern as SavedKnowledgePage */}
      {selectedPostId && (
        <div className="fixed inset-0 z-40 bg-bg overflow-y-auto">
          <ThreadDetail
            postId={selectedPostId}
            onClose={handleCloseThread}
          />
        </div>
      )}
    </div>
  );
}
