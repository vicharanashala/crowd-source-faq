// "Recent FAQs" card on the public FAQ page.

import React from 'react';
import { CardSection } from './CardSection';
import { CardSkeleton, EmptyState } from './ExploreSkeleton';
import { FaqListItem } from './FaqListItem';
import { useRecentFaqs } from './usePublicFaqApi';
import type { PublicFaq } from './types';

function ClockIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  );
}

interface RecentFaqsCardProps {
  batchId: string | null;
  /** v1.69 — optional course filter (from the home page picker). */
  courseId?: string | null;
  onSelectFaq: (faq: PublicFaq) => void;
}

export function RecentFaqsCard({ batchId, courseId, onSelectFaq }: RecentFaqsCardProps): React.ReactElement {
  const { data, loading } = useRecentFaqs(batchId, courseId, 5);

  return (
    <CardSection
      icon={<ClockIcon />}
      title="Recent FAQs"
      rightAction={
        <span className="text-[10px] text-ink-faint uppercase tracking-wider font-semibold">
          Newest
        </span>
      }
    >
      {loading ? (
        <CardSkeleton rows={5} />
      ) : !data || data.faqs.length === 0 ? (
        <EmptyState
          title="No FAQs yet"
          hint="Once an admin publishes FAQs they will appear here."
        />
      ) : (
        <ol className="space-y-0">
          {data.faqs.map((faq, i) => (
            <li key={faq._id}>
              <FaqListItem
                faq={faq}
                index={i + 1}
                showDateInsteadOfViews
                onClick={() => onSelectFaq(faq)}
              />
            </li>
          ))}
        </ol>
      )}
    </CardSection>
  );
}
