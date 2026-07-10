import { screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import SavedKnowledgeCard from '../SavedKnowledgeCard';
import { renderWithProviders, mockSignedInUser } from '@/test/renderWithProviders';

const mockApi = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/utils/api', () => ({ default: mockApi }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('SavedKnowledgeCard', () => {
  it('renders real bookmarked posts and a link to the saved page', async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/auth/me') return Promise.resolve({ data: { user: JSON.parse(localStorage.getItem('yaksha_user') || 'null') } });
      if (url === '/community/bookmarks') {
        return Promise.resolve({
          data: { bookmarks: [{ _id: 'p1', title: 'How to join the program', status: 'answered', createdAt: new Date().toISOString() }] },
        });
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    mockSignedInUser();
    renderWithProviders(<SavedKnowledgeCard />);

    await waitFor(() => {
      expect(screen.getByText('Saved knowledge')).toBeInTheDocument();
    });

    expect(screen.getByText('How to join the program')).toBeInTheDocument();
    expect(screen.getByText('Open saved')).toBeInTheDocument();
    expect(mockApi.get).toHaveBeenCalledWith('/community/bookmarks');
  });

  it('shows a real empty state when there are no bookmarks', async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/auth/me') return Promise.resolve({ data: { user: JSON.parse(localStorage.getItem('yaksha_user') || 'null') } });
      if (url === '/community/bookmarks') return Promise.resolve({ data: { bookmarks: [] } });
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    mockSignedInUser();
    renderWithProviders(<SavedKnowledgeCard />);

    await waitFor(() => {
      expect(screen.getByText('No saved knowledge yet')).toBeInTheDocument();
    });
  });
});
