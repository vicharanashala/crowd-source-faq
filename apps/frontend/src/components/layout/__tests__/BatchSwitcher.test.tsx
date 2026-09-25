import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { BatchSwitcher } from '../BatchSwitcher';

const mockUseBatch = vi.hoisted(() => vi.fn());
const mockUseAuth = vi.hoisted(() => vi.fn());

vi.mock('../../../context/BatchContext', () => ({ useBatch: mockUseBatch }));
vi.mock('../../../hooks/useAuth', () => ({ useAuth: mockUseAuth }));

const summership = { _id: 'b1', name: 'summership', faqCount: 145, startDate: '2026-05-01', endDate: '2026-12-01' };
const vriddhi = { _id: 'b2', name: 'Vriddhi', faqCount: 198, startDate: '2026-09-01', endDate: '2026-12-01' };

function renderSwitcher() {
  return render(
    <MemoryRouter>
      <BatchSwitcher />
    </MemoryRouter>
  );
}

describe('BatchSwitcher — non-admins cannot see or switch to other cohorts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a plain, non-interactive label for a non-admin (no switcher UI at all)', () => {
    // Backend already filters availableBatches down to just the user's own
    // enrollment, but the UI should never even present a "switch" control
    // to a non-admin — this is the actual assertion under test.
    mockUseBatch.mockReturnValue({
      currentBatch: summership,
      availableBatches: [summership],
      loading: false,
      setCurrentBatch: vi.fn(),
    });
    mockUseAuth.mockReturnValue({ user: { role: 'student' } });

    renderSwitcher();

    expect(screen.getByText('summership')).toBeInTheDocument();
    // No dropdown trigger, no "switch program" affordance.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/click to switch/i)).not.toBeInTheDocument();
  });

  it('does not expose other cohorts to a non-admin even if the API somehow returned them', () => {
    // Defense in depth: even if availableBatches ever contained more than
    // one program for a non-admin, the label path never renders them.
    mockUseBatch.mockReturnValue({
      currentBatch: summership,
      availableBatches: [summership, vriddhi],
      loading: false,
      setCurrentBatch: vi.fn(),
    });
    mockUseAuth.mockReturnValue({ user: { role: 'moderator' } });

    renderSwitcher();

    expect(screen.getByText('summership')).toBeInTheDocument();
    expect(screen.queryByText('Vriddhi')).not.toBeInTheDocument();
  });

  it('renders the real switcher (dropdown) for an admin', () => {
    const setCurrentBatch = vi.fn();
    mockUseBatch.mockReturnValue({
      currentBatch: summership,
      availableBatches: [summership, vriddhi],
      loading: false,
      setCurrentBatch,
    });
    mockUseAuth.mockReturnValue({ user: { role: 'admin' } });

    renderSwitcher();

    const trigger = screen.getByRole('button', { name: /click to switch/i });
    fireEvent.click(trigger);
    expect(screen.getByText('Vriddhi')).toBeInTheDocument();
  });
});
