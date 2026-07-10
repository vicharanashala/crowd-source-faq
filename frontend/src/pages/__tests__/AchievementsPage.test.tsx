import { screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import AchievementsPage from '../AchievementsPage';
import { renderWithProviders, mockSignedInUser } from '@/test/renderWithProviders';

const mockApi = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/utils/api', () => ({ default: mockApi }));

const reputationResponse = {
  user: {
    name: 'Test User',
    email: 'test@example.com',
    points: 220,
    reputation: 220,
    tier: 'helper',
    acceptedAnswers: 4,
    faqContributions: 2,
    positiveBadges: [
      { id: 'b1', name: 'First Answer', slug: 'first-answer', description: 'Posted your first community answer', icon: '💡', type: 'positive', awardedAt: new Date().toISOString() },
    ],
    negativeBadges: [],
  },
  contributions: { questionsThisMonth: 1, totalQuestions: 3, totalAnswers: 4, reputation: 220 },
  logs: [
    { _id: 'log1', action: 'faq_answer_used', delta: 25, reason: 'Answer used in FAQ', createdAt: new Date().toISOString() },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockApi.get.mockImplementation((url: string) => {
    if (url === '/auth/me') return Promise.resolve({ data: { user: JSON.parse(localStorage.getItem('yaksha_user') || 'null') } });
    if (url === '/auth/me/reputation') return Promise.resolve({ data: reputationResponse });
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
});

describe('AchievementsPage', () => {
  it('renders real reputation data — points, tier, badges, and activity log', async () => {
    mockSignedInUser();
    renderWithProviders(<AchievementsPage />);

    expect(screen.getByText('Loading achievements...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Achievement Hub')).toBeInTheDocument();
    });

    expect(screen.getAllByText('220')).toHaveLength(2); // Reputation card + Points card (kept in sync by design)
    expect(screen.getAllByText('helper').length).toBeGreaterThanOrEqual(1); // tier badge + tier stat card
    expect(screen.getByText('First Answer')).toBeInTheDocument(); // real earned badge
    expect(screen.getByText('faq_answer_used')).toBeInTheDocument(); // real activity log entry
    expect(mockApi.get).toHaveBeenCalledWith('/auth/me/reputation');
  });

  it('shows an empty state instead of fake badges when the user has none yet', async () => {
    mockSignedInUser();
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/auth/me') return Promise.resolve({ data: { user: JSON.parse(localStorage.getItem('yaksha_user') || 'null') } });
      if (url === '/auth/me/reputation') {
        return Promise.resolve({
          data: { ...reputationResponse, user: { ...reputationResponse.user, positiveBadges: [] }, logs: [] },
        });
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    renderWithProviders(<AchievementsPage />);

    await waitFor(() => {
      expect(screen.getByText('No badges earned yet.')).toBeInTheDocument();
    });
    expect(screen.getByText('No recent activity.')).toBeInTheDocument();
  });
});
