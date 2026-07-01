import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import { FAQItem, getQuestionTitle, getAnswerText, formatDate, formatCategoryName, TrustBadge, SourceBadge } from './faqUtils';
import FreshnessBadge from '../faq/FreshnessBadge';

/* ── Chevron icon (rotates on expand) ── */
function ChevronDown() {
  return (
    <svg
      className="faq-item__chevron"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/* ── Single accordion FAQ card ── */
interface QuestionItemProps {
  item: FAQItem;
  isExpanded: boolean;
  onToggle: () => void;
}

export function QuestionItem({ item, isExpanded, onToggle }: QuestionItemProps) {
  const title = getQuestionTitle(item);
  const prefix = item.questionNumber ? `${item.questionNumber}. ` : '';
  const answer = getAnswerText(item);
  const metaDate = formatDate(item?.updatedAt || item?.createdAt);
  const sourceLabel = item?.source ? (item.source === 'faq' ? 'FAQ' : 'Community') : '';
  const showFreshness = item?.source === 'faq';

  return (
    <div className={`faq-item${isExpanded ? ' faq-item--expanded' : ''}`}>
      {/* Question row — always visible */}
      <div
        className="faq-item__question"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      >
        <span className="faq-item__question-text">
          <span className="text-ink-faint mr-1 tabular-nums">{prefix}</span>
          {title}
          <TrustBadge level={item.trustLevel} />
          <SourceBadge sourceType={item.sourceType} />
        </span>
        <ChevronDown />
      </div>

      {/* Expandable body */}
      <div className="faq-item__body">
        <div className="faq-item__body-content">
          {answer ? (
            <div className="faq-item__answer">{answer}</div>
          ) : (
            <div className="faq-item__answer" style={{ fontStyle: 'italic', opacity: 0.6 }}>
              No answer available yet.
            </div>
          )}

          <div className="faq-item__meta">
            {sourceLabel && (
              <span className="faq-item__meta-pill">{sourceLabel}</span>
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
    </div>
  );
}

/* ── Question list — accordion cards with sort + infinite scroll ── */
interface QuestionListProps {
  items: FAQItem[];
  loading: boolean;
  sortOption: string;
  onSortChange: (val: string) => void;
  onSelect?: (item: FAQItem) => void;  // kept for backward compat (search results)
  visibleCount: number;
  onLoadMore: () => void;
  emptyMessage: string;
}

export default function QuestionList({
  items,
  loading,
  sortOption,
  onSortChange,
  visibleCount,
  onLoadMore,
  emptyMessage,
}: QuestionListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleItem = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

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
    <div>
      {/* Sort bar */}
      <div className="faq-sort-bar">
        <span className="faq-sort-bar__count">
          {sortedItems.length} question{sortedItems.length !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-2">
          <span className="faq-sort-bar__count" style={{ fontSize: 11 }}>Sort</span>
          <select
            value={sortOption}
            onChange={(e) => onSortChange(e.target.value)}
            className="faq-sort-bar__select"
          >
            <option value="relevant">Most relevant</option>
            <option value="recent">Most recent</option>
          </select>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="faq-item animate-pulse" style={{ minHeight: 64 }}>
              <div className="h-4 rounded bg-mist w-3/4" />
            </div>
          ))}
        </div>
      )}

      {/* FAQ accordion cards */}
      {!loading && (
        <div className="space-y-4">
          {visibleItems.map((item, idx) => {
            const id = item._id || `faq-${idx}`;
            return (
              <QuestionItem
                key={id}
                item={item}
                isExpanded={expandedIds.has(id)}
                onToggle={() => toggleItem(id)}
              />
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!loading && sortedItems.length === 0 && (
        <div className="faq-item" style={{ textAlign: 'center', padding: '32px 20px' }}>
          <p className="faq-item__question-text" style={{ fontWeight: 400, opacity: 0.6 }}>
            {emptyMessage}
          </p>
        </div>
      )}

      {/* Infinite scroll sentinel */}
      {hasMore && <div ref={loadMoreRef} className="h-px" />}
    </div>
  );
}
