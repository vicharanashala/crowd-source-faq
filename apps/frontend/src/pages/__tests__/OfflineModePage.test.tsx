/**
 * OfflineModePage.test.tsx — covers the Offline Mode settings page:
 * service worker status detection, the manual cache-refresh action,
 * and the install-as-app button's enabled/disabled state.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// Mock the registration utility so the test doesn't touch a real
// service worker or Cache Storage API.
const mockRegister = vi.fn(async () => {});
const mockGetCachedFaqCount = vi.fn(async () => 3);

vi.mock('../../utils/registerServiceWorker', () => ({
  registerOfflineServiceWorker: (...args: unknown[]) => mockRegister(...args),
  getCachedFaqCount: (...args: unknown[]) => mockGetCachedFaqCount(...args),
}));

import OfflineModePage from '../OfflineModePage';

function renderPage() {
  return render(
    <MemoryRouter>
      <OfflineModePage />
    </MemoryRouter>,
  );
}

describe('OfflineModePage', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCachedFaqCount.mockResolvedValue(3);

    // Stub navigator.serviceWorker.ready so the page can resolve a
    // "worker is active" state without a real service worker.
    Object.defineProperty(global.navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({ active: {} }),
        getRegistration: vi.fn(async () => undefined),
      },
    });

    global.fetch = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders the page title and description', () => {
    renderPage();
    expect(screen.getByText('Offline Mode')).toBeInTheDocument();
    expect(screen.getByText(/previously-loaded FAQs stay available/i)).toBeInTheDocument();
  });

  it('shows the service worker as active once registration resolves', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Active — offline caching is running/i)).toBeInTheDocument();
    });
    expect(mockRegister).toHaveBeenCalledTimes(1);
  });

  it('shows the cached FAQ count returned by getCachedFaqCount', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/3 cached response\(s\)/i)).toBeInTheDocument();
    });
  });

  it('re-fetches and updates the cached count when "Refresh now" is clicked', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/3 cached response\(s\)/i)).toBeInTheDocument();
    });

    mockGetCachedFaqCount.mockResolvedValueOnce(7);
    fireEvent.click(screen.getByText('Refresh now'));

    await waitFor(() => {
      expect(screen.getByText(/7 cached response\(s\)/i)).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith('/csfaq/api/faq', { cache: 'no-store' });
  });

  it('disables the Install button until a beforeinstallprompt event fires', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Active — offline caching is running/i)).toBeInTheDocument();
    });

    const installButton = screen.getByRole('button', { name: 'Install' });
    expect(installButton).toBeDisabled();
    expect(screen.getByText(/Install prompt not available/i)).toBeInTheDocument();
  });
});
