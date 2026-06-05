import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import { FAQItem, getQuestionTitle, getAnswerText, formatDate, formatCategoryName, TrustBadge, SourceBadge } from './faqUtils';
import FreshnessBadge from '../ui/FreshnessBadge';

interface QuestionItemProps {
  item: FAQItem;
  onSelect: (item: FAQItem) => void;
}

export function QuestionItem({ item, onSelect }: QuestionItemProps) {
  const title = getQuestionTitle(item);
  const answer = getAnswerText(item);
  const metaDate = formatDate(item?.updatedAt || item?.createdAt);
  const sourceLabel = item?.source ? (item.source === 'faq' ? 'FAQ' : 'Community') : '';
  // Freshness badge only renders for FAQ-sourced rows (community posts don't have review state)
  const showFreshness = item?.source === 'faq';

  return (
    <button
      onClick={() => onSelect(item)}
      className="w-full text-left px-5 py-4 hover:bg-cream transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink leading-snug line-clamp-2">
            {title}
            <TrustBadge level={item.trustLevel} />
            <SourceBadge sourceType={item.sourceType} />
          </p>
          {answer && (
            <p className="mt-1 text-xs text-ink-soft leading-relaxed line-clamp-2">
              {answer}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
            {sourceLabel && (
              <span className="px-2 py-0.5 rounded-full bg-mist text-ink-soft">
                {sourceLabel}
              </span>
            )}
            {item?.category && <span>{formatCategoryName(item.category)}</span>}
            {metaDate && <span>{metaDate}</span>}
            {showFreshness && (
              <FreshnessBadge
                reviewStatus={item.reviewStatus}
                lastVerifiedDate={item.lastVerifiedDate}
                reviewIntervalDays={item.reviewIntervalDays ?? 0}
                freshnessTier={item.freshnessTier}
                compact
              />
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

interface QuestionListProps {
  items: FAQItem[];
  loading: boolean;
  sortOption: string;
  onSortChange: (val: string) => void;
  onSelect: (item: FAQItem) => void;
  visibleCount: number;
  onLoadMore: () => void;
  emptyMessage: string;
}

export default function QuestionList({
  items,
  loading,
  sortOption,
  onSortChange,
  onSelect,
  visibleCount,
  onLoadMore,
  emptyMessage,
}: QuestionListProps) {
  const sortedItems = useMemo(() => {
    if (!Array.isArray(items)) return [];
    if (sortOption === 'recent') {
      return [...items].sort((a, b) => {
        const aDate = new Date(a?.createdAt || 0).getTime();
        const bDate = new Date(b?.createdAt || 0).getTime();
        return bDate - aDate;
      });
    }
    return items;
  }, [items, sortOption]);

  const visibleItems = sortedItems.slice(0, visibleCount);
  const hasMore = visibleCount < sortedItems.length;
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasMore && !loading) {
        onLoadMore();
      }
    },
    [hasMore, loading, onLoadMore]
  );

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleIntersect, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleIntersect]);

  return (
    <div className="bg-card rounded-2xl border border-border shadow-subtle overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border/60">
        <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide">
          {sortedItems.length} questions
        </p>
        <div className="flex items-center gap-2 text-xs text-ink-soft">
          <span>Sort</span>
          <select
            value={sortOption}
            onChange={(e) => onSortChange(e.target.value)}
            className="rounded-full border border-border bg-card px-3 py-1 text-xs text-ink focus:outline-none"
          >
            <option value="relevant">Most relevant</option>
            <option value="recent">Most recent</option>
          </select>
        </div>
      </div>

      <div className="divide-y divide-border/60">
        {loading && (
          <div className="p-5 space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-xl bg-mist" />
            ))}
          </div>
        )}

        {!loading && visibleItems.map((item, idx) => (
          <QuestionItem
            key={item._id || item.title || item.question || idx}
            item={item}
            onSelect={onSelect}
          />
        ))}

        {!loading && sortedItems.length === 0 && (
          <div className="px-5 py-6 text-sm text-ink-soft">
            {emptyMessage}
          </div>
        )}

        {hasMore && <div ref={loadMoreRef} className="h-px" />}
      </div>
    </div>
  );
}
