/**
 * ProgramContext — app-level provider for the currently selected
 * program (Batch under the hood — see the v1.69 multi-program
 * rename). Every page that shows FAQs, categories, or analytics
 * reads `currentProgram` from this context and passes `?batchId=X`
 * on its API calls. Switching is instant, persisted to
 * localStorage, and survives reloads.
 *
 * v1.69 — Phase 12: this file is the canonical ProgramContext
 * (the v1.69+ home). The legacy `BatchContext.tsx` file is a
 * re-export shim — new code should import from
 * `../context/ProgramContext`; old code that imports from
 * `../context/BatchContext` keeps working.
 *
 * Hierarchy of resolution when the provider first boots:
//   1. URL query param  ?batch=<id>      (highest priority — lets us deep-link)
//   2. localStorage     yaksha_active_program_id (falls back to old yaksha_active_batch_id)
//   3. First program returned by /api/batches
//   4. null             (ProgramPortalPage takes over)
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api, { clearApiCache } from '../utils/api';

export interface Program {
  _id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  /** True for the single program the ProgramContext should auto-pick on
   *  cold start. Enforced unique by a partial index on the model. */
  isDefault?: boolean;
  faqCount: number;
}

/** @deprecated Use `Program` instead. The type alias is preserved for
 *  the many call sites that haven't been renamed yet. */
export type Batch = Program;

interface ProgramContextValue {
  /** The currently selected program, or null if the user hasn't picked one yet. */
  currentProgram: Program | null;
  /** All active programs the user can switch to. Empty until first load. */
  availablePrograms: Program[];
  /** True while the initial /api/batches request is in flight. */
  loading: boolean;
  /** Network or validation error from the initial load (non-fatal). */
  error: string | null;
  /** Switch the active program. Persists to localStorage. */
  setCurrentProgram: (id: string) => boolean;
  /** Clear the active program — caller should redirect to the picker. */
  clearCurrentProgram: () => void;
  /** Re-fetch the list of available programs (e.g. after admin creates one). */
  refresh: () => Promise<void>;

  // ─── Legacy aliases (v1.69 — additive rename) ─────────────────────
  // These mirror the new names so existing callers don't break. New
  // code should use the `useProgram()` / `currentProgram` /
  // `availablePrograms` exports.
  currentBatch: Program | null;
  availableBatches: Program[];
  setCurrentBatch: (id: string) => boolean;
  clearCurrentBatch: () => void;
}

const ProgramContext = createContext<ProgramContextValue | null>(null);

const STORAGE_KEY_NEW = 'yaksha_active_program_id';
const STORAGE_KEY_OLD = 'yaksha_active_batch_id';

// Safety net: never let the initial load hang the UI indefinitely.
// If the API doesn't respond within this window, we treat it as an empty
// list and let the ProgramPortalPage take over.
const INITIAL_LOAD_TIMEOUT_MS = 5000;

export function useProgram(): ProgramContextValue {
  const ctx = useContext(ProgramContext);
  if (!ctx) {
    throw new Error('useProgram must be used inside a <ProgramProvider>');
  }
  return ctx;
}

/** @deprecated Use `useProgram()` instead. Kept for the many call
 *  sites that haven't been renamed yet. */
export function useBatch(): ProgramContextValue {
  return useProgram();
}

interface ProgramProviderProps {
  children: React.ReactNode;
}

export function ProgramProvider({ children }: ProgramProviderProps): React.ReactElement {
  const [availablePrograms, setAvailablePrograms] = useState<Program[]>([]);
  const [currentProgram, setCurrentProgramState] = useState<Program | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const location = useLocation();

  // Sync batch parameter to the URL query string
  useEffect(() => {
    if (currentProgram) {
      const url = new URL(window.location.href);
      if (url.searchParams.get('batch') !== currentProgram._id) {
        url.searchParams.set('batch', currentProgram._id);
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [currentProgram, location.pathname]);

  // ── Load the list of active programs ─────────────────────────────────────
  const loadPrograms = useCallback(async (): Promise<Program[]> => {
    try {
      const res = await api.get<{ batches: Program[] }>('/batches');
      return res.data.batches ?? [];
    } catch {
      // Non-fatal: the public page can still render with an empty list
      // and a friendly "no programs" empty state.
      setError('Could not load programs. Please refresh.');
      return [];
    }
  }, []);

  // ── Pick the initial program per the resolution order in the file header ──
  //
  // Strict resolution chain. We NEVER silently switch the user to a
  // different program because the one they picked happens to be empty:
  //   1. URL ?batch=<id>           (explicit deep-link — wins)
  //   2. localStorage yaksha_active_program_id (explicit prior choice)
  //   3. localStorage yaksha_active_batch_id   (legacy key)
  //   4. Server-reported isDefault: true (admin-promoted default)
  //   5. Server-reported non-empty program (fallback)
  //   6. First program in the list     (last resort)
  //
  // The old behaviour ("auto-promote away from empty stored programs")
  // caused data-isolation regressions: a user who explicitly chose an
  // empty program (e.g. the one they just created) would silently land
  // on a different program on next refresh and never know why. We now
  // respect the explicit choice. If you want to switch back to a
  // populated default, click the program switcher in the header.

  const resolveInitial = useCallback((programs: Program[], fromUrl: string | null): Program | null => {
    if (programs.length === 0) return null;

    // 1. URL deep-link wins
    if (fromUrl) {
      const fromUrlMatch = programs.find((p) => p._id === fromUrl);
      if (fromUrlMatch) return fromUrlMatch;
    }

    // 2 + 3. localStorage explicit choice
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY_NEW)
        ?? window.localStorage.getItem(STORAGE_KEY_OLD);
    } catch { /* localStorage disabled */ }
    if (stored) {
      const storedMatch = programs.find((p) => p._id === stored);
      if (storedMatch) return storedMatch;
    }

    // 4. Server-reported isDefault (admin-promoted default program)
    const defaultProgram = programs.find((p) => p.isDefault);
    if (defaultProgram) return defaultProgram;

    // 5. Non-empty program (fallback)
    const nonEmpty = programs.find((p) => p.faqCount > 0);
    if (nonEmpty) return nonEmpty;

    // 6. First program (last resort — could be empty)
    return programs[0];
  }, []);

  // ── Initial mount: fetch + resolve ──────────────────────────────────────
  // Note: no useSearchParams and no useRef "run once" guard. Both caused
  // the loading state to get stuck in dev (StrictMode double-invokes
  // effects; the ref-based guard cancelled the only in-flight async).
  // The effect runs once, and the per-effect `cancelled` flag handles
  // StrictMode's cleanup properly.
  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      // Fetch is hung — treat as empty so the picker takes over.
      setError('Loading timed out. Please refresh.');
      setAvailablePrograms([]);
      setCurrentProgramState(null);
      setLoading(false);
    }, INITIAL_LOAD_TIMEOUT_MS);

    (async () => {
      setLoading(true);
      try {
        const programs = await loadPrograms();
        if (cancelled) return;
        // Read URL once at mount time, not via useSearchParams (which can
        // re-fire this effect and re-cancel an in-flight fetch).
        const fromUrl = new URLSearchParams(window.location.search).get('batch');
        const picked = resolveInitial(programs, fromUrl);
        if (cancelled) return;
        setAvailablePrograms(programs);
        setCurrentProgramState(picked);
        if (picked) {
          try { window.localStorage.setItem(STORAGE_KEY_NEW, picked._id); } catch { /* ignore */ }
          // Strip the query param so the URL is clean. Use history.replaceState
          // so we don't re-trigger this effect via the router.
          if (fromUrl) {
            const url = new URL(window.location.href);
            url.searchParams.delete('batch');
            window.history.replaceState({}, '', url.toString());
          }
        }
      } catch {
        if (cancelled) return;
        setError('Could not load programs. Please refresh.');
        setAvailablePrograms([]);
        setCurrentProgramState(null);
      } finally {
        clearTimeout(timeoutId);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [loadPrograms, resolveInitial]);

  // ── Public setters ──────────────────────────────────────────────────────────
  const setCurrentProgram = useCallback((id: string): boolean => {
    const found = availablePrograms.find((p) => p._id === id);
    if (!found) return false;
    clearApiCache();
    setCurrentProgramState(found);
    try {
      window.localStorage.setItem(STORAGE_KEY_NEW, id);
      // Persist to URL too so a refresh / deep-link keeps the choice.
      // Uses history.replaceState so it doesn't trigger router re-renders.
      const url = new URL(window.location.href);
      url.searchParams.set('batch', id);
      window.history.replaceState({}, '', url.toString());
    } catch { /* localStorage / history disabled */ }
    return true;
  }, [availablePrograms]);

  const clearCurrentProgram = useCallback((): void => {
    clearApiCache();
    setCurrentProgramState(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY_NEW);
      const url = new URL(window.location.href);
      url.searchParams.delete('batch');
      window.history.replaceState({}, '', url.toString());
    } catch { /* ignore */ }
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    const programs = await loadPrograms();
    setAvailablePrograms(programs);
    // Preserve the user's explicit choice on refresh. Only pick a
    // replacement if the current program has truly disappeared from
    // the server (e.g. admin deleted it). This matches the same
    // "respect the explicit choice" rule as resolveInitial().
    setCurrentProgramState((prev) => {
      if (prev && programs.some((p) => p._id === prev._id)) return prev;
      // Current program vanished — fall back to the same strict chain.
      return programs.find((p) => p.isDefault)
        ?? programs.find((p) => p.faqCount > 0)
        ?? programs[0]
        ?? null;
    });
    setLoading(false);
  }, [loadPrograms]);

  // ── URL → state sync (back/forward navigation, manual URL edits) ─────
  // The initial mount reads the URL once. This listener keeps URL
  // changes in sync with the active program after mount, so navigating
  // with browser back/forward actually moves between programs instead
  // of leaving the URL out of sync with currentProgram.
  useEffect(() => {
    const onPopState = (): void => {
      const fromUrl = new URLSearchParams(window.location.search).get('batch');
      if (!fromUrl) {
        // URL cleared — fall back to localStorage / defaults via refresh.
        void refresh();
        return;
      }
      const match = availablePrograms.find((p) => p._id === fromUrl);
      if (match) {
        setCurrentProgramState(match);
        try { window.localStorage.setItem(STORAGE_KEY_NEW, fromUrl); } catch { /* ignore */ }
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [availablePrograms, refresh]);

  // ── Legacy aliases for additive backwards compatibility ─────────────
  // These mirror the new names so every existing `useBatch()` /
  // `currentBatch` / `availableBatches` / `setCurrentBatch` /
  // `clearCurrentBatch` call site keeps working.
  const setCurrentBatch = setCurrentProgram;
  const clearCurrentBatch = clearCurrentProgram;
  const currentBatch = currentProgram;
  const availableBatches = availablePrograms;

  const value = useMemo<ProgramContextValue>(() => ({
    currentProgram,
    availablePrograms,
    loading,
    error,
    setCurrentProgram,
    clearCurrentProgram,
    refresh,
    // Legacy aliases
    currentBatch,
    availableBatches,
    setCurrentBatch,
    clearCurrentBatch,
  }), [
    currentProgram,
    availablePrograms,
    loading,
    error,
    setCurrentProgram,
    clearCurrentProgram,
    refresh,
    currentBatch,
    availableBatches,
    setCurrentBatch,
    clearCurrentBatch,
  ]);

  return <ProgramContext.Provider value={value}>{children}</ProgramContext.Provider>;
}

/** @deprecated Use `ProgramProvider` instead. The component name is
 *  preserved for the existing tree. */
export function BatchProvider(props: ProgramProviderProps): React.ReactElement {
  return <ProgramProvider {...props} />;
}

// Default export preserved for legacy imports.
export default ProgramProvider;
