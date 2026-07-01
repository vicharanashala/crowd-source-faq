/**
 * useProgramScopedFetch — invalidate-and-refetch on program switch.
 *
 * Wraps a fetcher so it re-runs whenever the active program changes.
 * Pages that load data on mount can use this instead of the bare
 * useEffect so the data is automatically refetched when the user
 * switches programs. Until now pages had to either pass
 * `activeProgramId` into their dependency array manually or risk
 * showing stale data after a switch.
 *
 * Usage:
 *   useProgramScopedFetch(async (programId) => {
 *     const res = await adminApi.get('/admin/welcome/projects', {
 *       params: { batchId: programId }
 *     });
 *     setProjects(res.data);
 *   }, []);
 *
 * The fetcher receives the active program id (or null if no program
 * is selected). When the id is null, the fetcher is NOT called — the
 * caller should set loading=false and clear state.
 */

import { useEffect, useRef } from 'react';
import { useCurrentProgramId } from './useProgramScopedApi';

export function useProgramScopedFetch(
  fetcher: (programId: string | null) => Promise<void> | void,
  deps: ReadonlyArray<unknown> = [],
): void {
  const activeProgramId = useCurrentProgramId();
  // Latest-fetcher ref so the effect doesn't capture a stale closure
  // when the fetcher identity changes between renders.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const fn = fetcherRef.current;
    // Only invoke the fetcher when a program is actually selected.
    // Pages that need to clear their state on no-program should do so
    // in a separate effect — this helper is for "I want to refetch
    // whenever the program changes" only.
    if (activeProgramId !== null) {
      void fn(activeProgramId);
    }
  }, [activeProgramId, ...deps]);
}