// "Most Popular" card on the public FAQ page.

import React from 'react';
import { CardSection } from './CardSection';
import { CardSkeleton, EmptyState } from './ExploreSkeleton';
import { FaqListItem } from './FaqListItem';
import { usePopularFaqs } from './usePublicFaqApi';
import type { PublicFaq } from './types';

function TrendingIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

interface PopularFaqsCardProps {
  batchId: string | null;
  /** v1.69 — optional course filter (from the home page picker). */
  courseId?: string | null;
  onSelectFaq: (faq: PublicFaq) => void;
}

export function PopularFaqsCard({ batchId, courseId, onSelectFaq }: PopularFaqsCardProps): React.ReactElement {
  const { data, loading } = usePopularFaqs(batchId, courseId, 5);

  return (
    <CardSection
      icon={<TrendingIcon />}
      title="Most Popular"
      rightAction={
        <span className="text-[10px] text-ink-faint uppercase tracking-wider font-semibold">
          Last 7 days
        </span>
      }
    >
      {loading ? (
        <CardSkeleton rows={5} />
      ) : !data || data.faqs.length === 0 ? (
        <EmptyState
          title="No popular FAQs yet"
          hint="Check back after some readers have visited."
        />
      ) : (
        <ol className="space-y-0">
          {data.faqs.map((faq, i) => (
            <li key={faq._id}>
              <FaqListItem
                faq={faq}
                index={i + 1}
                onClick={() => onSelectFaq(faq)}
              />
            </li>
          ))}
        </ol>
      )}
    </CardSection>
  );
}
