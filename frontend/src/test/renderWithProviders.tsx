import { type ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/hooks/useAuth';

/**
 * Simulates a signed-in user the same way AuthProvider actually hydrates
 * in the browser: from localStorage, synchronously, before first render.
 * Call this BEFORE render() / renderWithProviders().
 */
export function mockSignedInUser(overrides: Record<string, unknown> = {}) {
  const user = { _id: 'test-user-1', name: 'Test User', email: 'test@example.com', ...overrides };
  localStorage.setItem('yaksha_user', JSON.stringify(user));
  localStorage.setItem('yaksha_token', 'test-token');
  return user;
}

export function renderWithProviders(ui: ReactElement) {
  return render(
    <MemoryRouter>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>
  );
}
