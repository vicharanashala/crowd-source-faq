import React, { useEffect, useRef, useState, useCallback } from 'react';
import Footer from '../components/layout/Footer';
import UserActiveProgramIndicator from '../components/layout/UserActiveProgramIndicator';
import CommunityPostCard from '../components/community/CommunityPostCard';
import ThreadDetail from '../components/community/ThreadDetail';
import Button from '../components/ui/Button';
import { CommunityDoodles } from '../components/ui/PageDoodles';
import CommunityHealth from '../components/community/CommunityHealth';
import api from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import { useAuthGate } from '../context/AuthModalContext';
import { useBatch } from '../context/BatchContext';
import type { Post } from '../types/ui';

import CreatePostDialog from '../components/community/CreatePostDialog';
import { buttonCommunityAsk } from '../styles/style_config';

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CommunityPage() {
  const { user } = useAuth();
  const { currentBatch } = useBatch();
  const activeBatchId = currentBatch?._id ?? undefined;
  const gate = useAuthGate();
  const handleAskQuestion = gate(
    () => setShowCreate(true),
    'Sign in to ask a question in the community.'
  );

  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [showAllPrograms, setShowAllPrograms] = useState(false);
  
  const [search, setSearch] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('search') || '';
  });

  const [searchResults, setSearchResults] = useState<Post[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createPrefillTitle, setCreatePrefillTitle] = useState('');

  // ── Keyboard Shortcut & Recent Searches ──────────────────────────────────
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('csfaq_recent_searches') || '[]');
    } catch {
      return [];
    }
  });

  const saveToRecent = (term: string) => {
    const q = term.trim();
    if (!q || q.length < 2) return;
    setRecentSearches((prev) => {
      const updated = [q, ...prev.filter((item) => item.toLowerCase() !== q.toLowerCase())].slice(0, 4);
      localStorage.setItem('csfaq_recent_searches', JSON.stringify(updated));
      return updated;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key === 'k')) &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
// community routes don't have the programScope middleware attached
  // and the controllers fall back to "no batchId filter". The
  // explicit-`undefined`-when-no-program-selected case preserves the
  // legacy behaviour while the program picker takes over.
  const fetchPosts = useCallback((reset = false) => {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    api.get('/community', {
      params: {
        limit: 20,
        filter,
        sort,
        batchId: showAllPrograms ? 'all' : activeBatchId,
        ...(reset ? {} : nextCursor ? { cursor: nextCursor } : {}),
      },
    })
      .then((res) => {
        const incoming = res.data.posts || [];
        setPosts((prev) => (reset ? incoming : [...prev, ...incoming]));
        setTotal(res.data.total || 0);
        setHasMore(res.data.hasMore ?? false);
        setNextCursor(res.data.nextCursor ?? null);
      })
      .catch(() => setError('Failed to load posts. Please try again.'))
      .finally(() => {
        setLoading(false);
        setLoadingMore(false);
      });
  }, [filter, sort, nextCursor, showAllPrograms, activeBatchId]);

  // Thread detail: when a post ID is set, show ThreadDetail instead of the list/dialog
  const handleOpenThread = useCallback((postId: string) => {
    setSelectedPostId(postId);
  }, []);

  // If navigated here via ?ask=true (from navbar "Ask Question") or ?post=<id> (from search)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // ?ask=true — open the create dialog.
    if (params.get('ask') === 'true') {
      if (user) {
        const prefilledTitle = params.get('title') || '';
        setCreatePrefillTitle(prefilledTitle);
        setShowCreate(true);
        window.history.replaceState({}, '', window.location.pathname);
      } else {
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
        api.get(`/community/${postId}`)
          .then((res) => {
            const post = res.data;
            if (post && post._id) {
              setSelectedPostId(postId);
              setPosts((prev) => [post, ...prev]);
            }
          })
          .catch(() => {});
      }
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [posts, user]);

  // Reset cursor + posts when filter/sort changes so we paginate the newly-filtered set
  useEffect(() => {
    setNextCursor(null);
    setPosts([]);
  }, [filter, sort, showAllPrograms, activeBatchId]);

  // When filter or sort changes — refresh posts (if no search active) or re-filter existing results
  useEffect(() => {
    if (search.trim()) {
      setSearchResults((prev) => {
        if (!prev.length) return prev;
        let filtered = [...prev];
        if (filter === 'answered') filtered = filtered.filter((p) => p.status === 'answered');
        else if (filter === 'unanswered') filtered = filtered.filter((p) => p.status === 'unanswered');
        if (sort === 'newest') filtered.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
        else if (sort === 'oldest') filtered.sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime());
        else if (sort === 'popular') filtered.sort((a, b) => (b.upvotes?.length ?? 0) - (a.upvotes?.length ?? 0));
        else if (sort === 'discussed') filtered.sort((a, b) => (b.comments?.length ?? 0) - (a.comments?.length ?? 0));
        return filtered;
      });
      return;
    }
    fetchPosts(true);
  }, [filter, sort, showAllPrograms, activeBatchId]);
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
      { rootMargin: '300px 0px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, nextCursor, filter, sort, showAllPrograms, activeBatchId, fetchPosts]);

  const runSemanticSearch = useCallback(async (q: string) => {
    setSearchLoading(true);
    try {
      const res = await api.get<{ results: Post[] }>('/community/search', {
        params: { q, batchId: showAllPrograms ? 'all' : activeBatchId }
      });
      setSearchResults(res.data.results || []);
    } catch (err) {
      console.error('Failed to load posts:', err);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [showAllPrograms, activeBatchId]);

  useEffect(() => {
    const q = search.trim();
    if (!q || q.length < 3) {
      setSearchResults([]);
    }
  }, [search]);

  // Show success toast when a manual sync completes
  useEffect(() => {
    if (!loading && syncing) {
      setSyncing(false);
      setToast('Community content synced');
      setTimeout(() => setToast(''), 2500);
    }
  }, [loading, syncing]);

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
    const url = window.location.origin + '/csfaq/community';
    try { await navigator.clipboard.writeText(url); } catch {}
    setToast('Community link copied');
    setTimeout(() => setToast(''), 2500);
  };

  const handleSync = () => {
    if (syncing || loading) return;
    setSyncing(true);
    fetchPosts(true);
  };

  const visible = (() => {
    let list = posts;

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const localFiltered = posts.filter(
        (p) =>
          p.title?.toLowerCase().includes(q) ||
          p.content?.toLowerCase().includes(q) ||
          p.author?.name?.toLowerCase().includes(q)
      );
      list = searchResults.length > 0 ? searchResults : localFiltered;
    }

    return [...list].sort((a, b) => {
      if (sort === 'newest') return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
      if (sort === 'oldest') return new Date(a.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
      if (sort === 'popular') return (b.upvotes?.length ?? 0) - (a.upvotes?.length ?? 0);
      if (sort === 'discussed') return (b.comments?.length ?? 0) - (a.comments?.length ?? 0);
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

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-20 sm:pt-24 pb-8 sm:pb-10 relative z-10">
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
            {/* Ask a Question button */}
            <button
              id="ask-question-btn"
              onClick={handleAskQuestion}
              className={buttonCommunityAsk}
              aria-label="Ask a question"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>Ask a Question</span>
            </button>

            {/* Sync Content button */}
            <button
              onClick={handleSync}
              className="h-9 px-3.5 rounded-xl border border-border bg-card flex items-center justify-center gap-1.5 text-xs text-ink-faint hover:text-ink hover:border-accent/30 transition-all disabled:opacity-50"
              disabled={syncing}
              aria-label="Sync community posts"
            >
              <svg className={`flex-shrink-0 transition-transform ${syncing ? 'animate-spin' : ''}`} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              <span className="hidden sm:inline">Sync Content</span>
              <span className="sm:hidden">Sync</span>
            </button>

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
          </div>
        </div>

        <CommunityHealth />
        {/* Search Bar, Quick Tags, Recent Searches, and Results Counter */}
        <div className="space-y-2 mb-4">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M10 10L12.5 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && search.trim()) {
                  saveToRecent(search.trim());
                  if (!e.shiftKey && search.trim().length >= 3) {
                    runSemanticSearch(search.trim());
                  }
                }
              }}
              placeholder="Search community discussions..."
              className="w-full pl-9 pr-16 py-2.5 rounded-xl border border-border bg-card text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 transition-all"
            />
            {!search && (
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-medium text-ink-faint bg-mist border border-border/80 rounded pointer-events-none">
                /
              </kbd>
            )}
            {search.trim() && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink text-xs font-semibold px-1"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
            {searchLoading && (
              <div className="absolute right-8 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Quick Clickable Search Tags */}
          

          {/* Recent Searches (persisted via localStorage) */}
          {recentSearches.length > 0 && !search && (
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              <span className="text-[11px] text-ink-faint font-medium mr-1">Recent:</span>
              {recentSearches.map((term) => (
                <button
                  key={term}
                  onClick={() => setSearch(term)}
                  className="px-2 py-0.5 rounded-lg bg-card border border-border/60 hover:border-accent/40 text-[11px] text-ink-soft hover:text-ink transition-all cursor-pointer"
                >
                  🕒 {term}
                </button>
              ))}
            </div>
          )}

          {/* Search Results Counter & Clear Link */}
          {search.trim() && (
            <div className="flex items-center justify-between px-1 py-1 text-xs text-ink-soft border-b border-border/50">
              <span>
                Showing results for <strong className="text-ink">"{search.trim()}"</strong> ({displayedPosts.length} found)
              </span>
              <button
                onClick={() => setSearch('')}
                className="text-accent hover:underline text-xs font-medium cursor-pointer"
              >
                Clear filter
              </button>
            </div>
          )}
        </div>

          {!loading && !error && (
          <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
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
                value={showAllPrograms ? 'all' : 'active'}
                onChange={(e) => setShowAllPrograms(e.target.value === 'all')}
                className="px-3 py-1.5 rounded-xl border border-border bg-card text-xs text-ink-soft focus:outline-none focus:ring-2 focus:ring-accent/25 cursor-pointer"
              >
                <option value="active">Active Program Feed</option>
                <option value="all">All Programs Feed</option>
              </select>
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

        {!loading && !searchLoading && !error && displayedPosts.length === 0 && total > 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center bg-card/40 rounded-2xl border border-border/60 p-6 my-4">
            <div className="w-12 h-12 rounded-xl bg-mist flex items-center justify-center mb-3 text-ink-faint">
              🔍
            </div>
            <p className="text-sm font-medium text-ink">
              {search.trim() ? `No results found for "${search.trim()}"` : 'No posts match your current filters'}
            </p>
            <p className="text-xs text-ink-faint mt-1 max-w-sm">
              {search.trim() 
                ? 'Try checking for spelling errors, using different keywords, or clear the search query.' 
                : 'Try switching your status filter or program feed.'}
            </p>
            {search.trim() && (
              <button
                onClick={() => setSearch('')}
                className="mt-3 px-3 py-1.5 text-xs font-medium bg-mist hover:bg-mist/80 text-ink rounded-lg transition-all"
              >
                Clear Search Query
              </button>
            )}
          </div>
        )}

        {!loading && !searchLoading && !error && displayedPosts.length > 0 && (
          <div className="space-y-3">
            {displayedPosts.map((post) => (
              <CommunityPostCard
                key={post._id}
                post={post}
                onClick={(p) => handleOpenThread(p._id)}
                currentUserId={user?._id}
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

      {selectedPostId && (
        <div className="fixed inset-0 z-30 bg-bg overflow-y-auto">
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