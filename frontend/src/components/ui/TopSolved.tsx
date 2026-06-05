import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';

interface SolvedPost {
  _id: string;
  title: string;
  body?: string;
  answer?: string;
  status: string;
  upvotes?: string[];
  comments?: unknown[];
  author?: { name?: string };
  updatedAt: string;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function CheckCircleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  );
}

function ThumbUpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
      <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

export default function TopSolved() {
  const [posts, setPosts] = useState<SolvedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/community/solved', { params: { limit: 4 } })
      .then((res) => {
        const data = res.data.posts || [];
        setPosts(data);
      })
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="mt-14">
        <div className="flex items-center gap-2 mb-5">
          <div className="h-5 w-5 bg-mist rounded animate-pulse" />
          <div className="h-5 w-44 bg-mist rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-card rounded-2xl border border-border p-5 animate-pulse">
              <div className="h-4 bg-mist rounded w-3/4 mb-2" />
              <div className="h-3 bg-mist rounded w-full mb-4" />
              <div className="h-6 bg-mist rounded w-28 mb-4" />
              <div className="h-px bg-border mb-3" />
              <div className="flex gap-3">
                <div className="h-3 bg-mist rounded w-12" />
                <div className="h-3 bg-mist rounded w-12" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  // Empty state — no posts resolved in last 24h
  if (!posts.length) {
    return (
      <section className="mt-14">
        <div className="flex items-center gap-2 mb-5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="6"/>
            <circle cx="12" cy="12" r="2"/>
          </svg>
          <h2 className="font-serif text-xl text-ink">Solved Recently</h2>
        </div>
        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-success-light mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <p className="text-sm font-medium text-ink">No posts resolved in the last 24 hours</p>
          <p className="text-xs text-ink-soft mt-1">Be the first to ask a question!</p>
          <button
            onClick={() => navigate('/community?ask=true')}
            className="mt-4 px-5 py-2 text-sm font-semibold text-ink border-[1.5px] border-ink rounded-full hover:bg-ink hover:text-white transition-all"
          >
            Ask a Question
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-14">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="6"/>
            <circle cx="12" cy="12" r="2"/>
          </svg>
          <h2 className="font-serif text-xl text-ink">Solved Recently</h2>
        </div>
        <button
          onClick={() => navigate('/community')}
          className="flex items-center gap-1 text-sm text-ink-soft hover:text-accent transition-colors cursor-pointer"
        >
          View all
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {posts.map((post) => (
          <article
            key={post._id}
            onClick={() => navigate(`/community?post=${post._id}`)}
            className="card-hover bg-card rounded-2xl border border-border p-5 cursor-pointer group"
          >
            {/* Solved badge + time */}
            <div className="flex items-center gap-1.5 mb-3">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-success-light text-success text-xs font-medium">
                <CheckCircleIcon />
                Solved
              </span>
              <span className="text-xs text-ink-faint">{formatRelativeTime(post.updatedAt)}</span>
            </div>

            {/* Title */}
            <h3 className="font-semibold text-sm mb-2 group-hover:text-accent transition-colors leading-snug line-clamp-2">
              {post.title}
            </h3>

            {/* Answer excerpt */}
            {post.answer && (
              <p className="text-xs text-ink-soft mb-4 leading-relaxed line-clamp-2 italic">
                "{post.answer}"
              </p>
            )}

            {/* Stats */}
            <div className="flex items-center justify-between pt-3 border-t border-border/50">
              <div className="flex items-center gap-3 text-xs text-ink-soft">
                <span className="flex items-center gap-1">
                  <ThumbUpIcon /> {post.upvotes?.length ?? 0}
                </span>
                <span className="flex items-center gap-1">
                  <CommentIcon /> {post.comments?.length ?? 0}
                </span>
              </div>
              {post.author?.name && (
                <span className="text-xs text-ink-faint truncate max-w-[80px]">
                  {post.author.name}
                </span>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}