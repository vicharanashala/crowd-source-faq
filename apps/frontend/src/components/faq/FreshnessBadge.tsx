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
      <span className={`${badgePendingReview} ${compact ? badgeCompact : ''}`}>
        ⏳ Under review
      </span>
    );
  }

  if (reviewStatus === 'update_requested') {
    return (
      <span className={`${badgeUpdateRequested} ${compact ? badgeCompact : ''}`}>
        ⚠ Update requested
      </span>
    );
  }

  if (isEvergreen) {
    return (
      <span className={`${badgeVerified} ${compact ? '' : 'font-medium'}`}>
        ✓ Verified
      </span>
    );
  }

  const nearingExpiry = reviewIntervalDays > 0 && days >= reviewIntervalDays * 0.8;

  if (nearingExpiry) {
    return (
      <span className={badgeVerifiedWarn}>
        ✓ Verified {days}d ago
      </span>
    );
  }

  return (
    <span className={badgeVerifiedBold}>
      ✓ Verified {days}d ago
    </span>
  );
}
