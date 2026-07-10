import { screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import KnowledgeSprintPage from '../KnowledgeSprintPage';
import { renderWithProviders, mockSignedInUser } from '@/test/renderWithProviders';

const mockApi = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/utils/api', () => ({ default: mockApi }));

const dailyProgressResponse = {
  user: { points: 120, tier: 'contributor', badges: 2, rank: 5 },
  challenges: [
    {
      id: 1,
      title: 'Clear your notifications',
      detail: 'You have 3 unread notifications waiting',
      points: 10,
      category: 'Engagement',
      completed: false,
      actionable: true,
      actionUrl: '/notifications',
    },
  ],
  progress: {
    completedChallenges: 0,
    totalChallenges: 1,
    pointsEarnedToday: 15,
    streakDays: 3,
    nextTier: 'helper',
    pointsToNextTier: 30,
  },
  activity: { unreadNotifications: 3, recentFaqCount: 1, recentCommunityPosts: 2, todaysActions: 4 },
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockApi.get.mockImplementation((url: string) => {
    if (url === '/auth/me') return Promise.resolve({ data: { user: JSON.parse(localStorage.getItem('yaksha_user') || 'null') } });
    if (url === '/user/daily-progress') return Promise.resolve({ data: dailyProgressResponse });
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
});

describe('KnowledgeSprintPage', () => {
  it('prompts sign-in when the user is not authenticated', () => {
    renderWithProviders(<KnowledgeSprintPage />);
    expect(
      screen.getByText('Sign in to see your personal daily challenges, streak, and progress toward your next tier.')
    ).toBeInTheDocument();
  });

  it('renders real daily-progress data for a signed-in user, with no local-only fake completion', async () => {
    mockSignedInUser();
    renderWithProviders(<KnowledgeSprintPage />);

    await waitFor(() => {
      expect(screen.getByText('Clear your notifications')).toBeInTheDocument();
    });

    expect(screen.getByText('0 of 1 completed')).toBeInTheDocument();
    expect(
      screen.getByText((_, node) => node?.textContent === '3 days active this week')
    ).toBeInTheDocument();
    // Real challenges link out to where the action actually happens,
    // instead of a fake local "Complete" toggle that didn't persist.
    expect(screen.getByRole('link', { name: /do it now/i })).toHaveAttribute('href', '/notifications');
  });
});
