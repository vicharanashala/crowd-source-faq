import React from 'react';
import { getCategoryIcon, formatCategoryName, getQuestionTitle } from './faqUtils';
import type { FAQItem } from './faqUtils';
import {
  flexRowBetween,
  stackXs,
  surfaceCardHover,
  textBodyFaint,
  textHeaderSm,
  textLabelBold,
  textLabelXsBold,
  textNumeric,
  textXs,
  textXsLabel,
} from '../../styles/style_config';

interface CategoryCardProps {
  name: string;
  count: number;
  items: FAQItem[];
  onSelect: () => void;
}

/**
 * Single category card for the FAQ landing grid.
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
      className={`${surfaceCardHover} group block w-full text-left p-5 hover:-translate-y-0.5 transition-all duration-300 ease-smooth`}
    >
      {/* Top row: icon in accent tile (left) + count pill (right) */}
      <div className={`${flexRowBetween} mb-3.5`}>
        <span className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center transition-colors group-hover:bg-accent/15">
          {getCategoryIcon(name)}
        </span>
        <span className="text-[10px] font-medium text-ink-soft bg-mist px-2.5 py-1 rounded-full">
          {count} {count === 1 ? 'question' : 'questions'}
        </span>
      </div>

      {/* Title */}
      <h3 className={`${textHeaderSm} leading-snug mb-3.5 line-clamp-2`}>
        {categoryNumber ? `${categoryNumber}. ` : ''}{formatCategoryName(name)}
      </h3>

      {/* Top questions — numbered list of the first 2 FAQs in this category */}
      {topTwo.length > 0 && (
        <div className="mb-4">
          <p className={`${textLabelXsBold} mb-2`}>
            Top questions
          </p>
          <ol className={stackXs}>
            {topTwo.map((q, i) => (
              <li
                key={q._id}
                className={`${textXs} ${textBodyFaint} flex gap-1.5 leading-snug`}
              >
                <span className={`${textBodyFaint} shrink-0 ${textNumeric}`}>{catPrefix}{i + 1}.</span>
                <span className="truncate">{getQuestionTitle(q)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Explore all CTA — accent, arrow nudges right on hover */}
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
