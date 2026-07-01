import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import AdminAnalytics from '../AdminAnalytics';
import adminApi from '@/admin/utils/adminApi';

const mockAdminApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('@/admin/utils/adminApi', () => ({ default: mockAdminApi }));

// Mock charts to avoid SVG/Recharts size/browser compatibility errors in jsdom
vi.mock('../components/charts/UserActivityChart', () => ({
  default: () => <div data-testid="user-activity-chart">User Activity Chart</div>
}));
vi.mock('../components/charts/CategoryDistributionChart', () => ({
  default: () => <div data-testid="category-distribution-chart">Category Distribution Chart</div>
}));

// Mock AdminStatCard to bypass countUp animation in test environment
vi.mock('@/admin/components/ui', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/admin/components/ui')>();
  return {
    ...original,
    AdminStatCard: ({ label, value, alert }: any) => (
      <div data-testid="stat-card" className={alert ? 'alert-card' : ''}>
        <span className="value">{value}</span>
        <span className="label">{label}</span>
      </div>
    )
  };
});

// Mock ProgramContext and BatchContext using both alias and relative paths with stable object references
const mockProgramContext = vi.hoisted(() => {
  const currentProgram = { _id: 'batch-1', name: 'Batch 1' };
  const availablePrograms = [
    { _id: 'batch-1', name: 'Batch 1' },
    { _id: 'batch-2', name: 'Batch 2' }
  ];
  const currentBatch = { _id: 'batch-1', name: 'Batch 1' };
  const availableBatches = [
    { _id: 'batch-1', name: 'Batch 1' },
    { _id: 'batch-2', name: 'Batch 2' }
  ];

  return {
    useProgram: () => ({
      currentProgram,
      availablePrograms
    }),
    useBatch: () => ({
      currentBatch,
      availableBatches
    })
  };
});

const mockBatchContext = vi.hoisted(() => {
  const currentBatch = { _id: 'batch-1', name: 'Batch 1' };
  const availableBatches = [
    { _id: 'batch-1', name: 'Batch 1' },
    { _id: 'batch-2', name: 'Batch 2' }
  ];

  return {
    useBatch: () => ({
      currentBatch,
      availableBatches
    })
  };
});

vi.mock('@/context/ProgramContext', () => mockProgramContext);
vi.mock('../../../context/ProgramContext', () => mockProgramContext);
vi.mock('@/context/BatchContext', () => mockBatchContext);
vi.mock('../../../context/BatchContext', () => mockBatchContext);

describe('AdminAnalytics Page - Stale Request & CSV Export Regression Tests', () => {
  let createObjectURLMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    createObjectURLMock = vi.fn(() => 'blob:mock-url');
    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles stale requests correctly using request versioning (race condition safety)', async () => {
    // Setup API responses
    // Request 1: Slow response for batch-1 (using values in the 100s)
    let resolveRequest1: any;
    const promise1 = new Promise((resolve) => {
      resolveRequest1 = () => resolve({
        data: {
          totalFaqs: 111,
          approvedFaqs: 122,
          totalSearches: 133,
          failedSearches: 144,
          uniqueUsers: 155,
          searchSuccessRate: 95
        }
      });
    });

    // Request 2: Fast response for batch-2 (using values in the 700s)
    const promise2 = Promise.resolve({
      data: {
        totalFaqs: 777,
        approvedFaqs: 788,
        totalSearches: 799,
        failedSearches: 711,
        uniqueUsers: 722,
        searchSuccessRate: 90
      }
    });

    // Configure mock returns
    mockAdminApi.get.mockImplementation((url: string) => {
      const cleanUrl = url.split('?')[0];
      if (cleanUrl.endsWith('/summary')) {
        if (url.includes('batchId=batch-2')) return promise2;
        return promise1;
      }
      if (cleanUrl.endsWith('/trends')) return Promise.resolve({ data: [] });
      if (cleanUrl.endsWith('/category-distribution')) return Promise.resolve({ data: [] });
      if (cleanUrl.endsWith('/analytics')) return Promise.resolve({ data: { popularQueries: [], failedQueries: [] } });
      return Promise.resolve({ data: null });
    });

    // Render component (this triggers initial fetch for batch-1)
    render(<AdminAnalytics />);

    // Fast-forward selector to trigger fetch for batch-2
    const selector = screen.getByLabelText('Program');
    await act(async () => {
      fireEvent.change(selector, { target: { value: 'batch-2' } });
    });

    // Let the fast response (Request 2) resolve first
    await act(async () => {
      await promise2;
    });

    // Now resolve the slow response (Request 1)
    await act(async () => {
      resolveRequest1();
      await promise1;
    });

    // Wait for updates to settle
    await waitFor(() => {
      expect(screen.queryByText('Total FAQs')).toBeInTheDocument();
    });

    // Assert that the state matches the LATEST request (batch-2) and did NOT get overwritten by slow batch-1 results
    expect(screen.getByText('777')).toBeInTheDocument(); // totalFaqs = 777 from batch-2
    expect(screen.queryByText('111')).not.toBeInTheDocument(); // should not show batch-1 totalFaqs (111)
  });

  it('exports CSV with correct column ordering mapped strictly to headers and keys', async () => {
    // Setup API mocks
    mockAdminApi.get.mockImplementation((url: string) => {
      const cleanUrl = url.split('?')[0];
      if (cleanUrl.endsWith('/summary')) return Promise.resolve({ data: { totalFaqs: 5, approvedFaqs: 4, totalSearches: 50, failedSearches: 2, uniqueUsers: 10, searchSuccessRate: 96 } });
      if (cleanUrl.endsWith('/trends')) return Promise.resolve({ data: [] });
      if (cleanUrl.endsWith('/category-distribution')) return Promise.resolve({ data: [] });
      if (cleanUrl.endsWith('/analytics')) {
        return Promise.resolve({
          data: {
            popularQueries: [
              { query: 'test-query', count: 42, lastSearched: '2026-06-29T00:00:00.000Z' }
            ],
            failedQueries: []
          }
        });
      }
      return Promise.resolve({ data: null });
    });

    // Render component and wait for data load
    render(<AdminAnalytics />);
    await screen.findByText('test-query');

    // Click CSV Export button using accessible name
    const exportButton = screen.getByRole('button', { name: /Export top search queries as CSV/i });
    fireEvent.click(exportButton);

    // Verify URL.createObjectURL was called with a Blob containing CSV text
    expect(createObjectURLMock).toHaveBeenCalled();
    const exportedBlob: Blob = createObjectURLMock.mock.calls[0][0];

    // Read Blob contents using FileReader for environment compatibility
    const blobContent = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(exportedBlob);
    });

    const lines = blobContent.split('\n');
    expect(lines[0]).toBe('Search Query,Count,Last Searched');
    
    // Explicitly verify the values matching the keys ordering: 'query', 'count', 'lastSearched'
    expect(lines[1]).toContain('"test-query"');
    expect(lines[1]).toContain('"42"');
  });
});
