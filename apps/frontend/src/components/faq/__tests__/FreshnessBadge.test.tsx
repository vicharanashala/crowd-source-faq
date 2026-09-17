import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import FreshnessBadge from '@/components/faq/FreshnessBadge';

describe('FreshnessBadge tooltips', () => {
  it('shows a tooltip explaining "pending_review" status', () => {
    render(
      <FreshnessBadge
        reviewStatus="pending_review"
        lastVerifiedDate={new Date()}
        reviewIntervalDays={30}
        freshnessTier="seasonal"
      />
    );
    const badge = screen.getByText('⏳ Under review');
    expect(badge).toHaveAttribute(
      'title',
      'This answer is being re-checked against the latest information.'
    );
  });

  it('shows a tooltip explaining "update_requested" status', () => {
    render(
      <FreshnessBadge
        reviewStatus="update_requested"
        lastVerifiedDate={new Date()}
        reviewIntervalDays={30}
        freshnessTier="seasonal"
      />
    );
    const badge = screen.getByText('⚠ Update requested');
    expect(badge).toHaveAttribute(
      'title',
      'A community member has flagged this answer as possibly outdated.'
    );
  });

  it('shows a tooltip explaining "verified" evergreen status', () => {
    render(
      <FreshnessBadge
        reviewStatus="verified"
        lastVerifiedDate={new Date()}
        reviewIntervalDays={30}
        freshnessTier="evergreen"
      />
    );
    const badge = screen.getByText('✓ Verified');
    expect(badge).toHaveAttribute(
      'title',
      "This answer covers timeless information and doesn't need periodic re-review."
    );
  });

  it('shows a days-based tooltip when verified and non-evergreen', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 5);
    render(
      <FreshnessBadge
        reviewStatus="verified"
        lastVerifiedDate={oldDate}
        reviewIntervalDays={30}
        freshnessTier="volatile"
      />
    );
    const badge = screen.getByText(/Verified 5d ago/);
    expect(badge).toHaveAttribute('title', expect.stringContaining('Verified 5 days ago'));
  });
});