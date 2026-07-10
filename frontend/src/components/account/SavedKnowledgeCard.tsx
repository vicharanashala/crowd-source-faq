import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import api from '../../utils/api';

interface BookmarkedPost {
  _id: string;
  title: string;
  body?: string;
  status: string;
  createdAt: string;
}

export default function SavedKnowledgeCard() {
  const { user } = useAuth();
  const [bookmarks, setBookmarks] = useState<BookmarkedPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBookmarks = async () => {
      if (!user?._id) {
        setLoading(false);
        return;
      }

      try {
        const res = await api.get('/community/bookmarks');
        const bookmarkData = res.data.bookmarks || [];
        setBookmarks(bookmarkData.slice(0, 3)); // Show only first 3 items
      } catch (error) {
        console.error('Failed to load bookmarks:', error);
        setBookmarks([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBookmarks();
  }, [user]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-sm">
        <div className="animate-pulse">
          <div className="h-4 bg-border rounded mb-2"></div>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-border/70 bg-bg/70 px-3 py-3">
                <div className="h-3 bg-border rounded mb-1"></div>
                <div className="h-2 bg-border rounded w-3/4"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const getHintText = (post: BookmarkedPost) => {
    if (post.status === 'answered') return 'Answered post';
    if (post.status === 'unanswered') return 'Unanswered question';
    return 'Community post';
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Saved knowledge</h2>
          <p className="text-xs text-ink-faint mt-0.5">Your bookmarked questions and answers.</p>
        </div>
        <div className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent">
          {bookmarks.length} item{bookmarks.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="space-y-2">
        {bookmarks.length > 0 ? (
          bookmarks.map((post) => (
            <div key={post._id} className="flex items-center justify-between rounded-2xl border border-border/70 bg-bg/70 px-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink truncate">{post.title}</p>
                <p className="text-xs text-ink-faint">{getHintText(post)}</p>
              </div>
              <span className="text-xs font-medium text-accent ml-2 flex-shrink-0">Saved</span>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-border/70 bg-bg/70 px-3 py-3 text-center">
            <p className="text-sm text-ink-faint">No saved knowledge yet</p>
            <p className="text-xs text-ink-faint mt-1">Bookmark posts from the community</p>
          </div>
        )}
      </div>

      <Link to="/saved" className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-accent/80 transition-colors">
        <span>Open saved</span>
        <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
