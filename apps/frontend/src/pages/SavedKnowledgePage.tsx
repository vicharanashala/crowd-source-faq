import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Footer from '../components/layout/Footer';
import CommunityPostCard from '../components/community/CommunityPostCard';
import ThreadDetail from '../components/community/ThreadDetail';
import { CommunityDoodles } from '../components/ui/PageDoodles';
import QuestionList from '../components/faq/QuestionList';
import type { FAQItem } from '../components/faq/faqUtils';
import api from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import type { Post } from '../types/ui';

// --- Main Page ----------------------------------------------------------------
export default function SavedKnowledgePage() {
  const { user, isAuthenticated, fetchUser } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'community' | 'faqs'>('community');
  
  const [posts, setPosts] = useState<Post[]>([]);
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, loading, navigate]);

  const fetchData = useCallback(() => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError('');
    
    if (activeTab === 'community') {
      api.get('/community/bookmarks')
        .then((res) => {
          setPosts(res.data.bookmarks || []);
        })
        .catch(() => setError('Failed to load saved community posts.'))
        .finally(() => setLoading(false));
    } else {
      api.get('/faq/saved/items')
        .then((res) => {
          setFaqs(res.data.savedFaqs || []);
        })
        .catch(() => setError('Failed to load saved FAQs.'))
        .finally(() => setLoading(false));
    }
  }, [activeTab, isAuthenticated]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenThread = useCallback((post: Post) => {
    setSelectedPostId(post._id);
  }, []);

  const handleCloseThread = useCallback(() => {
    setSelectedPostId(null);
    fetchData();
  }, [fetchData]);

  const handleToggleBookmark = useCallback(async (postId: string) => {
    setPosts(prev => prev.filter(p => p._id !== postId));
    try {
      await api.post(`/community/${postId}/bookmark`);
    } catch {
      fetchData();
    }
  }, [fetchData]);

  // For FAQs, when a user clicks the bookmark button in QuestionList or QuestionDetail,
  // we would ideally re-fetch.
  const handleToggleFaqSave = async (faqId: string) => {
    setFaqs(prev => prev.filter(f => f._id !== faqId));
    try {
      await api.post(`/faq/${faqId}/save`);
      await fetchUser(); // Update user context so icons reflect new state
    } catch {
      fetchData();
    }
  };

  return (
    <div className="min-h-screen bg-bg grid-bg relative">
      <CommunityDoodles />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-20 sm:pt-24 pb-8 sm:pb-10 relative z-10">

        <div className="flex items-start justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-serif text-ink tracking-tight">
              My Saved Knowledge
            </h1>
            <p className="mt-1 sm:mt-1.5 text-xs sm:text-sm text-ink-soft truncate">
              Questions and answers you've bookmarked for later
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-6 border-b border-border/60 pb-1">
          <button 
            onClick={() => setActiveTab('community')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'community' ? 'border-accent text-accent' : 'border-transparent text-ink-soft hover:text-ink'}`}
          >
            Community Posts {!loading && activeTab === 'community' && `(${posts.length})`}
          </button>
          <button 
            onClick={() => setActiveTab('faqs')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'faqs' ? 'border-accent text-accent' : 'border-transparent text-ink-soft hover:text-ink'}`}
          >
            Official FAQs {!loading && activeTab === 'faqs' && `(${faqs.length})`}
          </button>
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

        {/* Empty State */}
        {!loading && !error && activeTab === 'community' && posts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-mist flex items-center justify-center mb-4">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" className="text-ink-faint" strokeWidth="1.5">
                <path d="M6 5H22L20 21H8L6 5Z" strokeLinejoin="round"/>
                <path d="M11 21V12H17V21" strokeLinejoin="round"/>
                <path d="M11 9V7C11 5.343 12.343 4 14 4C15.657 4 17 5.343 17 7V9"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-ink-soft">No saved community posts yet</p>
            <p className="text-xs text-ink-faint mt-1">Bookmark questions from the community board to find them here later.</p>
            <button onClick={() => navigate('/community')} className="mt-4 px-4 py-2 rounded-xl bg-accent text-accent-text text-sm font-medium hover:bg-accent/90 transition-colors">Browse Community</button>
          </div>
        )}

        {!loading && !error && activeTab === 'faqs' && faqs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-mist flex items-center justify-center mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-ink-faint" strokeWidth="1.5">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-ink-soft">No saved FAQs yet</p>
            <p className="text-xs text-ink-faint mt-1">Bookmark official FAQs to easily reference them here later.</p>
            <button onClick={() => navigate('/faq')} className="mt-4 px-4 py-2 rounded-xl bg-accent text-accent-text text-sm font-medium hover:bg-accent/90 transition-colors">Browse FAQs</button>
          </div>
        )}

        {/* Results */}
        {!loading && !error && activeTab === 'community' && posts.length > 0 && (
          <div className="space-y-3">
            {posts.map(post => (
              <CommunityPostCard
                key={post._id}
                post={post}
                onClick={handleOpenThread}
                currentUserId={user?._id}
                onToggleBookmark={handleToggleBookmark}
              />
            ))}
          </div>
        )}

        {!loading && !error && activeTab === 'faqs' && faqs.length > 0 && (
          <QuestionList 
            items={faqs}
            loading={false}
            sortOption="recent"
            onSortChange={() => {}}
            visibleCount={faqs.length}
            onLoadMore={() => {}}
            emptyMessage="No saved FAQs yet."
            onSelect={(faq) => navigate(`/faq?id=${faq._id}`)}
          />
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

