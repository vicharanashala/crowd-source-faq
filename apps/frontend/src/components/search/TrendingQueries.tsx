import React, { useEffect, useState, type ReactNode } from 'react';
import api from '../../utils/api';
import type { TrendingQuery } from '../../types/ui';

// Icon pool for popular searches
const searchIcons: ReactNode[] = [
  <svg key="gear" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>,
  <svg key="key" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
  </svg>,
  <svg key="dot" width="16" height="16" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="5" fill="#e74c3c" opacity="0.7"/>
  </svg>,
  <svg key="box" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
  </svg>,
  <svg key="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>,
];

function CheckmarkIcon(): ReactNode {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5a9a6b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

interface TrendingQueriesProps {
  onQueryClick?: (query: string) => void;
}

export default function TrendingQueries({ onQueryClick }: TrendingQueriesProps) {
  const [trending, setTrending] = useState<TrendingQuery[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    api.get('/search/trending')
      .then((res) => setTrending((res.data.trending || []) as TrendingQuery[]))
      .catch(() => setTrending([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mt-3 bg-card rounded-2xl border border-border p-5 shadow-subtle animate-pulse">
        <div className="h-3.5 bg-mist rounded w-28 mb-4" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 py-2.5">
            <div className="w-4 h-4 bg-mist rounded" />
            <div className="h-3.5 bg-mist rounded flex-1" />
          </div>
        ))}
      </div>
    );
  }

  if (!trending.length) return null;

  return (
    <div className="mt-3 bg-card rounded-2xl border border-border p-5 shadow-subtle">
      <p className="text-xs font-medium text-ink-soft mb-3">
        Popular Searches
      </p>
      <div className="space-y-0.5">
        {trending.slice(0, 5).map((item, i) => (
          <button
            key={item.query}
            onClick={() => onQueryClick?.(item.query)}
            className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-sm text-ink hover:bg-bg transition-colors text-left cursor-pointer group"
          >
            <span className="flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity text-ink-soft">
              {i === trending.length - 1 ? <CheckmarkIcon /> : (searchIcons[i % searchIcons.length])}
            </span>
            <span className="group-hover:translate-x-0.5 transition-transform capitalize">
              {item.query}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}