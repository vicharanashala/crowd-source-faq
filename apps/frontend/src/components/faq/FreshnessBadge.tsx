import React from 'react';
import {
  badgeCompact,
  badgePendingReview,
  badgeUpdateRequested,
  badgeVerified,
  badgeVerifiedBold,
  badgeVerifiedWarn,
} from '../../styles/style_config';
interface FreshnessBadgeProps {
  reviewStatus: 'verified' | 'pending_review' | 'update_requested' | undefined;
  lastVerifiedDate: string | Date | undefined;
  reviewIntervalDays: number;
  freshnessTier: 'evergreen' | 'seasonal' | 'volatile' | undefined;
  compact?: boolean;
}
function daysSince(date: Date): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}
export default function FreshnessBadge({
  reviewStatus = 'verified',
  lastVerifiedDate,
  reviewIntervalDays,
  freshnessTier,
  compact = false,
}: FreshnessBadgeProps) {
  if (!lastVerifiedDate) return null;
  const days = daysSince(new Date(lastVerifiedDate));
  const isEvergreen = freshnessTier === 'evergreen' || !freshnessTier;
  if (reviewStatus === 'pending_review') {
    return (
      <span
        className={`${badgePendingReview} ${compact ? badgeCompact : ''}`}
        title="This answer is being re-checked against the latest information."
      >
        ⏳ Under review
      </span>
    );
  }
  if (reviewStatus === 'update_requested') {
    return (
      <span
        className={`${badgeUpdateRequested} ${compact ? badgeCompact : ''}`}
        title="A community member has flagged this answer as possibly outdated."
      >
        ⚠ Update requested
      </span>
    );
  }
  if (isEvergreen) {
    return (
      <span
        className={`${badgeVerified} ${compact ? '' : 'font-medium'}`}
        title="This answer covers timeless information and doesn't need periodic re-review."
      >
        ✓ Verified
      </span>
    );
  }
  const nearingExpiry = reviewIntervalDays > 0 && days >= reviewIntervalDays * 0.8;
  if (nearingExpiry) {
    return (
      <span
        className={badgeVerifiedWarn}
        title={`Verified ${days} days ago. This answer is due for re-review soon.`}
      >
        ✓ Verified {days}d ago
      </span>
    );
  }
  return (
    <span
      className={badgeVerifiedBold}
      title={`Verified ${days} days ago and still within its review window.`}
    >
      ✓ Verified {days}d ago
    </span>
  );
}