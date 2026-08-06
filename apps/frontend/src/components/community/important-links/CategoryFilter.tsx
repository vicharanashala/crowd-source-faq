/**
 * CategoryFilter.tsx — Reusable, controlled category filter pill bar.
 *
 * Frontend filtering only: this component holds no data and calls no API.
 * It just renders "All" + one pill per category and reports the selected
 * value via `onChange`. The parent (ImportantLinksTab) owns the actual
 * `links.filter(...)` logic.
 *
 * Styled with plain Tailwind utilities that match the pill conventions
 * already used elsewhere in the app (rounded-full pills, accent-tinted
 * active state) rather than reusing `NavPills`, which is hard-wired to
 * `react-router-dom` `NavLink`s and app-level routes — not a fit for a
 * same-page, non-navigating filter.
 */

import React from 'react';
import { IMPORTANT_LINK_CATEGORIES, type LinkCategory } from './types';

export type CategoryFilterValue = LinkCategory | 'All';

export interface CategoryFilterProps {
  /** Defaults to the standard Important Links category set. */
  categories?: readonly LinkCategory[];
  selected: CategoryFilterValue;
  onChange: (category: CategoryFilterValue) => void;
  className?: string;
}

export default function CategoryFilter({
  categories = IMPORTANT_LINK_CATEGORIES,
  selected,
  onChange,
  className = '',
}: CategoryFilterProps) {
  const options: CategoryFilterValue[] = ['All', ...categories];

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {options.map((option) => {
        const isActive = option === selected;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={isActive}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              isActive
                ? 'bg-accent text-accent-text border-accent'
                : 'bg-card text-ink-soft border-border hover:border-accent/40 hover:text-ink'
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
