import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import AdminAutoAnswerQueue from '../AdminAutoAnswerQueue';

// Mock the adminApi module so individual tests can assert on its calls.
vi.mock('../../utils/adminApi', () => {
  return {
    default: {
      get: vi.fn(),
      post: vi.fn(),
    },
  };
});

// Mock the friendlyError helper so we don't pull in the entire utils/api module.
vi.mock('../../../utils/api', () => ({
  friendlyError: (_: unknown, fallback: string) => fallback,
}));

import adminApi from '../../utils/adminApi';

const mockApi = adminApi as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

type PaginatedPayload = {
  items: Array<Record<string, unknown>>;
  total: number;
  page: number;
  limit: number;
  pages: number;
};

function paginated(items: Array<Record<string, unknown>>, total: number, page = 1, limit = 10, pages?: number): PaginatedPayload {
  const computedPages = pages ?? (total === 0 ? 1 : Math.max(1, Math.ceil(total / limit)));
  return { items, total, page, limit, pages: computedPages };
}

function makePost(over: Partial<{ _id: string; title: string; body: string; aiAnswer: string; aiAnswerStatus: string; aiContext: { hits: Array<Record<string, unknown>>; sources: Array<Record<string, unknown>>; query: string; takenAt: string } }> = {}) {
  return {
    _id: over._id ?? 'p1',
    title: over.title ?? 'How does onboarding work?',
    body: over.body ?? 'I cannot find the onboarding doc — need help.',
    aiAnswer: over.aiAnswer ?? null,
    aiAnswerStatus: over.aiAnswerStatus ?? 'suggested',
    aiContext: over.aiContext ?? null,
  };
}

const baseSuggestedPost = makePost({
  _id: 'p1',
  title: 'Onboarding docs',
  body: 'Where are the onboarding docs?',
  aiAnswer: 'You can find onboarding docs at /docs/onboarding.',
  aiAnswerStatus: 'suggested',
  aiContext: {
    hits: [
      {
        source: 'faq',
        sourceId: 'faq-onboarding',
        question: 'Where are onboarding docs?',
        answer: 'Onboarding docs live at /docs/onboarding.',
        score: 0.92,
        confidence: 0.88,
        ageDays: 3,
        rank: 1,
      },
      {
        source: 'kb',
        sourceId: 'kb-101',
        question: 'New user checklist',
        answer: 'Welcome new users with this checklist.',
        score: 0.8,
        confidence: 0.72,
        ageDays: 12,
        rank: 2,
      },
    ],
    sources: [{ name: 'faq', returned: 1, weight: 1 }],
    query: 'onboarding docs',
    takenAt: '2024-01-01T00:00:00Z',
  },
});

describe('AdminAutoAnswerQueue', () => {
  beforeEach(() => {
    mockApi.get.mockReset();
    mockApi.post.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the three tabs (asked / suggested / all) with counts', async () => {
    // The page fires one initial fetch for the active tab and three for counts.
    mockApi.get.mockResolvedValue({ data: paginated([], 7) });

    render(<AdminAutoAnswerQueue />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Asked \(/ })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Suggested \(/ })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /All \(/ })).toBeInTheDocument();
    });

    // The mock returns 7 for every request — counts will be 7, 7, 7.
    const askedTab = await screen.findByRole('tab', { name: /Asked \(/ });
    expect(askedTab.textContent).toMatch(/Asked \(7\)/);
    const suggestedTab = screen.getByRole('tab', { name: /Suggested \(/ });
    expect(suggestedTab.textContent).toMatch(/Suggested \(7\)/);
    const allTab = screen.getByRole('tab', { name: /All \(/ });
    expect(allTab.textContent).toMatch(/All \(7\)/);

    // Each tab should also expose aria-selected for accessibility.
    expect(suggestedTab.getAttribute('aria-selected')).toBe('true');
    expect(askedTab.getAttribute('aria-selected')).toBe('false');
    expect(allTab.getAttribute('aria-selected')).toBe('false');
  });

  it('switches the active tab to "asked" when the user clicks it and updates the URL', async () => {
    mockApi.get.mockResolvedValue({ data: paginated([], 0) });

    render(<AdminAutoAnswerQueue />);
    // Wait for initial render.
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalled();
    });

    mockApi.get.mockClear();

    const askedTab = await screen.findByRole('tab', { name: /Asked \(/ });
    fireEvent.click(askedTab);

    await waitFor(() => {
      expect(askedTab.getAttribute('aria-selected')).toBe('true');
    });

    // The URL should now include status=asked
    expect(window.location.search).toMatch(/status=asked/);

    // Internal state should drive a new fetch with status=asked.
    await waitFor(() => {
      const urls = mockApi.get.mock.calls.map((c) => c[0]);
      expect(urls.some((u: string) => u.includes('status=asked') || u === '/admin/auto-answer/queue/paginated')).toBe(true);
    });
  });

  it('shows the empty-state copy when there are no items', async () => {
    mockApi.get.mockResolvedValue({ data: paginated([], 0) });

    render(<AdminAutoAnswerQueue />);

    expect(
      await screen.findByText(/No posts in this queue\. All caught up/i),
    ).toBeInTheDocument();
  });

  it('calls the new approve endpoint when the user clicks Approve', async () => {
    mockApi.get.mockResolvedValue({
      data: paginated([baseSuggestedPost as unknown as Record<string, unknown>], 1),
    });
    mockApi.post.mockResolvedValue({ data: { ok: true } });

    render(<AdminAutoAnswerQueue />);

    // Expand the post so action buttons render.
    const titleButton = await screen.findByText(/Onboarding docs/);
    fireEvent.click(titleButton);

    const approveBtn = await screen.findByRole('button', { name: /^Approve$/ });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      const calls = mockApi.post.mock.calls.map((c) => c[0]);
      expect(calls).toContain('/admin/auto-answer/p1/approve');
    });

    // The approve call should send an empty object body.
    const approveCall = mockApi.post.mock.calls.find((c) => c[0] === '/admin/auto-answer/p1/approve');
    expect(approveCall).toBeDefined();
    expect(approveCall?.[1]).toEqual({});
  });

  it('calls approve-edit with the admin reply textarea content on Approve + Edit click', async () => {
    mockApi.get.mockResolvedValue({
      data: paginated([baseSuggestedPost as unknown as Record<string, unknown>], 1),
    });
    mockApi.post.mockResolvedValue({ data: { ok: true } });

    render(<AdminAutoAnswerQueue />);

    const titleButton = await screen.findByText(/Onboarding docs/);
    fireEvent.click(titleButton);

    const textarea = (await screen.findByLabelText(/Admin reply/i)) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'A custom admin answer.' } });

    const approveEditBtn = await screen.findByRole('button', { name: /Approve \+ Edit/ });
    fireEvent.click(approveEditBtn);

    await waitFor(() => {
      const calls = mockApi.post.mock.calls.map((c) => c[0]);
      expect(calls).toContain('/admin/auto-answer/p1/approve-edit');
    });

    const approveEditCall = mockApi.post.mock.calls.find(
      (c) => c[0] === '/admin/auto-answer/p1/approve-edit',
    );
    expect(approveEditCall).toBeDefined();
    expect(approveEditCall?.[1]).toEqual({ answer: 'A custom admin answer.' });
  });

  it('renders the AI draft answer, source citations, admin reply textarea, and the action buttons when a post is expanded', async () => {
    mockApi.get.mockResolvedValue({
      data: paginated([baseSuggestedPost as unknown as Record<string, unknown>], 1),
    });

    render(<AdminAutoAnswerQueue />);

    const titleButton = await screen.findByText(/Onboarding docs/);
    fireEvent.click(titleButton);

    // AI draft visible
    expect(
      await screen.findByText(/You can find onboarding docs at \/docs\/onboarding\./),
    ).toBeInTheDocument();

    // Source citation labels
    expect(screen.getByText(/faq:faq-onboarding/i)).toBeInTheDocument();
    expect(screen.getByText(/kb:kb-101/i)).toBeInTheDocument();

    // Admin reply textarea
    expect(screen.getByLabelText(/Admin reply/i)).toBeInTheDocument();

    // Action buttons
    expect(screen.getByRole('button', { name: /^Approve$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Approve \+ Edit/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Reject$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ask AI Again/ })).toBeInTheDocument();
  });

  it('shows pagination controls when there is more than one page of results', async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url.includes('limit=1')) {
        // counts probe
        return Promise.resolve({ data: paginated([], 25) });
      }
      return Promise.resolve({
        data: paginated([baseSuggestedPost as unknown as Record<string, unknown>], 25, 1, 10, 3),
      });
    });

    render(<AdminAutoAnswerQueue />);

    expect(await screen.findByText(/Page 1 of 3/)).toBeInTheDocument();
    expect(screen.getByText(/Next →/)).toBeInTheDocument();
    // Page 1 → prev disabled
    const prev = screen.getByText(/← Prev/);
    expect(prev).toBeInTheDocument();
  });

  it('also keeps the manual Run Now button (legacy /admin/community/auto-answer endpoint)', async () => {
    mockApi.get.mockResolvedValue({ data: paginated([], 0) });
    mockApi.post.mockResolvedValue({
      data: {
        message: 'Auto-answer run complete',
        processed: 5,
        auto_approved: 1,
        suggested: 3,
        escalated: 1,
        errors: 0,
      },
    });

    render(<AdminAutoAnswerQueue />);
    const runBtn = await screen.findByRole('button', { name: /Run Now/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      const calls = mockApi.post.mock.calls.map((c) => c[0]);
      expect(calls).toContain('/admin/community/auto-answer');
    });
  });

  it('clicking "Why did AI decide this?" calls GET /admin/auto-answer/:postId/context', async () => {
    // The initial queue fetch + counts probes use the first .get impl.
    // The drill-down GET will return a snapshot payload.
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/admin/auto-answer/p1/context') {
        return Promise.resolve({
          data: {
            postId: 'p1',
            snapshot: {
              hits: [
                {
                  source: 'faq',
                  sourceId: 'faq-onboarding',
                  question: 'Where are onboarding docs?',
                  answer: 'Onboarding docs live at /docs/onboarding.',
                  score: 0.92,
                  confidence: 0.88,
                  ageDays: 3,
                  rank: 1,
                  batchId: 'batch-abc',
                },
              ],
              sources: [{ name: 'faq', returned: 1, weight: 1 }],
              query: 'onboarding docs',
              takenAt: '2024-01-01T00:00:00Z',
            },
            decision: {
              aiAnswerStatus: 'suggested',
              aiAnswerConfidence: 0.88,
              aiAnswerSource: 'faq',
              lastAutoAnswerAt: '2024-01-01T00:00:00Z',
              aiAnswerAttempts: 1,
            },
          },
        });
      }
      return Promise.resolve({
        data: paginated([baseSuggestedPost as unknown as Record<string, unknown>], 1),
      });
    });

    render(<AdminAutoAnswerQueue />);

    // Expand the post so the drill-down button is rendered.
    const titleButton = await screen.findByText(/Onboarding docs/);
    fireEvent.click(titleButton);

    const drillDownBtn = await screen.findByRole('button', {
      name: /Why did AI decide this\?/i,
    });
    fireEvent.click(drillDownBtn);

    await waitFor(() => {
      const urls = mockApi.get.mock.calls.map((c) => c[0]);
      expect(urls).toContain('/admin/auto-answer/p1/context');
    });
  });

  it('modal renders the snapshot data after the context fetch resolves', async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/admin/auto-answer/p1/context') {
        return Promise.resolve({
          data: {
            postId: 'p1',
            snapshot: {
              hits: [
                {
                  source: 'faq',
                  sourceId: 'faq-onboarding',
                  question: 'Where are onboarding docs?',
                  answer: 'Onboarding docs live at /docs/onboarding.',
                  score: 0.92,
                  confidence: 0.88,
                  ageDays: 3,
                  rank: 1,
                  batchId: 'batch-xyz',
                },
                {
                  source: 'kb',
                  sourceId: 'kb-101',
                  question: 'New user checklist',
                  answer: 'Welcome new users with this checklist.',
                  score: 0.8,
                  confidence: 0.72,
                  ageDays: 12,
                  rank: 2,
                },
              ],
              sources: [
                { name: 'faq', returned: 1, weight: 1 },
                { name: 'kb', returned: 1, weight: 0.8 },
              ],
              query: 'onboarding docs',
              takenAt: '2024-01-01T00:00:00Z',
            },
            decision: {
              aiAnswerStatus: 'suggested',
              aiAnswerConfidence: 0.88,
              aiAnswerSource: 'faq',
              lastAutoAnswerAt: '2024-01-01T00:00:00Z',
              aiAnswerAttempts: 1,
            },
          },
        });
      }
      return Promise.resolve({
        data: paginated([baseSuggestedPost as unknown as Record<string, unknown>], 1),
      });
    });

    render(<AdminAutoAnswerQueue />);

    const titleButton = await screen.findByText(/Onboarding docs/);
    fireEvent.click(titleButton);

    const drillDownBtn = await screen.findByRole('button', {
      name: /Why did AI decide this\?/i,
    });
    fireEvent.click(drillDownBtn);

    // The modal dialog becomes visible.
    const dialog = await screen.findByRole('dialog', {
      name: /AI decision drill-down/i,
    });
    expect(dialog).toBeInTheDocument();

    // Decision panel values appear (scoped to the dialog so we don't match
    // the inline Source Citations block that lives outside the modal).
    expect(within(dialog).getByText(/^88%$/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Query:/)).toBeInTheDocument();
    // Snapshot has two hits — the modal lists both, not just the 3-cap of the inline view.
    expect(within(dialog).getByText(/faq:faq-onboarding/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/kb:kb-101/i)).toBeInTheDocument();
    // Source breakdown table inside the modal.
    const rows = within(dialog).getAllByRole('row');
    expect(rows.length).toBeGreaterThanOrEqual(3); // header + 2 sources
  });
});
