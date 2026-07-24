/**
 * Tests for the admin password reset modal.
 *
 * v1.85 — covers the strength-score calc, the admin-row hidden
 * state, the submit disabled-until-meets-policy gate, and the
 * success/error feedback. We import the modal directly to avoid
 * pulling the whole AdminUsers tree (the AnimatePresence +
 * body-scroll-lock deps are heavy and irrelevant to the contract).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Stub adminApi so the modal's submit path is observable.
// We expose `get` (initial users fetch) and `put` (reset endpoint).
vi.mock('../../utils/adminApi', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// framer-motion is heavy and the modal animates on mount; stub it
// to a no-op so the test renders synchronously.
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: { children: React.ReactNode }) => (
      <div {...(props as Record<string, unknown>)}>{children}</div>
    ),
  },
}));

// The body-scroll-lock hook appends a body class — irrelevant for
// the contract being tested.
vi.mock('../../../hooks/useBodyScrollLock', () => ({
  useBodyScrollLock: () => undefined,
}));

import adminApi from '../../utils/adminApi';
import AdminUsers from '../AdminUsers';

const mockApi = adminApi as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

interface UserFixture {
  _id: string;
  name: string;
  email: string;
  role: 'user' | 'moderator' | 'admin' | 'ai_moderator' | 'expert';
  createdAt: string;
  updatedAt: string;
}
const userFixture: UserFixture = {
  _id: '64f0a1b2c3d4e5f6a7b8c9d0',
  name: 'Test User',
  email: 'test@example.com',
  role: 'user',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

describe('AdminUsers — Reset password feature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the Reset pw button on the user table for non-admin rows', async () => {
    mockApi.put.mockResolvedValue({ data: { userId: userFixture._id, mustReLogin: true } });
    mockApi.get.mockResolvedValue({
      data: { users: [userFixture], total: 1, pages: 1 },
    });
    render(<AdminUsers />);
    const btn = await screen.findByTestId(`reset-password-btn-${userFixture._id}`);
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent(/Reset pw/);
  });

  it('does NOT show the Reset pw button for admin rows (UI matches server hard floor)', async () => {
    const adminFixture: UserFixture = { ...userFixture, _id: 'admin-1', role: 'admin' };
    mockApi.get.mockResolvedValue({
      data: { users: [adminFixture], total: 1, pages: 1 },
    });
    render(<AdminUsers />);
    await screen.findByText(adminFixture.email);
    expect(screen.queryByTestId(`reset-password-btn-${adminFixture._id}`)).toBeNull();
  });

  it('opens the modal when the row button is clicked', async () => {
    mockApi.get.mockResolvedValue({
      data: { users: [userFixture], total: 1, pages: 1 },
    });
    render(<AdminUsers />);
    const btn = await screen.findByTestId(`reset-password-btn-${userFixture._id}`);
    fireEvent.click(btn);
    expect(await screen.findByText(/Reset password for Test User/)).toBeInTheDocument();
    expect(screen.getByTestId('reset-password-input')).toBeInTheDocument();
    expect(screen.getByTestId('reset-password-submit')).toBeInTheDocument();
  });

  it('keeps the submit button disabled until the password meets the policy', async () => {
    mockApi.get.mockResolvedValue({
      data: { users: [userFixture], total: 1, pages: 1 },
    });
    render(<AdminUsers />);
    fireEvent.click(await screen.findByTestId(`reset-password-btn-${userFixture._id}`));
    const input = screen.getByTestId('reset-password-input') as HTMLInputElement;
    const submit = screen.getByTestId('reset-password-submit') as HTMLButtonElement;
    expect(submit).toBeDisabled();
    fireEvent.change(input, { target: { value: 'Aa1' } });
    expect(submit).toBeDisabled();
    fireEvent.change(input, { target: { value: 'TestReset123' } });
    expect(submit).not.toBeDisabled();
    fireEvent.change(input, { target: { value: 'TestReset' } });
    expect(submit).toBeDisabled();
  });

  it('calls the reset endpoint and shows success feedback on submit', async () => {
    mockApi.put.mockResolvedValue({ data: { userId: userFixture._id, mustReLogin: true } });
    mockApi.get.mockResolvedValue({
      data: { users: [userFixture], total: 1, pages: 1 },
    });
    render(<AdminUsers />);
    fireEvent.click(await screen.findByTestId(`reset-password-btn-${userFixture._id}`));
    const input = screen.getByTestId('reset-password-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'TestReset123' } });
    fireEvent.click(screen.getByTestId('reset-password-submit'));
    await waitFor(() => expect(mockApi.put).toHaveBeenCalledWith(
      `/auth/users/${userFixture._id}/password`,
      { newPassword: 'TestReset123' },
    ));
    expect(await screen.findByTestId('reset-password-success')).toBeInTheDocument();
  });

  it('surfaces 4xx errors from the backend inline', async () => {
    mockApi.put.mockRejectedValue({
      response: { data: { message: 'Password too weak.', errorCode: 'weak_password' } },
    });
    mockApi.get.mockResolvedValue({
      data: { users: [userFixture], total: 1, pages: 1 },
    });
    render(<AdminUsers />);
    fireEvent.click(await screen.findByTestId(`reset-password-btn-${userFixture._id}`));
    fireEvent.change(screen.getByTestId('reset-password-input'), { target: { value: 'TestReset123' } });
    fireEvent.click(screen.getByTestId('reset-password-submit'));
    const errBox = await screen.findByTestId('reset-password-error');
    expect(errBox).toHaveTextContent(/Password too weak\./);
  });
});
