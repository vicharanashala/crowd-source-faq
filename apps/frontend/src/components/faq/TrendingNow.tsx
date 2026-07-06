// TrendingNow — "🔥 Trending" section for the FAQ homepage
// Shows FAQs sorted by view velocity (viewsLast24h + guestViewCount)

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { useBatch } from '../../context/BatchContext';
import { FAQItem, getCategoryIcon } from './faqUtils';

interface TrendingNowProps {
  limit?: number;
}

interface GroupedResponse {
  grouped: Record<string, FAQItem[]>;
}

export default function TrendingNow({ limit = 6 }: TrendingNowProps) {
  const { currentBatch } = useBatch();
  const batchId = currentBatch?._id ?? null;
  const navigate = useNavigate();
  const [trending, setTrending] = useState<FAQItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!batchId) return;
    let cancelled = false;

    api.get<GroupedResponse>('/faq', { params: { batchId, limit: 30 } })
      .then((res) => {
        if (cancelled) return;
        const all: FAQItem[] = Object.values(res.data.grouped ?? {}).flat() as FAQItem[];

        const sorted = [...all]
          .filter((f) => ((f as any).viewsLast24h ?? 0) > 0 || ((f as any).guestViewCount ?? 0) > 0)
          .sort((a, b) => {
            const aViews = ((a as any).viewsLast24h ?? 0) + ((a as any).guestViewCount ?? 0);
            const bViews = ((b as any).viewsLast24h ?? 0) + ((b as any).guestViewCount ?? 0);
            return bViews - aViews;
          })
          .slice(0, limit);

        setTrending(sorted);
      })
      .catch(() => {
        // Silently fail — not critical
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [batchId, limit]);

  if (loading || trending.length === 0) return null;

  return (
    <section className="w-full">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-ink">🔥 Trending Now</h2>
        <span className="text-xs text-ink-faint bg-mist px-2.5 py-1 rounded-full">
          Last 24h
        </span>
      </div>

      {/* Horizontal scroll on mobile, grid on desktop */}
      <div className="flex gap-3 overflow-x-auto pb-2 sm:overflow-visible sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:pb-0 sm:gap-4">
        {trending.map((faq, index) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const Icon = getCategoryIcon(faq.category) as unknown as React.ComponentType<{ className?: string }>;
          const totalViews = ((faq as any).viewsLast24h ?? 0) + ((faq as any).guestViewCount ?? 0);

          return (
            <button
              key={faq._id}
              onClick={() => navigate(`/faq/${faq._id}`)}
              className="group flex-shrink-0 w-[260px] sm:w-auto flex flex-col gap-3 p-4 rounded-2xl border border-border/50 bg-card hover:bg-accent-light hover:border-accent/30 hover:shadow-[0_4px_20px_rgba(90,122,90,0.08)] transition-all duration-250 text-left"
            >
              {/* Rank + Icon row */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  {/* Rank badge */}
                  <span className={`
                    flex items-center justify-center w-6 h-6 rounded-lg text-xs font-bold shrink-0
                    ${index === 0 ? 'bg-amber-100 text-amber-700' :
                      index === 1 ? 'bg-slate-100 text-slate-500' :
                      index === 2 ? 'bg-orange-50 text-orange-600' :
                      'bg-mist text-ink-faint'}
                  `}>
                    {index + 1}
                  </span>
                  {/* Category icon */}
                  <div className="w-7 h-7 rounded-lg bg-mist border border-border/50 flex items-center justify-center">
                    {Icon && <Icon className="w-3.5 h-3.5 text-ink-soft" />}
                  </div>
                </div>

                {/* View count */}
                <div className="flex items-center gap-1 text-ink-faint">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                  <span className="text-[11px]">{totalViews}</span>
                </div>
              </div>

              {/* Question */}
              <p className="text-sm font-medium text-ink leading-snug line-clamp-2 group-hover:text-accent transition-colors flex-1">
                {faq.question}
              </p>

              {/* Category pill */}
              <span className="self-start text-xs text-ink-faint bg-mist px-2 py-0.5 rounded-full border border-border/30">
                {faq.category}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}