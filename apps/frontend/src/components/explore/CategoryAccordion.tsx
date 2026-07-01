// Collapsible category section in the "All Categories" list on the
// public FAQ page. Each accordion reveals a count + top FAQs (lazy
// loaded on first expand). A small search box inside lets the user
// filter within that category.

import React, { useState } from 'react';
import { highlightMatch } from './highlightMatch';
import { useCategories } from './usePublicFaqApi';
import type { PublicCategory, PublicFaq } from './types';
import { FaqListItem } from './FaqListItem';
import { CardSkeleton, EmptyState } from './ExploreSkeleton';

interface CategoryAccordionProps {
  category: PublicCategory;
  batchId: string | null;
  /** v1.69 — optional course filter (from the home page picker). */
  courseId?: string | null;
  onSelectFaq: (faq: PublicFaq) => void;
  /** Ref to scroll to when targeted from the sidebar. */
  scrollAnchorRef?: React.RefObject<HTMLDivElement>;
  /** When set, the accordion opens itself on mount. */
  openOnMount?: boolean;
  /** Internal category filter — pre-applied when arriving from sidebar. */
  highlightQuery?: string;
}

export function CategoryAccordion({
  category,
  batchId,
  courseId,
  onSelectFaq,
  scrollAnchorRef,
  openOnMount = false,
  highlightQuery,
}: CategoryAccordionProps): React.ReactElement {
  const [open, setOpen] = useState(openOnMount);
  const [filter, setFilter] = useState('');

  // Lazy-load the top FAQs only on first open (the categories endpoint
  // without ?withTop= doesn't return them — saves bandwidth on the
  // initial page load).
  const { data, loading } = useCategories(open && !category.topFaqs ? batchId : null, courseId ?? undefined, true, 3);
  const resolved: PublicCategory = category.topFaqs
    ? category
    : data?.categories.find((c) => c.name === category.name) ?? category;
  const topFaqs = resolved.topFaqs ?? [];

  const filtered = filter.trim().length >= 2
    ? topFaqs.filter((f) => {
        const q = filter.toLowerCase();
        return (
          f.question.toLowerCase().includes(q) ||
          f.answer.toLowerCase().includes(q) ||
          f.tags.some((t) => t.toLowerCase().includes(q))
        );
      })
    : topFaqs;

  return (
    <div
      ref={scrollAnchorRef}
      className="bg-card rounded-2xl border border-border overflow-hidden scroll-mt-32"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-5 hover:bg-cream/40 transition-colors text-left"
        aria-expanded={open}
        aria-controls={`cat-panel-${category.name.replace(/\s+/g, '-')}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 w-9 h-9 rounded-xl bg-cream text-accent flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 7h18M3 12h18M3 17h12" />
            </svg>
          </span>
          <div className="min-w-0">
            <h3 className="font-serif text-lg text-ink leading-snug truncate">
              {highlightQuery
                ? highlightMatch(category.name, highlightQuery)
                : category.name}
            </h3>
            <p className="text-xs text-ink-soft mt-0.5">
              {category.count} {category.count === 1 ? 'FAQ' : 'FAQs'}
            </p>
          </div>
        </div>
        <span
          className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-ink-faint transition-transform duration-200 ${
            open ? 'rotate-90' : ''
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </span>
      </button>

      {open && (
        <div
          id={`cat-panel-${category.name.replace(/\s+/g, '-')}`}
          className="px-5 pb-5 border-t border-border/60 animate-fade-in"
        >
          <div className="relative mt-4 mb-3">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </div>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={`Search within "${category.name}"…`}
              aria-label={`Search within ${category.name}`}
              className="w-full pl-9 pr-3 py-2 rounded-full text-xs bg-cream border border-border/60 focus:outline-none focus:border-accent/50 text-ink placeholder-ink-faint"
            />
          </div>

          {loading ? (
            <CardSkeleton rows={3} />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={filter.length >= 2 ? 'No matches in this category' : 'No FAQs in this category yet'}
            />
          ) : (
            <ol className="space-y-0">
              {filtered.map((faq, i) => (
                <li key={faq._id}>
                  <FaqListItem
                    faq={faq}
                    index={i + 1}
                    highlightQuery={filter.length >= 2 ? filter : undefined}
                    showDateInsteadOfViews
                    onClick={() => onSelectFaq(faq)}
                  />
                </li>
              ))}
            </ol>
          )}

          {filtered.length > 0 && !filter && (
            <p className="text-[11px] text-ink-faint mt-3">
              Showing top {filtered.length} of {category.count}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
