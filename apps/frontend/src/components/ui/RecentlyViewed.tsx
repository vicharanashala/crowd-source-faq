import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const STORAGE_KEY = 'yaksha_recently_viewed';
const MAX_ITEMS = 5;

export interface ViewedItem {
  _id: string;
  question: string;
  category: string;
  viewedAt: number;
}

export function addRecentlyViewed(item: { _id: string; question: string; category?: string }) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const items: ViewedItem[] = raw ? JSON.parse(raw) : [];
    const filtered = items.filter((i) => i._id !== item._id);
    filtered.unshift({
      _id: item._id,
      question: item.question.slice(0, 60),
      category: item.category || 'General',
      viewedAt: Date.now(),
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered.slice(0, MAX_ITEMS)));
  } catch {
    /* storage may be full */
  }
}

export default function RecentlyViewed() {
  const [items, setItems] = useState<ViewedItem[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="mt-14" aria-labelledby="recently-viewed-heading">
      <div className="flex items-center justify-between mb-4">
        <h2 id="recently-viewed-heading" className="font-serif text-lg sm:text-xl text-ink flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          Recently Viewed
        </h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item._id}
            onClick={() => navigate(`/faq/${item._id}`)}
            className="group flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border bg-card hover:bg-mist hover:border-accent/30 transition-all text-left cursor-pointer"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-accent bg-accent/10 px-1.5 py-0.5 rounded shrink-0">
              {item.category.slice(0, 12)}
            </span>
            <span className="text-xs text-ink-soft group-hover:text-ink transition-colors line-clamp-1 max-w-[160px]">
              {item.question}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
