/**
 * GoldenTicketDetailPage.test.tsx — verifies that the bell deep-link
 * target /golden/ticket/:id renders the admin answer thread.
 *
 * This is the regression guard for the "user clicks the bell after
 * their Golden ticket is resolved and lands on a blank page" bug:
 * the notification previously pointed at /support/:id, which does
 * not render goldenResolutions[]. This test pins the dedicated
 * /golden/ticket/:id page that the backend now deep-links to.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';

// Mock the API helper so we don't pull in axios / token refreshers.
// The fixture here is a Resolved ticket with two admin answers.
vi.mock('../../components/support/api', () => ({
  getMyGoldenTicket: vi.fn(async () => ({
    _id: '1111111111111111111111aa',
    title: 'Router keeps dropping',
    details: 'Happens every 10 minutes during class.',
    status: 'Resolved',
    spCost: 5,
    userId: '1111111111111111111111bb',
    createdAt: '2026-06-15T10:00:00Z',
    updatedAt: '2026-06-15T11:00:00Z',
    resolvedAt: '2026-06-15T11:00:00Z',
    rejectedAt: null,
    rejectionReason: '',
    userName: 'Student',
    userEmail: 'student@test.local',
    goldenResolutions: [
      {
        text: 'Try the LTE fallback.',
        adminId: 'a1',
        adminName: 'Helper Admin',
        createdAt: '2026-06-15T10:30:00Z',
        notificationSent: true,
      },
      {
        text: 'Following up — also try a different power outlet.',
        adminId: 'a2',
        adminName: 'Helper Admin 2',
        createdAt: '2026-06-15T10:45:00Z',
        notificationSent: true,
      },
    ],
  })),
}));

// Suppress FeatureGate's loading state + admin-on-feature-off banners
// for the dedicated page route. The test wants to assert rendering
// of the ticket, not gating behaviour.
vi.mock('../../components/support/FeatureGate', () => ({
  FeatureGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import GoldenTicketDetailPage from '../GoldenTicketDetailPage';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/golden/ticket/:id" element={<GoldenTicketDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('GoldenTicketDetailPage (user-side bell target, v1.73)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the title and both admin answers from goldenResolutions[]', async () => {
    renderAt('/golden/ticket/1111111111111111111111aa');
    // Wait for the async API to settle and the page to render the answers.
    await waitFor(() => {
      expect(screen.getByText('Router keeps dropping')).toBeInTheDocument();
    });
    expect(screen.getByText(/Try the LTE fallback/i)).toBeInTheDocument();
    expect(screen.getByText(/different power outlet/i)).toBeInTheDocument();
  });

  it('renders the SP badge and Resolved status badge', async () => {
    renderAt('/golden/ticket/1111111111111111111111aa');
    await waitFor(() => {
      expect(screen.getByText('Router keeps dropping')).toBeInTheDocument();
    });
    // The status badge text is the canonical TitleCase "Resolved".
    // There are multiple matches (the badge + the section header),
    // so we just confirm at least one is in the DOM.
    expect(screen.getAllByText(/Resolved/i).length).toBeGreaterThan(0);
    // The SP badge contains the literal ticket SP value (5 SP). It
    // appears in both the header pill AND the small badge; we just
    // confirm the page text contains the SP cost somewhere.
    expect(screen.getAllByText((_, el) => /5\s*SP/.test(el?.textContent ?? '')).length).toBeGreaterThan(0);
  });

  it('renders a back-link to /golden', async () => {
    renderAt('/golden/ticket/1111111111111111111111aa');
    await waitFor(() => {
      expect(screen.getByText('Router keeps dropping')).toBeInTheDocument();
    });
    // The page exposes "← Back to Golden Ticket" link.
    const back = screen.getByText(/Back to Golden Ticket/i);
    expect(back.closest('a')).toHaveAttribute('href', '/golden');
  });
});
