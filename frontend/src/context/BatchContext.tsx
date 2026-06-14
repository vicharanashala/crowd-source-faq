// BatchContext — app-level provider for the currently selected program
// (Batch). Every page that shows FAQs, categories, or analytics reads
// `currentBatch` from this context and passes `?batchId=X` on its API
// calls. Switching is instant, persisted to localStorage, and survives
// reloads.
//
// Hierarchy of resolution when the provider first boots:
//   1. URL query param  ?batch=<id>      (highest priority — lets us deep-link)
//   2. localStorage     yaksha_active_batch_id
//   3. First batch returned by /api/batches
//   4. null             (BatchPortalPage takes over)

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../utils/api';

export interface Batch {
  _id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  /** True for the single batch the BatchContext should auto-pick on
   *  cold start. Enforced unique by a partial index on the model. */
  isDefault?: boolean;
  faqCount: number;
}

interface BatchContextValue {
  /** The currently selected batch, or null if the user hasn't picked one yet. */
  currentBatch: Batch | null;
  /** All active batches the user can switch to. Empty until first load. */
  availableBatches: Batch[];
  /** True while the initial /api/batches request is in flight. */
  loading: boolean;
  /** Network or validation error from the initial load (non-fatal). */
  error: string | null;
  /** Switch the active batch. Persists to localStorage. */
  setCurrentBatch: (id: string) => boolean;
  /** Clear the active batch — caller should redirect to the picker. */
  clearCurrentBatch: () => void;
  /** Re-fetch the list of available batches (e.g. after admin creates one). */
  refresh: () => Promise<void>;
}

const BatchContext = createContext<BatchContextValue | null>(null);

const STORAGE_KEY = 'yaksha_active_batch_id';

// Safety net: never let the initial load hang the UI indefinitely.
// If the API doesn't respond within this window, we treat it as an empty
// list and let the BatchPortalPage take over.
const INITIAL_LOAD_TIMEOUT_MS = 5000;

export function useBatch(): BatchContextValue {
  const ctx = useContext(BatchContext);
  if (!ctx) {
    throw new Error('useBatch must be used inside a <BatchProvider>');
  }
  return ctx;
}

interface BatchProviderProps {
  children: React.ReactNode;
}

export function BatchProvider({ children }: BatchProviderProps): React.ReactElement {
  const [availableBatches, setAvailableBatches] = useState<Batch[]>([]);
  const [currentBatch, setCurrentBatchState] = useState<Batch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Load the list of active batches ──────────────────────────────────────
  const loadBatches = useCallback(async (): Promise<Batch[]> => {
    try {
      const res = await api.get<{ batches: Batch[] }>('/batches');
      return res.data.batches ?? [];
    } catch {
      // Non-fatal: the public page can still render with an empty list
      // and a friendly "no programs" empty state.
      setError('Could not load programs. Please refresh.');
      return [];
    }
  }, []);

  // ── Pick the initial batch per the resolution order in the file header ──
  //
  // Among the candidates returned by the API, prefer a batch that already
  // has FAQs — otherwise the home page lands on an empty program (e.g. a
  // newly-created "test" batch) and the public visitor sees three "no data"
  // cards with no obvious next step. We only do this auto-pick on the
  // initial resolution / refresh; explicit user choice via setCurrentBatch
  // is never overridden.
  const resolveInitial = useCallback((batches: Batch[], fromUrl: string | null): Batch | null => {
    if (batches.length === 0) return null;

    let picked: Batch | undefined;

    if (fromUrl) {
      picked = batches.find((b) => b._id === fromUrl);
    }

    if (!picked) {
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(STORAGE_KEY);
      } catch { /* localStorage disabled */ }
      if (stored) {
        picked = batches.find((b) => b._id === stored);
      }
    }

    if (!picked) {
      // Cold-start default: prefer a batch explicitly flagged
      // `isDefault: true` (admin can promote one from /admin/batches);
      // then a non-empty batch so the home page actually has data;
      // then the first batch as a last resort.
      picked =
        batches.find((b) => b.isDefault)
        ?? batches.find((b) => b.faqCount > 0)
        ?? batches[0];
    } else if (picked.faqCount === 0) {
      // The stored / deep-linked batch is empty AND a non-empty alternative
      // exists — auto-promote to the non-empty one so the page isn't a
      // dead end. Persist the new pick so the user doesn't bounce back on
      // the next reload.
      const nonEmpty = batches.find((b) => b.faqCount > 0);
      if (nonEmpty) {
        picked = nonEmpty;
        try { window.localStorage.setItem(STORAGE_KEY, nonEmpty._id); } catch { /* ignore */ }
      }
    }

    return picked;
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
      setAvailableBatches([]);
      setCurrentBatchState(null);
      setLoading(false);
    }, INITIAL_LOAD_TIMEOUT_MS);

    (async () => {
      setLoading(true);
      try {
        const batches = await loadBatches();
        if (cancelled) return;
        // Read URL once at mount time, not via useSearchParams (which can
        // re-fire this effect and re-cancel an in-flight fetch).
        const fromUrl = new URLSearchParams(window.location.search).get('batch');
        const picked = resolveInitial(batches, fromUrl);
        if (cancelled) return;
        setAvailableBatches(batches);
        setCurrentBatchState(picked);
        if (picked) {
          try { window.localStorage.setItem(STORAGE_KEY, picked._id); } catch { /* ignore */ }
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
        setAvailableBatches([]);
        setCurrentBatchState(null);
      } finally {
        clearTimeout(timeoutId);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [loadBatches, resolveInitial]);

  // ── Public setters ──────────────────────────────────────────────────────
  const setCurrentBatch = useCallback((id: string): boolean => {
    const found = availableBatches.find((b) => b._id === id);
    if (!found) return false;
    setCurrentBatchState(found);
    try { window.localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
    return true;
  }, [availableBatches]);

  const clearCurrentBatch = useCallback((): void => {
    setCurrentBatchState(null);
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    const batches = await loadBatches();
    setAvailableBatches(batches);
    // If the current batch disappeared, pick a non-empty alternative first,
    // then fall back to the first batch (preserves the old behaviour when
    // no batch has data).
    setCurrentBatchState((prev) => {
      if (prev && batches.some((b) => b._id === prev._id)) return prev;
      return batches.find((b) => b.faqCount > 0) ?? batches[0] ?? null;
    });
    setLoading(false);
  }, [loadBatches]);

  const value = useMemo<BatchContextValue>(() => ({
    currentBatch,
    availableBatches,
    loading,
    error,
    setCurrentBatch,
    clearCurrentBatch,
    refresh,
  }), [currentBatch, availableBatches, loading, error, setCurrentBatch, clearCurrentBatch, refresh]);

  return <BatchContext.Provider value={value}>{children}</BatchContext.Provider>;
}
