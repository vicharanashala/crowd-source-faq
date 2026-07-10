import { screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import NextActionsCard from '../NextActionsCard';
import { renderWithProviders, mockSignedInUser } from '@/test/renderWithProviders';

const mockApi = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/utils/api', () => ({ default: mockApi }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockApi.get.mockImplementation((url: string) => {
    if (url === '/auth/me') return Promise.resolve({ data: { user: JSON.parse(localStorage.getItem('yaksha_user') || 'null') } });
    if (url === '/auth/me/reputation') {
      return Promise.resolve({
        data: {
          user: { points: 10, tier: 'newcomer', positiveBadges: [] },
          contributions: { questionsThisMonth: 0, totalAnswers: 0 },
        },
      });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
});

describe('NextActionsCard', () => {
  it('derives recommended actions from real user stats (new-user path)', async () => {
    mockSignedInUser();
    renderWithProviders(<NextActionsCard />);

    await waitFor(() => {
      expect(screen.getByText('Recommended next actions')).toBeInTheDocument();
    });

    // A brand-new user (points < 50, no activity this month) should see
    // the onboarding-style actions the component actually generates.
    expect(screen.getByText('Ask your first question')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Start' }).length).toBeGreaterThan(0);
  });
});
