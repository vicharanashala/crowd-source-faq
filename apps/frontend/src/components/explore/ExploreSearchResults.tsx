// Search results list — used below the sticky search bar when the user
// has typed a query. Renders matched FAQs with highlighted terms.

import React from 'react';
import { FaqListItem } from './FaqListItem';
import { SearchSkeleton, EmptyState } from './ExploreSkeleton';
import { usePublicFaqSearch } from './usePublicFaqApi';
import type { PublicFaq } from './types';

interface ExploreSearchResultsProps {
  query: string;
  category: string | null;
  batchId: string | null;
  /** v1.69 — optional course filter (from the home page picker). */
  courseId?: string | null;
  onSelectFaq: (faq: PublicFaq) => void;
  onClear: () => void;
}

export function ExploreSearchResults({
  query,
  category,
  batchId,
  courseId,
  onSelectFaq,
  onClear,
}: ExploreSearchResultsProps): React.ReactElement | null {
  const { data, loading, error } = usePublicFaqSearch(batchId, courseId, query, category);

  if (query.length < 2) return null;

  return (
    <section
      className="bg-card rounded-2xl border border-border p-5 mt-4"
      aria-label="Search results"
    >
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-ink">
          {loading
            ? 'Searching…'
            : error
            ? 'Search failed'
            : data
            ? `${data.count} ${data.count === 1 ? 'result' : 'results'} for "${data.query}"`
            : 'Searching…'}
        </h2>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-ink-soft hover:text-ink transition-colors"
        >
          Clear search
        </button>
      </header>

      {loading ? (
        <SearchSkeleton />
      ) : error ? (
        <EmptyState title={error} hint="Please try a different search." />
      ) : !data || data.faqs.length === 0 ? (
        <EmptyState
          title="No matches found"
          hint={`Try a shorter keyword${category ? ' or remove the category filter' : ''}.`}
        />
      ) : (
        <ol className="space-y-0">
          {data.faqs.map((faq, i) => (
            <li key={faq._id}>
              <FaqListItem
                faq={faq}
                index={i + 1}
                highlightQuery={data.query}
                onClick={() => onSelectFaq(faq)}
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
