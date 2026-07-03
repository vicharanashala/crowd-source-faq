import React from 'react';
import { getCategoryIcon, formatCategoryName, getQuestionTitle } from './faqUtils';
import type { FAQItem } from './faqUtils';

interface CategoryCardProps {
  name: string;
  count: number;
  items: FAQItem[];
  onSelect: () => void;
}

/**
 * Single category card for the FAQ landing grid.
 * Layout (from image 1 — sage-green themed card):
 *   ┌─────────────────────────────────────────┐
 *   │ [icon]                       [N questions]│
 *   │                                          │
 *   │ Category title (bold)                    │
 *   │                                          │
 *   │ TOP QUESTIONS                            │
 *   │ 1.  1.1 Question text...                 │
 *   │ 2.  1.2 Question text...                 │
 *   │                                          │
 *   │ Explore all →                            │
 *   └─────────────────────────────────────────┘
 *
 * White card, rounded-2xl, subtle border + shadow. Hover lifts and tints
 * the border accent. Clicking anywhere on the card fires onSelect.
 */
export default function CategoryCard({ name, count, items, onSelect }: CategoryCardProps) {
  const topTwo = items.slice(0, 2);
  const categoryNumber = items[0]?.categoryNumber;
  const catPrefix = categoryNumber ? `${categoryNumber}.` : '';

  return (
    <button
      onClick={onSelect}
      aria-label={`Explore ${formatCategoryName(name)} — ${count} questions`}
      className="group block w-full text-left bg-card rounded-2xl border border-border/60 shadow-subtle p-5 hover:shadow-card-hover hover:-translate-y-0.5 hover:border-accent/30 transition-all duration-300 ease-smooth"
    >
      {/* Top row: icon in sage circle (left) + count pill (right) */}
      <div className="flex items-start justify-between mb-3.5">
        <span className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center transition-colors group-hover:bg-accent/15">
          {getCategoryIcon(name)}
        </span>
        <span className="text-[10px] font-medium text-ink-soft bg-mist px-2.5 py-1 rounded-full">
          {count} {count === 1 ? 'question' : 'questions'}
        </span>
      </div>

      {/* Title */}
      <h3 className="text-base font-semibold text-ink leading-snug mb-3.5 line-clamp-2">
        {categoryNumber ? `${categoryNumber}. ` : ''}{formatCategoryName(name)}
      </h3>

      {/* Top questions — numbered list of the first 2 FAQs in this category */}
      {topTwo.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider mb-2">
            Top questions
          </p>
          <ol className="space-y-1.5">
            {topTwo.map((q, i) => (
              <li
                key={q._id}
                className="text-xs text-ink-soft flex gap-1.5 leading-snug"
              >
                <span className="text-ink-faint shrink-0 tabular-nums">{catPrefix}{i + 1}.</span>
                <span className="truncate">{getQuestionTitle(q)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Explore all CTA — accent green, arrow nudges right on hover */}
      <div className="flex items-center gap-1 text-xs font-semibold text-accent pt-3 border-t border-border/40">
        <span>Explore all</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform duration-300 group-hover:translate-x-0.5"
          aria-hidden="true"
        >
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}
