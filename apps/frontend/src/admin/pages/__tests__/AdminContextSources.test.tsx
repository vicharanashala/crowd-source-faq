import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import AdminContextSources from '../AdminContextSources';

// Mock the adminApi module so individual tests can assert on its calls.
// We expose `delete` because the page uses it for DELETE /admin/web-pages/:id
// and DELETE /admin/documents/:id.
vi.mock('../../utils/adminApi', () => {
  return {
    default: {
      get: vi.fn(),
      post: vi.fn(),
      delete: vi.fn(),
    },
  };
});

// Mock the friendlyError helper so we don't pull in the entire utils/api
// module. Returning the fallback keeps the test assertions simple.
vi.mock('../../../utils/api', () => ({
  friendlyError: (_: unknown, fallback: string) => fallback,
}));

import adminApi from '../../utils/adminApi';

const mockApi = adminApi as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

type WebPagePayload = {
  items: Array<Record<string, unknown>>;
  total: number;
  page: number;
  limit: number;
  pages: number;
};
type DocumentPayload = {
  items: Array<Record<string, unknown>>;
  total: number;
  page: number;
  limit: number;
  pages: number;
};

function paginated<T>(items: T[], total: number, page = 1, limit = 50): { items: T[]; total: number; page: number; limit: number; pages: number } {
  const pages = total === 0 ? 1 : Math.max(1, Math.ceil(total / limit));
  return { items, total, page, limit, pages };
}

function makeWebPage(over: Partial<{ _id: string; url: string; domain: string; title: string; lastFetchError: string | null; fetchedAt: string }> = {}) {
  return {
    _id: over._id ?? 'wp1',
    url: over.url ?? 'https://example.com/article-1',
    domain: over.domain ?? 'example.com',
    title: over.title ?? 'Example article title',
    text: 'Lorem ipsum dolor sit amet.',
    source: 'admin_pasted',
    statusCode: 200,
    lastFetchError: over.lastFetchError ?? null,
    fetchedAt: over.fetchedAt ?? '2024-01-02T00:00:00Z',
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
  };
}

function makeDocument(over: Partial<{ _id: string; title: string; filename: string; sizeBytes: number; pageCount: number; uploadedAt: string }> = {}) {
  return {
    _id: over._id ?? 'd1',
    title: over.title ?? 'Syllabus 2024',
    filename: over.filename ?? 'syllabus.pdf',
    mimeType: 'application/pdf',
    sizeBytes: over.sizeBytes ?? 245678,
    pageCount: over.pageCount ?? 12,
    uploadedAt: over.uploadedAt ?? '2024-01-03T00:00:00Z',
    createdAt: '2024-01-03T00:00:00Z',
    updatedAt: '2024-01-03T00:00:00Z',
  };
}

// Web-page rows: 1 good + 1 broken (lastFetchError set) + 1 with no title.
const sampleWebPages = [
  makeWebPage({ _id: 'wp1', url: 'https://example.com/a', domain: 'example.com', title: 'Onboarding Guide', fetchedAt: '2024-02-01T10:00:00Z' }),
  makeWebPage({ _id: 'wp2', url: 'https://broken.example.com/b', domain: 'broken.example.com', title: '404 page', lastFetchError: 'fetch failed: 404', fetchedAt: '2024-01-30T10:00:00Z' }),
  makeWebPage({ _id: 'wp3', url: 'https://no-title.example.com/c', domain: 'no-title.example.com', title: '', fetchedAt: '2024-01-20T10:00:00Z' }),
];

// Document rows: PDF + TXT + CSV of varying size.
const sampleDocuments = [
  makeDocument({ _id: 'd1', title: 'Onboarding handbook', filename: 'handbook.pdf', sizeBytes: 245678, pageCount: 12, uploadedAt: '2024-02-05T10:00:00Z' }),
  makeDocument({ _id: 'd2', title: 'FAQ seed', filename: 'faq-seed.txt', sizeBytes: 4096, pageCount: 0, uploadedAt: '2024-02-03T10:00:00Z' }),
  makeDocument({ _id: 'd3', title: 'Cohort roster', filename: 'roster.csv', sizeBytes: 1024, pageCount: 0, uploadedAt: '2024-02-01T10:00:00Z' }),
];

/**
 * Build a get-mock implementation that knows about:
 *  - /admin/web-pages (list) — returns webPagesPayload
 *  - /admin/documents (list) — returns documentsPayload
 *  - /admin/web-pages?page=1&limit=1 (count probe) — returns totals only
 *  - /admin/documents?page=1&limit=1 (count probe) — returns totals only
 */
function setupGetMock(opts: {
  webPages?: WebPagePayload | null;
  documents?: DocumentPayload | null;
  webPagesError?: unknown;
  documentsError?: unknown;
}) {
  mockApi.get.mockImplementation((url: string) => {
    if (typeof url !== 'string') return Promise.resolve({ data: paginated([], 0) });

    // Count probe (only on mount; limit=1)
    if (url === '/admin/web-pages' && url.includes('limit=1')) {
      return Promise.resolve({ data: paginated([], opts.webPages?.total ?? 0) });
    }
    if (url === '/admin/documents' && url.includes('limit=1')) {
      return Promise.resolve({ data: paginated([], opts.documents?.total ?? 0) });
    }

    // Active-tab fetch (limit=50)
    if (url.startsWith('/admin/web-pages')) {
      if (opts.webPagesError) return Promise.reject(opts.webPagesError);
      return Promise.resolve({ data: opts.webPages ?? paginated([], 0) });
    }
    if (url.startsWith('/admin/documents')) {
      if (opts.documentsError) return Promise.reject(opts.documentsError);
      return Promise.resolve({ data: opts.documents ?? paginated([], 0) });
    }

    return Promise.resolve({ data: paginated([], 0) });
  });
}

describe('AdminContextSources', () => {
  beforeEach(() => {
    mockApi.get.mockReset();
    mockApi.post.mockReset();
    mockApi.delete.mockReset();
    // Auto-confirm delete dialogs so tests don't hang.
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders both tabs with Web pages active by default', async () => {
    setupGetMock({ webPages: paginated([], 0) });

    render(<AdminContextSources />);

    const webTab = await screen.findByRole('tab', { name: /Web pages \(/ });
    const docTab = screen.getByRole('tab', { name: /Documents \(/ });

    expect(webTab).toBeInTheDocument();
    expect(docTab).toBeInTheDocument();

    expect(webTab.getAttribute('aria-selected')).toBe('true');
    expect(docTab.getAttribute('aria-selected')).toBe('false');

    // Default tab fetches web-pages.
    await waitFor(() => {
      const urls = mockApi.get.mock.calls.map((c) => c[0]);
      expect(urls).toContain('/admin/web-pages');
    });
  });

  it('shows the web-pages empty state when the list is empty', async () => {
    setupGetMock({ webPages: paginated([], 0) });

    render(<AdminContextSources />);

    expect(
      await screen.findByTestId('web-pages-empty'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No web pages indexed yet\./),
    ).toBeInTheDocument();
  });

  it('renders three web-page rows (including a broken row and one with no title)', async () => {
    setupGetMock({ webPages: paginated(sampleWebPages, 3) });

    render(<AdminContextSources />);

    const list = await screen.findByTestId('web-pages-list');
    const rows = list.querySelectorAll('[data-testid="web-pages-row"]');
    expect(rows).toHaveLength(3);

    // Title-bearing row
    expect(withinText(list, /Onboarding Guide/)).toBeTruthy();
    // URL renders as a clickable link
    const link = list.querySelector('a[href*="example.com/a"]');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('target')).toBe('_blank');
    // Broken row surfaces lastFetchError
    expect(withinText(list, /fetch failed: 404/)).toBeTruthy();
    // Title-less row falls back to URL
    expect(withinText(list, /no-title\.example\.com\/c/)).toBeTruthy();
  });

  it('adds a URL by POSTing to /admin/web-pages and refetches the list on success', async () => {
    let currentPages: Array<Record<string, unknown>> = [];
    mockApi.get.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.startsWith('/admin/web-pages')) {
        return Promise.resolve({ data: paginated(currentPages, currentPages.length) });
      }
      return Promise.resolve({ data: paginated([], 0) });
    });
    mockApi.post.mockImplementation((url: string, body: { url?: string }) => {
      if (url === '/admin/web-pages') {
        const newRow = makeWebPage({ _id: 'new', url: body?.url ?? '', domain: 'fresh.example.com', title: 'Fresh page' });
        currentPages = [newRow, ...currentPages];
        return Promise.resolve({ data: { ok: true, page: newRow } });
      }
      return Promise.resolve({ data: { ok: true } });
    });

    render(<AdminContextSources />);
    await screen.findByTestId('web-pages-empty');

    const input = screen.getByTestId('web-pages-url-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'https://fresh.example.com/' } });

    const addBtn = screen.getByTestId('web-pages-add-btn');
    fireEvent.click(addBtn);

    await waitFor(() => {
      const calls = mockApi.post.mock.calls.map((c) => c[0]);
      expect(calls).toContain('/admin/web-pages');
    });

    const addCall = mockApi.post.mock.calls.find((c) => c[0] === '/admin/web-pages');
    expect(addCall?.[1]).toEqual({ url: 'https://fresh.example.com/' });

    // After success, list refetches and the new row appears.
    await waitFor(() => {
      expect(screen.getByText(/Fresh page/)).toBeInTheDocument();
    });
    // And the input clears.
    expect((screen.getByTestId('web-pages-url-input') as HTMLInputElement).value).toBe('');
  });

  it('shows an error banner when the web-page POST fails (e.g. 422 unprocessable)', async () => {
    setupGetMock({ webPages: paginated([], 0) });
    const err422 = {
      response: { status: 422, data: { message: 'page has no extractable text' } },
    };
    mockApi.post.mockImplementation((url: string) => {
      if (url === '/admin/web-pages') return Promise.reject(err422);
      return Promise.resolve({ data: { ok: true } });
    });

    render(<AdminContextSources />);
    await screen.findByTestId('web-pages-empty');

    const input = screen.getByTestId('web-pages-url-input');
    fireEvent.change(input, { target: { value: 'https://example.com/blank' } });
    fireEvent.click(screen.getByTestId('web-pages-add-btn'));

    expect(
      await screen.findByTestId('web-pages-add-error'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no extractable text/i),
    ).toBeInTheDocument();
  });

  it('deletes a web page on Delete click (calls DELETE then refetches)', async () => {
    setupGetMock({ webPages: paginated(sampleWebPages, 3) });
    const deletedIds: string[] = [];
    mockApi.delete.mockImplementation((url: string) => {
      // url will be /admin/web-pages/wp2
      const m = /\/admin\/web-pages\/(.+)/.exec(url);
      if (m) deletedIds.push(m[1]);
      return Promise.resolve({ data: { ok: true } });
    });

    render(<AdminContextSources />);
    const list = await screen.findByTestId('web-pages-list');

    const deleteBtn = within(list).getAllByRole('button', { name: /Delete/ })[1];
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(deletedIds).toContain('wp2');
    });

    // window.confirm was called with the row's title (or URL).
    expect(window.confirm).toHaveBeenCalled();
    // A re-fetch happened (list get fires again).
    const getUrls = mockApi.get.mock.calls.map((c) => c[0]);
    expect(getUrls.filter((u: unknown) => typeof u === 'string' && (u as string).startsWith('/admin/web-pages')).length).toBeGreaterThan(1);
  });

  it('shows the documents tab content after switching and renders the empty state', async () => {
    setupGetMock({ documents: paginated([], 0), webPages: paginated([], 0) });

    render(<AdminContextSources />);
    await screen.findByTestId('web-pages-empty');

    fireEvent.click(screen.getByRole('tab', { name: /Documents \(/ }));

    expect(
      await screen.findByTestId('documents-empty'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No documents uploaded yet\./),
    ).toBeInTheDocument();
    // Documents tab now active.
    expect(
      screen.getByRole('tab', { name: /Documents \(/ }).getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('renders three document rows with size + page count', async () => {
    // Set up the mock so the documents endpoint returns our sample rows.
    mockApi.get.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.startsWith('/admin/documents')) {
        return Promise.resolve({ data: paginated(sampleDocuments, 3) });
      }
      if (typeof url === 'string' && url.startsWith('/admin/web-pages')) {
        return Promise.resolve({ data: paginated([], 0) });
      }
      return Promise.resolve({ data: paginated([], 0) });
    });

    render(<AdminContextSources />);
    fireEvent.click(await screen.findByRole('tab', { name: /Documents \(/ }));

    const list = await screen.findByTestId('documents-list');
    const rows = list.querySelectorAll('[data-testid="documents-row"]');
    expect(rows).toHaveLength(3);

    // Title-bearing row
    expect(withinText(list, /Onboarding handbook/)).toBeTruthy();
    // Filename surfaces below the title
    expect(withinText(list, /handbook\.pdf/)).toBeTruthy();
    // Page count badge (handbook is 12 pages)
    expect(withinText(list, /12 pages/)).toBeTruthy();
    // Size formatted as KB/MB (handbook is 245678 bytes -> 239.9 KB)
    expect(withinText(list, /239\.9 KB/)).toBeTruthy();
  });

  it('uploads a file by POSTing FormData to /admin/documents (multipart)', async () => {
    setupGetMock({ documents: paginated([], 0), webPages: paginated([], 0) });

    mockApi.post.mockImplementation((url: string, body: unknown, config?: { headers?: Record<string, string> }) => {
      if (url === '/admin/documents') {
        // The body should be a FormData with a `file` field.
        expect(body).toBeInstanceOf(FormData);
        const fd = body as FormData;
        expect(fd.get('file')).toBeInstanceOf(File);
        // The page should set multipart content-type so axios/browser
        // can attach the boundary.
        expect(config?.headers?.['Content-Type']).toMatch(/multipart\/form-data/);
        const newRow = makeDocument({
          _id: 'new',
          title: 'uploaded.pdf',
          filename: 'uploaded.pdf',
          sizeBytes: 12345,
          pageCount: 2,
        });
        return Promise.resolve({ data: { ok: true, document: newRow } });
      }
      return Promise.resolve({ data: { ok: true } });
    });

    render(<AdminContextSources />);
    fireEvent.click(await screen.findByRole('tab', { name: /Documents \(/ }));
    await screen.findByTestId('documents-empty');

    const file = new File(['hello world'], 'uploaded.pdf', { type: 'application/pdf' });
    const fileInput = screen.getByTestId('documents-file-input') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Selected-file hint surfaces.
    expect(await screen.findByTestId('documents-selected')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('documents-upload-btn'));

    await waitFor(() => {
      const calls = mockApi.post.mock.calls.map((c) => c[0]);
      expect(calls).toContain('/admin/documents');
    });
  });
});

// Local helper: textContent check scoped to a root element (mirrors what
// @testing-library/react's `within(...).getByText` would do, but without
// having to import within at the top).
function withinText(root: Element, matcher: RegExp): boolean {
  return Array.from(root.querySelectorAll('*')).some(
    (el) => el.textContent != null && matcher.test(el.textContent),
  );
}