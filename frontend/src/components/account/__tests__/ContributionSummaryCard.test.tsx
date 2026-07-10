import { screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import ContributionSummaryCard from '../ContributionSummaryCard';
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
        data: { contributions: { questionsThisMonth: 2, totalQuestions: 5, totalAnswers: 7, reputation: 340 } },
      });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
});

describe('ContributionSummaryCard', () => {
  it('renders live contribution stats and a link to achievements', async () => {
    mockSignedInUser();
    renderWithProviders(<ContributionSummaryCard />);

    await waitFor(() => {
      expect(screen.getByText('Contribution summary')).toBeInTheDocument();
    });

    expect(screen.getByText('Questions')).toBeInTheDocument();
    expect(screen.getByText('Answers')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // questionsThisMonth
    expect(screen.getByText('7')).toBeInTheDocument(); // totalAnswers
    expect(screen.getByText('View achievements')).toBeInTheDocument();
    expect(mockApi.get).toHaveBeenCalledWith('/auth/me/reputation');
  });
});
