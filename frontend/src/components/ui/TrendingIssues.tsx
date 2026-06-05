import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import type { Post } from '../../types/ui';

export default function TrendingIssues() {
  const [issues, setIssues] = useState<Post[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/community')
      .then((res) => {
        const allPosts = (res.data.posts || res.data) as Post[];
        const answered = allPosts
          .filter((p) => p.status === 'answered')
          .slice(0, 5);
        if (answered.length < 5) {
          const remaining = allPosts
            .filter((p) => p.status !== 'answered')
            .slice(0, 5 - answered.length);
          setIssues([...answered, ...remaining]);
        } else {
          setIssues(answered);
        }
      })
      .catch(() => setIssues([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-card rounded-2xl border border-border p-6 shadow-subtle animate-pulse">
        <div className="h-5 w-32 bg-mist rounded mb-5" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex justify-between py-3">
            <div className="h-4 bg-mist rounded w-2/3" />
            <div className="h-5 bg-mist rounded w-14" />
          </div>
        ))}
      </div>
    );
  }

  if (!issues.length) return null;

  return (
    <div className="bg-card rounded-2xl border border-border p-6 shadow-subtle">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          <h3 className="font-serif text-lg text-ink">Trending Issues</h3>
          <svg width="22" height="12" viewBox="0 0 22 12" style={{ opacity: 0.15 }}>
            <path d="M1 8 Q5 1 11 6 Q17 11 21 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          </svg>
        </div>
        <button
          onClick={() => navigate('/community')}
          className="text-sm text-ink-soft hover:text-accent transition-colors cursor-pointer flex items-center gap-1"
        >
          View all
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
      </div>

      <div className="space-y-0.5">
        {issues.map((issue) => (
          <div
            key={issue._id}
            onClick={() => navigate(`/community?post=${issue._id}`)}
            className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-bg transition-colors cursor-pointer group"
          >
            <span className="text-sm text-ink group-hover:text-accent transition-colors line-clamp-1">
              {issue.title}
            </span>
            <span className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium ${
              issue.status === 'answered'
                ? 'bg-success-light text-success'
                : 'bg-warning-light text-warning'
            }`}>
              {issue.status === 'answered' ? 'Solved' : 'Open'}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-5 pt-4 border-t border-border/50 flex items-center justify-center gap-2 text-xs text-ink-soft">
        <svg width="28" height="14" viewBox="0 0 28 14" style={{ opacity: 0.15 }}>
          <path d="M2 10 C6 3, 10 3, 14 7 C18 11, 22 11, 26 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </svg>
        <span>Check what others are solving!</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
          <line x1="9" y1="9" x2="9.01" y2="9"/>
          <line x1="15" y1="9" x2="15.01" y2="9"/>
        </svg>
      </div>
    </div>
  );
}