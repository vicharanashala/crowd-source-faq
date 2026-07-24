import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import AdminCommunity from '../AdminCommunity';

// Mock the adminApi module
vi.mock('../../utils/adminApi', () => {
  return {
    default: {
      get: vi.fn(),
      delete: vi.fn(),
    },
  };
});

import adminApi from '../../utils/adminApi';

const mockApi = adminApi as unknown as {
  get: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

describe('AdminCommunity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders total posts count, category cards, and post table rows with category badges', async () => {
    const mockPosts = [
      {
        _id: 'post1',
        title: 'How to request leaf?',
        body: 'I need to know how to apply for leaves.',
        status: 'unanswered',
        author: { _id: 'u1', name: 'John Doe', email: 'john@doe.com' },
        comments: [],
        upvotes: ['u2'],
        createdAt: '2026-07-04T12:00:00.000Z',
        tags: ['vibe'],
        batchId: { _id: 'b1', name: 'Monsoonship' },
      },
      {
        _id: 'post2',
        title: 'NOC signature needed',
        body: 'Can someone sign my NOC?',
        status: 'answered',
        author: { _id: 'u2', name: 'Jane Smith', email: 'jane@smith.com' },
        comments: [{ _id: 'c1', body: 'Yes, ask HR', author: { name: 'HR Manager' }, verified: true }],
        upvotes: [],
        createdAt: '2026-07-03T12:00:00.000Z',
        tags: ['logistics'],
      }
    ];

    const mockCategories = [
      { name: 'vibe', count: 1 },
      { name: 'logistics', count: 1 },
    ];

    mockApi.get.mockResolvedValue({
      data: {
        posts: mockPosts,
        total: 2,
        page: 1,
        pages: 1,
        categories: mockCategories,
      },
    });

    render(<AdminCommunity />);

    // Check loading skeleton first, then wait for table contents
    await waitFor(() => {
      expect(screen.getByText('2 total posts')).toBeInTheDocument();
    });

    // Check Category Selection Cards and Badges
    expect(screen.getByText('All Categories')).toBeInTheDocument();
    expect(screen.getAllByText('vibe')).toHaveLength(2);
    expect(screen.getAllByText('logistics')).toHaveLength(2);

    // Check counts on the cards
    expect(screen.getByText('2 posts')).toBeInTheDocument(); // All Categories count
    expect(screen.getAllByText('1 post')).toHaveLength(2); // vibe & logistics count (since count is 1 for both)

    // Check table headers
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Author')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();

    // Check table rows
    expect(screen.getByText('How to request leaf?')).toBeInTheDocument();
    expect(screen.getByText('NOC signature needed')).toBeInTheDocument();

    // Check click on a category card calls API with category parameter
    fireEvent.click(screen.getAllByText('vibe')[0]);

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith(
        expect.stringContaining('category=vibe')
      );
    });

    // Click on the post row to open modal
    fireEvent.click(screen.getByText('How to request leaf?'));

    // Assert that the modal is open
    expect(screen.getByText('Post Details')).toBeInTheDocument();
  });
});
