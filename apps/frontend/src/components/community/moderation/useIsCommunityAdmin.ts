/**
 * useIsCommunityAdmin.ts — Shared role-resolution hook.
 *
 * Extracted after review: the same `isAdmin ?? (role === 'admin' ||
 * role === 'moderator')` fallback was duplicated in both `AdminControls`
 * and `ImportantLinksTab`. Centralising it here means any future change
 * to who counts as a community admin (e.g. adding a new role) happens
 * in one place.
 *
 * Usage: pass an explicit `isAdmin` override when the caller already
 * resolved the role (e.g. an admin-only page); omit it to fall back to
 * the logged-in user's role via `useAuth()`.
 */

import { useAuth } from '../../../hooks/useAuth';

export function useIsCommunityAdmin(isAdmin?: boolean): boolean {
  const { user } = useAuth();
  return isAdmin ?? (user?.role === 'admin' || user?.role === 'moderator');
}
