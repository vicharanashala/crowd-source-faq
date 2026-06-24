import { useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';

/**
 * useRequireAuth – hook version of the auth guard
 *
 * Usage:
 *   const guard = useRequireAuth();
 *   guard(() => likeFAQ(id));
 */
export function useRequireAuth() {
  const { isLoggedIn, openAuth } = useAuth();

  return useCallback(
    (action) => {
      if (isLoggedIn) {
        action();
      } else {
        openAuth(action);
      }
    },
    [isLoggedIn, openAuth]
  );
}
