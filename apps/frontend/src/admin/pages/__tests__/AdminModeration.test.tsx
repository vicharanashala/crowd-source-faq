import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  let stateCall = 0;
  return {
    ...actual,
    useState: <T,>(initialValue: T | (() => T)) => {
      const call = stateCall++ % 20;
      return actual.useState(call === 6 ? { userId: 'user-1', name: 'Test User' } as T : initialValue);
    },
  };
});

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: { children: React.ReactNode }) => (
      <div {...(props as Record<string, unknown>)}>{children}</div>
    ),
  },
}));

vi.mock('../../../hooks/useBodyScrollLock', () => ({
  useBodyScrollLock: () => undefined,
}));

vi.mock('../../utils/adminApi', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import adminApi from '../../utils/adminApi';
import AdminModeration from '../AdminModeration';

const mockApi = adminApi as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

describe('AdminModeration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockImplementation((path: string) => {
      if (path === '/moderation/queue') return Promise.resolve({ data: { banned: [], suspended: [] } });
      return Promise.resolve({ data: { logs: [], total: 0 } });
    });
  });

  it('keeps the warning modal open and shows an error when the action fails', async () => {
    mockApi.post.mockRejectedValue({ response: { data: { message: 'Warning could not be sent.' } } });
    render(<AdminModeration />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Test reason' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Warning' }));

    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith(
      '/moderation/warn',
      { userId: 'user-1', reason: 'Test reason' },
    ));
    expect(await screen.findByText('Warning could not be sent.')).toBeInTheDocument();
    expect(screen.getByText('Warn Test User')).toBeInTheDocument();
  });

  it('closes the warning modal after a successful action', async () => {
    mockApi.post.mockResolvedValue({ data: {} });
    render(<AdminModeration />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Test reason' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Warning' }));

    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith(
      '/moderation/warn',
      { userId: 'user-1', reason: 'Test reason' },
    ));
    await waitFor(() => expect(screen.queryByText('Warn Test User')).toBeNull());
  });
});
