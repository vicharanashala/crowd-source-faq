import { screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import TopicRadarPage from '../TopicRadarPage';
import { renderWithProviders } from '@/test/renderWithProviders';

const mockApi = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/utils/api', () => ({ default: mockApi }));

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.get.mockImplementation((url: string) => {
    if (url === '/faq/topic-radar') {
      return Promise.resolve({
        data: {
          topics: [{ category: 'Onboarding', faqCount: 4, totalViews: 120, totalSearches: 30, helpfulRatio: 0.8 }],
          needsAttention: [
            { _id: 'faq1', question: 'Why is my access not working?', category: 'Account', reportCount: 2, helpfulVotes: 1, unhelpfulVotes: 4 },
          ],
        },
      });
    }
    if (url === '/search/trending') {
      return Promise.resolve({ data: { trending: [{ query: 'program access', count: 12, lastSearched: new Date().toISOString() }] } });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
});

describe('TopicRadarPage', () => {
  it('renders live category and search data instead of mock arrays', async () => {
    renderWithProviders(<TopicRadarPage />);

    await waitFor(() => {
      expect(screen.getByText('Onboarding')).toBeInTheDocument();
    });

    expect(screen.getByText('program access')).toBeInTheDocument();
    expect(screen.getByText('Why is my access not working?')).toBeInTheDocument();
    expect(mockApi.get).toHaveBeenCalledWith('/faq/topic-radar');
    expect(mockApi.get).toHaveBeenCalledWith('/search/trending');
  });

  it('filters to only trending searches when that quick filter is selected', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    renderWithProviders(<TopicRadarPage />);

    await waitFor(() => expect(screen.getByText('Onboarding')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Trending now' }));

    expect(screen.queryByText('Onboarding')).not.toBeInTheDocument();
    expect(screen.getByText('program access')).toBeInTheDocument();
  });
});
