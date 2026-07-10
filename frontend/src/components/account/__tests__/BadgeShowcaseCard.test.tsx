import { screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import BadgeShowcaseCard from '../BadgeShowcaseCard';
import { renderWithProviders, mockSignedInUser } from '@/test/renderWithProviders';

const mockApi = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/utils/api', () => ({ default: mockApi }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('BadgeShowcaseCard', () => {
  it('renders real earned badges from the reputation API', async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/auth/me') return Promise.resolve({ data: { user: JSON.parse(localStorage.getItem('yaksha_user') || 'null') } });
      if (url === '/auth/me/reputation') {
        return Promise.resolve({
          data: {
            user: {
              positiveBadges: [
                { id: 'b1', name: 'Helpful', slug: 'helpful', description: 'Your answer was marked helpful', icon: '👍', type: 'positive', awardedAt: new Date().toISOString() },
              ],
            },
          },
        });
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    mockSignedInUser();
    renderWithProviders(<BadgeShowcaseCard />);

    await waitFor(() => {
      expect(screen.getByText('Badge showcase')).toBeInTheDocument();
    });

    expect(screen.getByText('Helpful')).toBeInTheDocument();
    expect(screen.getByText('1 earned')).toBeInTheDocument();
  });

  it('shows a real empty state instead of fake badges when none are earned', async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/auth/me') return Promise.resolve({ data: { user: JSON.parse(localStorage.getItem('yaksha_user') || 'null') } });
      if (url === '/auth/me/reputation') return Promise.resolve({ data: { user: { positiveBadges: [] } } });
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    mockSignedInUser();
    renderWithProviders(<BadgeShowcaseCard />);

    await waitFor(() => {
      expect(screen.getByText('No badges earned yet')).toBeInTheDocument();
    });
    expect(screen.getByText('0 earned')).toBeInTheDocument();
  });
});
