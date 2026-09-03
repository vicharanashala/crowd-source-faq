/**
 * OfflinePage.test — unit tests for OfflinePage.tsx.
 * Covers: connection status display, service-worker-active status,
 * cached-count display, and install button gating on beforeinstallprompt.
 *
 * This is a pure add-on: no source file is modified.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';

vi.mock('../../offline/registerOfflineServiceWorker', () => ({
  isOfflineModeRegistered: vi.fn(() => false),
}));

import OfflinePage from '../OfflinePage';
import { isOfflineModeRegistered } from '../../offline/registerOfflineServiceWorker';

const mockIsRegistered = isOfflineModeRegistered as unknown as ReturnType<typeof vi.fn>;

describe('OfflinePage', () => {
  let originalOnLine: boolean;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockIsRegistered.mockReset();
    mockIsRegistered.mockReturnValue(false);
    originalOnLine = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true });
  });

  it('shows Online and "Starting up…" before the service worker is active', () => {
    render(<OfflinePage />);

    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByText('Starting up…')).toBeInTheDocument();
  });

  it('shows Offline when navigator.onLine is false at mount, and flips on the offline event', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    render(<OfflinePage />);

    expect(screen.getByText('Offline')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('shows Active and the cached FAQ count once the service worker registers', async () => {
    mockIsRegistered.mockReturnValue(true);
    (window as any).caches = {
      open: vi.fn().mockResolvedValue({
        keys: vi.fn().mockResolvedValue([{}, {}, {}]),
      }),
    };

    render(<OfflinePage />);

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(await screen.findByText('3')).toBeInTheDocument();
  });

  it('Install button is disabled until beforeinstallprompt fires', () => {
    render(<OfflinePage />);

    const installButton = screen.getByRole('button', { name: 'Install' });
    expect(installButton).toBeDisabled();

    act(() => {
      const evt = new Event('beforeinstallprompt') as any;
      evt.prompt = vi.fn().mockResolvedValue(undefined);
      evt.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(evt);
    });

    expect(installButton).not.toBeDisabled();
  });

  it('hides the install card once the appinstalled event fires', () => {
    render(<OfflinePage />);
    expect(screen.getByText('Install the app')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(screen.queryByText('Install the app')).not.toBeInTheDocument();
  });
});
