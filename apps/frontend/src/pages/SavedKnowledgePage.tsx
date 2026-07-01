import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Footer from '../components/layout/Footer';
import CommunityPostCard from '../components/community/CommunityPostCard';
import ThreadDetail from '../components/community/ThreadDetail';
import { CommunityDoodles } from '../components/ui/PageDoodles';
import api from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import type { Post } from '../types/ui';

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SavedKnowledgePage() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  // Redirect if not logged in (only after auth has finished loading)
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, loading, navigate]);

  const fetchBookmarks = useCallback(() => {
    if (!isAuthenticated) return;
    setLoading(true);
    api.get('/community/bookmarks')
      .then((res) => {
        const incoming = res.data.bookmarks || [];
        // Each post already has a bookmarks array (from user.populate) — pass it as-is
        setPosts(incoming);
      })
      .catch(() => setError('Failed to load saved knowledge.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchBookmarks();
  }, [fetchBookmarks]);

  const handleOpenThread = useCallback((post: Post) => {
    setSelectedPostId(post._id);
  }, []);

  const handleCloseThread = useCallback(() => {
    setSelectedPostId(null);
    fetchBookmarks();
  }, [fetchBookmarks]);

  // Toggle bookmark — remove from list optimistically
  const handleToggleBookmark = useCallback(async (postId: string) => {
    // Optimistic removal
    setPosts(prev => prev.filter(p => p._id !== postId));
    try {
      await api.post(`/community/${postId}/bookmark`);
    } catch {
      // Roll back on failure
      fetchBookmarks();
    }
  }, [fetchBookmarks]);

  const handlePostCreated = (newPost: Post) => {
    setPosts(prev => [newPost, ...prev]);
  };

  return (
    <div className="min-h-screen bg-bg grid-bg relative">
      <CommunityDoodles />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-20 sm:pt-24 pb-8 sm:pb-10 relative z-10">

        <div className="flex items-start justify-between gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-serif text-ink tracking-tight">
              My Saved Knowledge
            </h1>
            <p className="mt-1 sm:mt-1.5 text-xs sm:text-sm text-ink-soft truncate">
              Questions and answers you've bookmarked for later
            </p>
            {!loading && (
              <p className="mt-0.5 text-[11px] text-ink-faint">
                {posts.length} saved item{posts.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>

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

        {error && (
          <div className="rounded-2xl bg-danger-light border border-danger/15 p-4 text-sm text-danger">
            {error}
          </div>
        )}

        {!loading && !error && posts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-mist flex items-center justify-center mb-4">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" className="text-ink-faint" strokeWidth="1.5">
                <path d="M6 5H22L20 21H8L6 5Z" strokeLinejoin="round"/>
                <path d="M11 21V12H17V21" strokeLinejoin="round"/>
                <path d="M11 9V7C11 5.343 12.343 4 14 4C15.657 4 17 5.343 17 7V9"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-ink-soft">No saved knowledge yet</p>
            <p className="text-xs text-ink-faint mt-1">
              Bookmark questions and answers from the community board to find them here later.
            </p>
            <button
              onClick={() => navigate('/community')}
              className="mt-4 px-4 py-2 rounded-xl bg-accent text-accent-text text-sm font-medium hover:bg-accent/90 transition-colors"
            >
              Browse Community Board
            </button>
          </div>
        )}

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
          </div>
        )}

        <div className="h-12" />
      </main>

      <Footer />

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