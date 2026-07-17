/**
 * useTeeEligibility — Sign My Tee
 *
 * Thin wrapper around the BE `/api/tee/me/eligibility` endpoint that
 * the navbar pill, the gate provider, and the wizard CTA all rely
 * on. Cached for the duration of a page session — eligibility
 * doesn't change second-to-second (the window is days), so we
 * re-fetch only on mount + on user invalidation.
 *
 * Returns `{ eligible, requiresInternshipEndDate, endDate,
 * hasConfiguredTee, shareId, refresh }`. The `refresh` callback
 * lets the gate provider re-fetch after the user successfully
 * saves an end date without remounting the component tree.
 *
 * v1.87.8 — auth-aware lifecycle. The hook now re-fetches whenever
 * `isAuthenticated` flips to `true`, not just on initial mount.
 * The pre-fix behaviour was: hook mounts at app boot (pre-login),
 * fires one unauthenticated `/tee/me/eligibility` call, gets 401,
 * silently stays at the `EMPTY` default, and never re-runs. When
 * the user later logged in, every consumer (the gate, the navbar
 * pill, the wizard CTA) read the cached `EMPTY` state and saw
 * `requiresInternshipEndDate=false` — the gate never opened and
 * the pill never appeared until a hard page refresh, which
 * remounted the hook with a fresh auth context. The fix: read
 * `useAuth().isAuthenticated` and refetch when it transitions to
 * `true`, so the same hook instance serves correct data after a
 * hot login.
 */
import { useEffect, useState, useCallback } from 'react';
import api from '../utils/api';
import { useAuth } from './useAuth';

export interface TeeEligibility {
  eligible: boolean;
  requiresInternshipEndDate: boolean;
  endDate: string | null;
  hasConfiguredTee: boolean;
  shareId: string | null;
}

interface ApiResp {
  eligible: boolean;
  requiresInternshipEndDate: boolean;
  endDate: string | null;
  hasConfiguredTee: boolean;
  shareId: string | null;
}

const EMPTY: TeeEligibility = {
  eligible: false,
  requiresInternshipEndDate: false,
  endDate: null,
  hasConfiguredTee: false,
  shareId: null,
};

export function useTeeEligibility(): TeeEligibility & { refresh: () => Promise<void>; loading: boolean } {
  const { isAuthenticated } = useAuth();
  const [state, setState] = useState<TeeEligibility>(EMPTY);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<ApiResp>('/tee/me/eligibility');
      setState({
        eligible: !!r.data.eligible,
        requiresInternshipEndDate: !!r.data.requiresInternshipEndDate,
        endDate: r.data.endDate ?? null,
        hasConfiguredTee: !!r.data.hasConfiguredTee,
        shareId: r.data.shareId ?? null,
      });
    } catch {
      // Stay at EMPTY — navbar pill stays hidden, modal stays closed.
      // Logout path explicitly resets to EMPTY via the auth-watcher
      // effect below, so a stale state from a prior user can't leak
      // into the next session.
    } finally {
      setLoading(false);
    }
  }, []);

  // Auth-aware fetch. Refires on every `isAuthenticated` transition:
  //   false → true  : hot login — hit eligibility with the new token.
  //   true  → false : logout — reset to EMPTY so no stale state leaks.
  // External `refresh()` calls (gate's onResolved) bypass this effect
  // by calling `refresh` directly, so they don't double-fire.
  useEffect(() => {
    if (!isAuthenticated) {
      setState(EMPTY);
      return;
    }
    refresh();
  }, [isAuthenticated, refresh]);

  return { ...state, refresh, loading };
}
