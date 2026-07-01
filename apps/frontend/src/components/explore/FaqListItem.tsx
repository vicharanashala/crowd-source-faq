// Shared numbered list row for the public FAQ page.
// Used by Popular / Recent / Category / Search result lists.

import React from 'react';
import { highlightMatch, preview } from './highlightMatch';
import { formatReadTime, formatRelativeDate, trustBadge } from './format';
import type { PublicFaq } from './types';

interface FaqListItemProps {
  faq: PublicFaq;
  index: number;
  highlightQuery?: string;
  onClick?: () => void;
  /** Compact mode = single-line, no excerpt. */
  compact?: boolean;
  /** Show meta line ("12 Jun · 2 min read") instead of view count. */
  showDateInsteadOfViews?: boolean;
}

export function FaqListItem({
  faq,
  index,
  highlightQuery,
  onClick,
  compact = false,
  showDateInsteadOfViews = false,
}: FaqListItemProps): React.ReactElement {
  const badge = trustBadge(faq.trustLevel);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left flex items-start gap-3 py-2.5 px-2 -mx-2 rounded-xl hover:bg-cream/60 transition-colors duration-150"
    >
      <span className="shrink-0 w-6 h-6 rounded-md bg-cream text-ink-soft text-[11px] font-semibold flex items-center justify-center mt-0.5 tabular-nums">
        {index}
      </span>

      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-ink leading-snug line-clamp-2 group-hover:text-accent transition-colors">
          {highlightQuery
            ? highlightMatch(faq.question, highlightQuery)
            : faq.question}
        </h3>

        {!compact && (
          <p className="text-xs text-ink-soft mt-1 line-clamp-1">
            {highlightQuery
              ? highlightMatch(preview(faq.answer, 110), highlightQuery)
              : preview(faq.answer, 110)}
          </p>
        )}

        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="text-[11px] text-ink-faint bg-mist px-1.5 py-0.5 rounded">
            {faq.category}
          </span>
          {badge && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${badge.tone}`}>
              {badge.label}
            </span>
          )}
          {showDateInsteadOfViews ? (
            <span className="text-[11px] text-ink-faint">
              {formatRelativeDate(faq.createdAt)}
            </span>
          ) : (
            <span className="text-[11px] text-ink-faint">
              {faq.guestViewCount} {faq.guestViewCount === 1 ? 'view' : 'views'}
            </span>
          )}
          {faq.expectedReadMs > 0 && (
            <span className="text-[11px] text-ink-faint">
              · {formatReadTime(faq.expectedReadMs)}
            </span>
          )}
        </div>
      </div>

      <svg
        className="shrink-0 mt-1.5 text-ink-faint group-hover:text-accent transition-colors"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  );
}
