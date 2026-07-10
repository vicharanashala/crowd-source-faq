import { screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import RecentActivityCard from '../RecentActivityCard';
import { renderWithProviders, mockSignedInUser } from '@/test/renderWithProviders';

const mockApi = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/utils/api', () => ({ default: mockApi }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('RecentActivityCard', () => {
  it('renders real reputation-log entries, formatted by action type', async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/auth/me') return Promise.resolve({ data: { user: JSON.parse(localStorage.getItem('yaksha_user') || 'null') } });
      if (url === '/auth/me/reputation') {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        return Promise.resolve({
          data: { logs: [{ _id: 'log1', action: 'faq_answer_used', delta: 25, reason: '', createdAt: twoHoursAgo }] },
        });
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    mockSignedInUser();
    renderWithProviders(<RecentActivityCard />);

    await waitFor(() => {
      expect(screen.getByText('Recent activity')).toBeInTheDocument();
    });

    // formatActivity() maps this action code to real, defined copy
    expect(screen.getByText('Answer featured in FAQ')).toBeInTheDocument();
    expect(screen.getByText('2h ago')).toBeInTheDocument();
    expect(screen.getByText('Live feed')).toBeInTheDocument();
  });

  it('shows a real empty state when there is no activity yet', async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/auth/me') return Promise.resolve({ data: { user: JSON.parse(localStorage.getItem('yaksha_user') || 'null') } });
      if (url === '/auth/me/reputation') return Promise.resolve({ data: { logs: [] } });
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    mockSignedInUser();
    renderWithProviders(<RecentActivityCard />);

    await waitFor(() => {
      expect(screen.getByText('No recent activity')).toBeInTheDocument();
    });
  });
});
