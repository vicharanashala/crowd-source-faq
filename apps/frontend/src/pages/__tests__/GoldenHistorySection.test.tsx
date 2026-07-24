/**
 * GoldenHistorySection.test.tsx — user-facing History segment
 * rendered below the live Escalation Queue on /golden (v1.73).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import GoldenHistorySection from '../../components/support/GoldenHistorySection';
import type {
  GoldenActivityEvent,
  GoldenHistoryBanned,
  GoldenHistoryItem,
} from '../../components/support/types';

function renderSection(props: {
  history: GoldenHistoryItem[];
  banned: GoldenHistoryBanned[];
  activity: GoldenActivityEvent[];
  loading: boolean;
}) {
  return render(
    <MemoryRouter>
      <GoldenHistorySection {...props} />
    </MemoryRouter>,
  );
}

const HISTORY: GoldenHistoryItem[] = [
  {
    _id: '1111111111111111111111aa',
    title: 'Router keeps dropping',
    details: 'Happens every 10 minutes during class.',
    status: 'Resolved',
    spCost: 5,
    userName: 'Student',
    createdAt: '2026-06-15T10:00:00Z',
    resolvedAt: '2026-06-15T11:00:00Z',
    rejectedAt: null,
    rejectionReason: '',
    bannedUntil: null,
    isBanned: false,
    goldenResolutions: [
      {
        text: 'Try the LTE fallback. Worked for two other students.',
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
  },
  {
    _id: '1111111111111111111111bb',
    title: 'Ban test ticket',
    details: 'Should not have been banned',
    status: 'Rejected',
    spCost: 3,
    userName: 'Student',
    createdAt: '2026-06-10T08:00:00Z',
    resolvedAt: null,
    rejectedAt: '2026-06-10T09:00:00Z',
    rejectionReason: 'Off-topic',
    bannedUntil: null,
    isBanned: false,
    goldenResolutions: [],
  },
];

const BANNED: GoldenHistoryBanned[] = [
  {
    userId: '1111111111111111111111cc',
    bannedUntil: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    isActiveBan: true,
    banHours: 72,
  },
];

const ACTIVITY: GoldenActivityEvent[] = [
  {
    type: 'resolved',
    ticketId: '1111111111111111111111aa',
    title: 'Router keeps dropping',
    at: '2026-06-15T11:00:00Z',
    status: 'Resolved',
    details: 'Resolved by admin',
  },
  {
    type: 'ticket_raised',
    ticketId: '1111111111111111111111aa',
    title: 'Router keeps dropping',
    at: '2026-06-15T10:00:00Z',
    status: 'Pending',
    details: 'Submitted as Golden (5 SP)',
  },
  {
    type: 'rejected',
    ticketId: '1111111111111111111111bb',
    title: 'Ban test ticket',
    at: '2026-06-10T09:00:00Z',
    status: 'Rejected',
    details: 'Off-topic',
  },
];

describe('GoldenHistorySection', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('renders the empty state on the Resolved tab when there is no history', () => {
    renderSection({ history: [], banned: [], activity: [], loading: false });
    expect(
      screen.getByText(/No resolved Golden Tickets yet/i),
    ).toBeInTheDocument();
  });

  it('expands a Resolved card to reveal the admin answers', () => {
    renderSection({
      history: HISTORY,
      banned: [],
      activity: ACTIVITY,
      loading: false,
    });
    const title = screen.getByText('Router keeps dropping');
    const toggle = title.closest('button');
    if (!toggle) throw new Error('No toggle button found around title');
    fireEvent.click(toggle);
    expect(
      screen.getByText(/Try the LTE fallback\./i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/also try a different power outlet\./i),
    ).toBeInTheDocument();
  });

  it('expands a Rejected card to reveal the rejection reason', () => {
    renderSection({
      history: HISTORY,
      banned: [],
      activity: [],
      loading: false,
    });
    const toggle = screen.getByText('Ban test ticket').closest('button');
    if (!toggle) throw new Error('No toggle');
    fireEvent.click(toggle);
    expect(screen.getByText(/Off-topic/i)).toBeInTheDocument();
  });

  it('shows the active ban countdown on the Banned tab', () => {
    renderSection({
      history: [],
      banned: BANNED,
      activity: [],
      loading: false,
    });
    const tabs = screen.getAllByRole('tab');
    const bannedTab = tabs.find((t) => /Banned/i.test(t.textContent || ''));
    if (!bannedTab) throw new Error('Banned tab not found');
    fireEvent.click(bannedTab);
    const card = screen.getByText(/ends/i).closest('div');
    expect(card).toBeInTheDocument();
  });

  it('renders Activity Log rows when the user switches to the Activity Log tab', () => {
    renderSection({
      history: HISTORY,
      banned: [],
      activity: ACTIVITY,
      loading: false,
    });
    const tabs = screen.getAllByRole('tab');
    const activityTab = tabs.find((t) =>
      /Activity Log/i.test(t.textContent || ''),
    );
    if (!activityTab) throw new Error('Activity tab not found');
    fireEvent.click(activityTab);
    expect(screen.getAllByText(/Resolved/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Rejected/i)).toBeInTheDocument();
    expect(screen.getByText(/Ticket raised/i)).toBeInTheDocument();
  });

  it('shows the empty state on Banned when no bans are active', () => {
    renderSection({
      history: HISTORY,
      banned: [],
      activity: [],
      loading: false,
    });
    const tabs = screen.getAllByRole('tab');
    const bannedTab = tabs.find((t) => /Banned/i.test(t.textContent || ''));
    if (!bannedTab) throw new Error('Banned tab not found');
    fireEvent.click(bannedTab);
    expect(
      screen.getByText(/You haven't been banned/i),
    ).toBeInTheDocument();
  });
});
