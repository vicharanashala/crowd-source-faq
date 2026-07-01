import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { AuthProvider, useAuth, type User } from '@/hooks/useAuth';

// Must use vi.hoisted so mockApi is initialized before vi.mock hoists the factory
const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  interceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
}));

// Default-resolve every method so `api.post(...).catch(...)` doesn't blow
// up on unstubbed calls. Tests still override per-case with mockResolvedValueOnce.
beforeEach(() => {
  mockApi.get.mockResolvedValue({ data: null });
  mockApi.post.mockResolvedValue({ data: null });
  mockApi.patch.mockResolvedValue({ data: null });
  mockApi.put.mockResolvedValue({ data: null });
  mockApi.delete.mockResolvedValue({ data: null });
});

vi.mock('@/utils/api', () => ({ default: mockApi }));

describe('useAuth', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // ─── login ─────────────────────────────────────────────────────────────────

  it('login returns a User and stores token + user in localStorage', async () => {
    const fakeUser: User = { _id: 'user1', name: 'Alice', email: 'alice@example.com', role: 'user' };
    mockApi.post.mockResolvedValueOnce({ data: { token: 'jwt-token-abc', refreshToken: 'refresh-token-abc', user: fakeUser } });

    const { result } = renderHook(() => useAuth(), { wrapper });

    let returnedUser: User | null = null;
    await act(async () => {
      returnedUser = await result.current.login('alice@example.com', 'password123');
    });

    expect(returnedUser).toMatchObject({ _id: 'user1', name: 'Alice' });
    expect(localStorage.getItem('yaksha_token')).toBe('jwt-token-abc');
    expect(localStorage.getItem('yaksha_refresh_token')).toBe('refresh-token-abc');
    expect(localStorage.getItem('yaksha_user')).toContain('Alice');
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('login throws when API returns 401', async () => {
    mockApi.post.mockRejectedValueOnce({ response: { data: { message: 'Invalid credentials' } } });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await expect(result.current.login('bad@example.com', 'wrong')).rejects.toBeDefined();
    });

    expect(localStorage.getItem('yaksha_token')).toBeNull();
    expect(localStorage.getItem('yaksha_refresh_token')).toBeNull();
  });

  // ─── register ──────────────────────────────────────────────────────────────

  it('register returns a User and stores token + user in localStorage', async () => {
    const fakeUser: User = { _id: 'user2', name: 'Bob', email: 'bob@example.com', role: 'user' };
    mockApi.post.mockResolvedValueOnce({ data: { token: 'register-token', refreshToken: 'register-refresh-token', user: fakeUser } });

    const { result } = renderHook(() => useAuth(), { wrapper });

    let returnedUser: User | null = null;
    await act(async () => {
      returnedUser = await result.current.register('Bob', 'bob@example.com', 'secret123');
    });

    expect(returnedUser).toMatchObject({ _id: 'user2', name: 'Bob' });
    expect(localStorage.getItem('yaksha_token')).toBe('register-token');
    expect(localStorage.getItem('yaksha_refresh_token')).toBe('register-refresh-token');
    expect(result.current.isAuthenticated).toBe(true);
  });

  // ─── logout ────────────────────────────────────────────────────────────────

  it('logout clears user, isAuthenticated, and localStorage', async () => {
    const fakeUser: User = { _id: 'user1', name: 'Alice', email: 'alice@example.com', role: 'user' };
    mockApi.post.mockResolvedValueOnce({ data: { token: 'jwt-token', refreshToken: 'jwt-refresh-token', user: fakeUser } });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login('alice@example.com', 'password');
    });

    expect(result.current.isAuthenticated).toBe(true);

    act(() => {
      result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem('yaksha_token')).toBeNull();
    expect(localStorage.getItem('yaksha_refresh_token')).toBeNull();
    expect(localStorage.getItem('yaksha_user')).toBeNull();
  });

  // ─── initial state from localStorage ───────────────────────────────────────

  it('initializes with user from localStorage if token exists', async () => {
    const savedUser: User = { _id: 'saved', name: 'Carol', email: 'carol@example.com', role: 'user' };
    localStorage.setItem('yaksha_token', 'valid-token');
    localStorage.setItem('yaksha_user', JSON.stringify(savedUser));

    mockApi.get.mockResolvedValueOnce({ data: { user: savedUser } });

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Wait for the /me call triggered by useEffect on mount
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // The /me call should succeed and keep the user
    expect(mockApi.get).toHaveBeenCalledWith('/auth/me');
    expect(result.current.user).toMatchObject({ name: 'Carol' });
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('sets user to null when /me call fails on boot', async () => {
    localStorage.setItem('yaksha_token', 'stale-token');
    localStorage.setItem('yaksha_user', JSON.stringify({ _id: 'old', name: 'Old' }));

    mockApi.get.mockRejectedValueOnce({ response: { status: 401 } });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem('yaksha_token')).toBeNull();
  });
});