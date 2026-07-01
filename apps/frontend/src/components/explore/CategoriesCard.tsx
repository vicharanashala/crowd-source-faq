// "Browse Categories" sidebar card on the public FAQ page.
// Shows a flat list of categories sorted by count. Clicking a category
// scrolls to the matching accordion in the categories section below.

import React from 'react';
import { CardSection } from './CardSection';
import { CardSkeleton, EmptyState } from './ExploreSkeleton';
import { useCategories } from './usePublicFaqApi';

function TagIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

interface CategoriesCardProps {
  batchId: string | null;
  /** v1.69 — optional course filter (from the home page picker). */
  courseId?: string | null;
  onSelectCategory: (name: string) => void;
}

export function CategoriesCard({ batchId, courseId, onSelectCategory }: CategoriesCardProps): React.ReactElement {
  const { data, loading } = useCategories(batchId, courseId, false);
  const visible = data?.categories.slice(0, 8) ?? [];
  const more = Math.max(0, (data?.categories.length ?? 0) - visible.length);

  return (
    <CardSection
      icon={<TagIcon />}
      title="Browse Categories"
      rightAction={
        data ? (
          <span className="text-[10px] text-ink-faint uppercase tracking-wider font-semibold">
            {data.totalCategories} {data.totalCategories === 1 ? 'topic' : 'topics'}
          </span>
        ) : null
      }
    >
      {loading ? (
        <CardSkeleton rows={5} />
      ) : !data || data.categories.length === 0 ? (
        <EmptyState title="No categories yet" />
      ) : (
        <ul className="space-y-0">
          {visible.map((cat) => (
            <li key={cat.name}>
              <button
                type="button"
                onClick={() => onSelectCategory(cat.name)}
                className="group w-full flex items-center justify-between py-2.5 px-2 -mx-2 rounded-xl hover:bg-cream/60 transition-colors duration-150"
              >
                <span className="text-sm font-medium text-ink group-hover:text-accent transition-colors line-clamp-1 text-left">
                  {cat.name}
                </span>
                <span className="flex items-center gap-2 text-[11px] text-ink-faint">
                  {cat.count}
                  <svg className="text-ink-faint group-hover:text-accent transition-colors"
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </span>
              </button>
            </li>
          ))}
          {more > 0 && (
            <li className="pt-2 border-t border-border/60 mt-2">
              <button
                type="button"
                onClick={() => onSelectCategory('')}
                className="text-xs text-accent font-medium hover:underline px-2"
              >
                + {more} more {more === 1 ? 'category' : 'categories'} below
              </button>
            </li>
          )}
        </ul>
      )}
    </CardSection>
  );
}
