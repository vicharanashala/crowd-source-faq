import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Footer from '../components/layout/Footer';
import UserActiveProgramIndicator from '../components/layout/UserActiveProgramIndicator';
import CommunityPostCard from '../components/community/CommunityPostCard';
import ThreadDetail from '../components/community/ThreadDetail';
import Avatar from '../components/ui/Avatar';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { CommunityDoodles } from '../components/ui/PageDoodles';
import CommunityHealth from '../components/community/CommunityHealth';
import api, { friendlyError } from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import { useAuthGate } from '../context/AuthModalContext';
import type { Post } from '../types/ui';

// Modular dialog components
import PostDetailDialog from '../components/community/PostDetailDialog';
import CreatePostDialog from '../components/community/CreatePostDialog';

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CommunityPage() {
  const { user } = useAuth();
  const gate = useAuthGate();
  const handleAskQuestion = gate(
    () => setShowCreate(true),
    'Sign in to ask a question in the community.'
  );
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [search, setSearch] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('search') || '';
  });

  const [searchResults, setSearchResults] = useState<Post[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createPrefillTitle, setCreatePrefillTitle] = useState('');

  // Backend uses cursor-based pagination. The previous version sent `?page=2`
  // which the backend silently ignored — so every "Load more" call returned
  // the FIRST batch and we got duplicates. Send the cursor instead.
  const fetchPosts = useCallback((reset = false) => {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    api.get('/community', {
      params: {
        limit: 20,
        filter,
        sort,
        ...(reset ? {} : nextCursor ? { cursor: nextCursor } : {}),
      },
    })
      .then((res) => {
        const incoming = res.data.posts || [];
        setPosts((prev) => reset ? incoming : [...prev, ...incoming]);
        setTotal(res.data.total || 0);
        setHasMore(res.data.hasMore ?? false);
        setNextCursor(res.data.nextCursor ?? null);
        setPage((p) => reset ? 1 : p + 1);
      })
      .catch(() => setError('Failed to load posts. Please try again.'))
      .finally(() => {
        setLoading(false);
        setLoadingMore(false);
      });
  }, [filter, sort, nextCursor]);

  // Thread detail: when a post ID is set, show ThreadDetail instead of the list/dialog
  const handleOpenThread = useCallback((postId: string) => {
    setSelectedPostId(postId);
  }, []);

  const handleCloseThread = useCallback(() => {
    setSelectedPostId(null);
    // Refresh current view to pick up any new comments/upvotes
    fetchPosts(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPosts]);

  // If navigated here via ?ask=true (from navbar "Ask Question") or ?post=<id> (from search)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // ?ask=true — open the create dialog. The navbar's "Ask Question" button
    // already gates this behind the auth modal, so by the time we get here
    // (after the gate's pending-action replay) the user is authenticated.
    // We still double-check user here as a safety net.
    if (params.get('ask') === 'true') {
      if (user) {
        const prefilledTitle = params.get('title') || '';
        setCreatePrefillTitle(prefilledTitle);
        setShowCreate(true);
        window.history.replaceState({}, '', window.location.pathname);
      } else {
        // Not authenticated — clear the param so the gate can re-trigger it
        // after login if the user chooses to sign in.
        window.history.replaceState({}, '', window.location.pathname);
      }
    }

    // ?post=<id> — open thread, fetch individually if not in cached list
    const postId = params.get('post');
    if (postId) {
      const found = posts.find((p) => p._id === postId);
      if (found) {
        setSelectedPostId(postId);
      } else {
        // Post not in list — fetch individually
        api.get(`/community/${postId}`)
          .then((res) => {
            const post = res.data;
            if (post && post._id) {
              setSelectedPostId(postId);
              // Prepend to posts so it's in cache
              setPosts(prev => [post, ...prev]);
            }
          })
          .catch(() => {
            // Post not found or access denied — silently fail, don't open thread
          });
      }
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [posts, user, window.location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchPosts(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, sort]);

  // Reset cursor + posts when filter/sort changes so we paginate the
  // newly-filtered set from the beginning.
  useEffect(() => {
    setNextCursor(null);
    setPosts([]);
  }, [filter, sort]);

  // ── Infinite scroll — fetch the next page when the sentinel enters view ────
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sentinelRef.current) return;
    if (!hasMore || loading || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchPosts(false);
        }
      },
      { rootMargin: '300px 0px' } // start loading 300px before the sentinel
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loading, loadingMore, nextCursor, filter, sort]);

  const runSemanticSearch = useCallback(async (q: string) => {
    setSearchLoading(true);
    try {
      const res = await api.get<{ results: Post[] }>('/community/search', { params: { q } });
      setSearchResults(res.data.results || []);
    } catch (err) {
      console.error(friendlyError(err, 'Failed to load posts.'));
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    const q = search.trim();
    if (!q || q.length < 3) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      runSemanticSearch(q);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, runSemanticSearch]);

  // Show success toast when a manual sync completes
  useEffect(() => {
    if (!loading && syncing) {
      setSyncing(false);
      setToast('Community content synced');
      setTimeout(() => setToast(''), 2500);
    }
  }, [loading, syncing]);

  // When filter or sort changes — refresh posts (if no search active) or re-filter existing results
  useEffect(() => {
    if (search.trim()) {
      // Search is active — re-apply filter/sort client-side to existing searchResults
      setSearchResults(prev => {
        if (!prev.length) return prev;
        let filtered = [...prev];
        if (filter === 'answered') filtered = filtered.filter(p => p.status === 'answered');
        else if (filter === 'unanswered') filtered = filtered.filter(p => p.status === 'unanswered');
        if (sort === 'newest') filtered.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
        else if (sort === 'oldest') filtered.sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime());
        else if (sort === 'popular') filtered.sort((a, b) => ((b.upvotes?.length ?? 0)) - ((a.upvotes?.length ?? 0)));
        else if (sort === 'discussed') filtered.sort((a, b) => ((b.comments?.length ?? 0)) - ((a.comments?.length ?? 0)));
        return filtered;
      });
      return;
    }
    fetchPosts(true);
  }, [filter, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePostCreated = (newPost: Post) => {
    setPosts((prev) => [newPost, ...prev]);
    setTotal((t) => t + 1);
    setShowCreate(false);
    setHasMore(true);
  };

  const handleCloseDetail = () => {
    setSelectedPostId(null);
  };

  const handleShareCommunity = async () => {
    const url = window.location.origin + '/community';
    try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
    setToast('Community link copied');
    setTimeout(() => setToast(''), 2500);
  };

  const handleSync = () => {
    if (syncing || loading) return;
    setSyncing(true);
    fetchPosts(true);
  };

  const visible = (() => {
    if (search.trim()) return searchResults;

    return [...posts].sort((a, b) => {
      if (sort === 'newest') return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
      if (sort === 'oldest') return new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
      if (sort === 'popular') return ((b.upvotes?.length ?? 0)) - ((a.upvotes?.length ?? 0));
      if (sort === 'discussed') return ((b.comments?.length ?? 0)) - ((a.comments?.length ?? 0));
      return 0;
    });
  })();

  const displayedPosts = filter === 'all'
    ? visible
    : visible.filter((p) => p.status === filter);

  const answeredCount = posts.filter((p) => p.status === 'answered').length;
  const unansweredCount = posts.filter((p) => p.status !== 'answered').length;

  return (
    <div className="min-h-screen bg-bg grid-bg relative">
      <CommunityDoodles />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-28 sm:pt-32 pb-8 sm:pb-10 relative z-10">
        {/* v1.69 — Phase 12: persistent "browsing program" pill
            so the user always knows which program's community
            feed they're scrolling. The pill reads from
            BatchContext. The actual data fetch below already
            uses currentBatch._id for the ?batchId=... filter
            — this commit is a UX improvement, not a backend
            change. */}
        <div className="flex justify-center mb-4">
          <UserActiveProgramIndicator />
        </div>
        <div className="flex items-start justify-between gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-serif text-ink tracking-tight">Community Board</h1>
            <p className="mt-1 sm:mt-1.5 text-xs sm:text-sm text-ink-soft truncate">
              Ask anything, get answers from peers and moderators
            </p>
            {!loading && (
              <p className="mt-0.5 text-[11px] text-ink-faint">
                {total} discussions · {answeredCount} answered · {unansweredCount} open
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleAskQuestion}
              id="ask-question-btn"
              size="sm"
              className="sm:!px-4 sm:!py-2 sm:!text-xs flex-shrink-0"
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="mr-1 inline-block">
                <path d="M7 2V12M2 7H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span className="hidden sm:inline">Ask Question</span>
              <span className="sm:hidden">Ask</span>
            </Button>
            {/* Share button */}
            <button
              onClick={handleShareCommunity}
              className="w-9 h-9 rounded-xl border border-border bg-card flex items-center justify-center text-ink-faint hover:text-ink hover:border-accent/30 transition-all"
              aria-label="Share community link"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/>
                <circle cx="6" cy="12" r="3"/>
                <circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </button>
            {/* Sync Content button */}
            <button
              onClick={handleSync}
              className="btn-community-ask"
              disabled={syncing}
              aria-label="Sync community posts"
            >
              <svg className={`flex-shrink-0 transition-transform ${syncing ? 'animate-spin' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              <span className="hidden sm:inline">Sync Content</span>
              <span className="sm:hidden">Sync</span>
            </button>
          </div>
        </div>

        <CommunityHealth />

        {!loading && total > 0 && (
          <div className="relative mb-4">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M10 10L12.5 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && search.trim().length >= 3) {
                  runSemanticSearch(search.trim());
                }
              }}
              placeholder="Search questions…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 transition-all"
            />
            {searchLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              </div>
            )}
          </div>
        )}

        {!loading && !error && total > 0 && (
          <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
            <div className="flex gap-1 p-1 bg-mist rounded-xl w-fit">
              {[
                { key: 'all', label: 'All' },
                { key: 'unanswered', label: 'Unanswered' },
                { key: 'open', label: 'Open' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200
                    ${filter === key ? 'bg-card text-ink shadow-subtle' : 'text-ink-soft hover:text-ink'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-border bg-card text-xs text-ink-soft focus:outline-none focus:ring-2 focus:ring-accent/25 cursor-pointer"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="popular">Most Upvoted</option>
              <option value="discussed">Most Commented</option>
            </select>
          </div>
        )}

        {(loading || searchLoading) && (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
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

        {!loading && !searchLoading && !error && total === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-mist flex items-center justify-center mb-4">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" className="text-ink-faint" strokeWidth="1.5">
                <circle cx="14" cy="14" r="11"/>
                <path d="M14 8.5V14.5" strokeLinecap="round"/>
                <circle cx="14" cy="18" r="1" fill="currentColor" stroke="none"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-ink-soft">No discussions yet</p>
            <p className="text-xs text-ink-faint mt-1">Be the first to ask a question!</p>
            <Button onClick={handleAskQuestion} className="mt-4">
              Ask a Question
            </Button>
          </div>
        )}

        {!loading && !searchLoading && !error && total > 0 && displayedPosts.length === 0 && (
          <p className="text-center text-sm text-ink-soft py-16">
            No posts match your current filters.
          </p>
        )}

        {!loading && !searchLoading && !error && displayedPosts.length > 0 && (
          <div className="space-y-3">
            {displayedPosts.map((post) => (
              <CommunityPostCard
                key={post._id}
                post={post}
                onClick={(p) => handleOpenThread(p._id)}
                currentUserId={user?._id || (user?.id as string | undefined)}
              />
            ))}
          </div>
        )}

        {/* Infinite scroll sentinel — when this enters view, fetch next page */}
        {!loading && !search.trim() && displayedPosts.length > 0 && (
          <div ref={sentinelRef} className="h-12 flex items-center justify-center mt-4">
            {hasMore ? (
              loadingMore ? (
                <div className="flex items-center gap-2 text-xs text-ink-faint">
                  <span className="w-4 h-4 border-2 border-ink/20 border-t-ink rounded-full animate-spin inline-block" />
                  Loading more…
                </div>
              ) : (
                <span className="text-xs text-ink-faint">Scroll for more</span>
              )
            ) : (
              posts.length > 0 && (
                <span className="text-xs text-ink-faint">You've reached the end · {total} discussions</span>
              )
            )}
          </div>
        )}

        <div className="h-12" />
      </main>

      <Footer />

      {/* Thread detail — full-page overlay replaces the list view */}
      {selectedPostId && (
        <div className="fixed inset-0 z-40 bg-bg overflow-y-auto">
          <ThreadDetail
            postId={selectedPostId}
            onClose={handleCloseDetail}
          />
        </div>
      )}

      {showCreate && (
        <CreatePostDialog
          onClose={() => { setShowCreate(false); setCreatePrefillTitle(''); }}
          onCreated={handlePostCreated}
          prefillTitle={createPrefillTitle}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 bg-card border border-border rounded-xl text-xs text-ink font-medium shadow-float pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  );
}
