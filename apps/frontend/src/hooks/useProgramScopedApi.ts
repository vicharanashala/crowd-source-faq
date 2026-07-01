/**
 * useProgramScopedApi — single source of truth for the active program.
 *
 * Every component that reads/writes program-scoped data goes through
 * one of these hooks so we never call the API with a stale or missing
 * batchId. Components that need to refetch when the active program
 * changes can pass `activeProgramId` into their useEffect dependency
 * array — the existing `useApi()` and `useEffect` patterns stay intact,
 * this hook just exposes a single derived value (the current batchId
 * as a string) plus a `withProgramId()` helper that injects it into
 * a request config.
 *
 * Why not React Query:
 *   - The frontend doesn't use React Query today and migrating would
 *     be a much larger PR. We keep the existing axios + useState
 *     pattern but ensure every scoped call goes through one helper.
 *   - When the active program changes, every page re-fetches via
 *     the activeProgramId dependency the component already passes.
 *     Components that load on mount get a one-time fetch; pages that
 *     watch the active program re-fetch automatically because they
 *     read `activeProgramId` from this hook.
 */

import { useMemo } from 'react';
import { useProgram } from '../context/ProgramContext';

/** Returns the current program's id as a string, or null if no
 *  program is selected. Use this as a useEffect dependency so the
 *  effect re-fires whenever the active program changes. */
export function useCurrentProgramId(): string | null {
  const { currentProgram } = useProgram();
  return currentProgram?._id ?? null;
}

/** Convenience: the same value, but as a stable string for use in
 *  API URLs / params. */
export function useProgramQueryParam(): string | null {
  return useCurrentProgramId();
}

/** Returns true if a program is currently selected. Useful for
 *  pages that should hide their content (and show a "pick a program"
 *  CTA) when there's no active program. */
export function useHasActiveProgram(): boolean {
  return useCurrentProgramId() !== null;
}

/** Returns the params object that should be passed to every
 *  program-scoped API call: `{ batchId: '<id>' }` when a program is
 *  active, `{}` otherwise (which the backend interprets as "no
 *  scope — return only the per-program override defaults"). */
export function useScopedParams(): { batchId?: string } {
  const id = useCurrentProgramId();
  return useMemo(() => (id ? { batchId: id } : {}), [id]);
}