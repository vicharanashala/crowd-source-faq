// FeatureFlagContext — exposes the live state of every experimental
// feature so the navbar / sidebar / page guards can hide or show
// affordances without each page making its own API call.
//
// Phase 1 R1: typed `FeatureFlagKey` union, `useFeatureFlag` returns
// `{ enabled, source, loading }` instead of `boolean | null | undefined`,
// and admin consumers can read the full map via `useFeatureFlags()`.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import { useCurrentProgramId } from '../hooks/useProgramScopedApi';
import { isKnownFeatureFlag, type FeatureFlagKey } from '../ds/featureFlags';

export type FeatureFlagSource = 'global' | 'override' | 'default' | 'unknown';

export interface ResolvedFeatureFlag {
  key: FeatureFlagKey;
  enabled: boolean;
  source: FeatureFlagSource;
  lastChangedAt: Date | null;
  lastChangedBy: { _id: string; name?: string; email?: string } | null;
}

/** Wire shape from the backend `listFeatureFlags` endpoint. */
interface BackendFeatureFlag {
  key: string;
  enabled: boolean;
  overridden?: boolean;
  updatedAt?: string | Date | null;
  firstEnabledAt?: string | null;
  lastDisabledAt?: string | null;
  // Per-program branch (post-Phase 1 R1) returns a different shape — the
  // controller has been updated to return a consistent shape, so this
  // interface will tighten in a follow-up.
}

export interface UseFeatureFlagResult {
  enabled: boolean;
  source: FeatureFlagSource;
  loading: boolean;
}

interface FeatureFlagContextValue {
  flags: Record<string, ResolvedFeatureFlag>;
  loading: boolean;
  error: string | null;
  /** True if the named feature is currently enabled. Convenience wrapper
   *  for `useFeatureFlag(key).enabled` — kept for backward compat. */
  isEnabled: (key: string) => boolean;
  /** Re-fetch the flag list (e.g. after the admin toggles one). */
  refresh: () => Promise<void>;
  /** Admin-only — toggle a flag's state on the server. */
  setFlag: (key: string, enabled: boolean) => Promise<{ ok: boolean; error?: string }>;
}

const FeatureFlagContext = createContext<FeatureFlagContextValue | null>(null);

export function useFeatureFlags(): FeatureFlagContextValue {
  const ctx = useContext(FeatureFlagContext);
  if (!ctx) {
    throw new Error('useFeatureFlags must be used inside a <FeatureFlagProvider>');
  }
  return ctx;
}

/**
 * Hook for one specific flag. Returns:
 *  - `loading: true, enabled: false, source: 'default'` while the list is loading
 *  - `enabled: <resolved>, source: 'global' | 'override' | 'default'` once loaded
 *  - `enabled: false, source: 'unknown'` if the key is not in the registry
 *
 * Dev mode (import.meta.env.DEV === true) throws on unknown keys so
 * typos surface immediately. Prod mode logs a warning and returns
 * the safe `unknown` shape.
 */
export function useFeatureFlag(key: FeatureFlagKey): UseFeatureFlagResult {
  const { flags, loading } = useFeatureFlags();
  if (!isKnownFeatureFlag(key)) {
    if (import.meta.env.DEV) {
      throw new Error(
        `useFeatureFlag: unknown feature flag "${String(key)}". ` +
        `Add it to apps/frontend/src/ds/featureFlags.ts to fix.`,
      );
    }
    // eslint-disable-next-line no-console
    console.warn(`[featureFlags] unknown key: ${String(key)}`);
    return { enabled: false, source: 'unknown', loading: false };
  }
  if (loading) {
    return { enabled: false, source: 'default', loading: true };
  }
  const resolved = flags[key];
  if (!resolved) {
    return { enabled: false, source: 'default', loading: false };
  }
  return {
    enabled: resolved.enabled,
    source: resolved.source,
    loading: false,
  };
}

interface ProviderProps { children: React.ReactNode }

function backendFlagToResolved(raw: BackendFeatureFlag): ResolvedFeatureFlag | null {
  if (!isKnownFeatureFlag(raw.key)) {
    // Defensive: backend has a flag we don't know about. Skip rather
    // than fail loud at runtime.
    return null;
  }
  const source: FeatureFlagSource = raw.overridden ? 'override' : 'global';
  const updatedAt = raw.updatedAt ? new Date(raw.updatedAt) : null;
  return {
    key: raw.key,
    enabled: !!raw.enabled,
    source,
    lastChangedAt: updatedAt,
    lastChangedBy: null,
  };
}

export function FeatureFlagProvider({ children }: ProviderProps): React.ReactElement {
  const { isAuthenticated } = useAuth();
  const activeProgramId = useCurrentProgramId();
  const [flags, setFlags] = useState<Record<string, ResolvedFeatureFlag>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    if (!isAuthenticated) {
      setFlags({
        askAiChatbot: {
          key: 'askAiChatbot',
          enabled: true,
          label: 'Ask AI Chatbot',
          description: 'Floating AI assistant widget',
          firstEnabledAt: null,
          lastDisabledAt: null,
        },
        welcomePackage: {
          key: 'welcomePackage',
          enabled: true,
          label: 'Welcome Package',
          description: 'The student onboarding / orientation hub',
          firstEnabledAt: null,
          lastDisabledAt: null,
        },
      });
      setLoading(false);
      return;
    }
    try {
      const params = activeProgramId ? { batchId: activeProgramId } : {};
      const res = await api.get<{ flags?: BackendFeatureFlag[] } | BackendFeatureFlag[]>(
        '/feature-flags',
        { params },
      );
      // Defensive: backend currently returns different shapes per query
      // (see feature-flag.controller.ts). Normalise here until the
      // controller is unified (Phase 1 R1 follow-up).
      const raw: BackendFeatureFlag[] = Array.isArray(res.data)
        ? res.data
        : res.data.flags ?? [];
      const map: Record<string, ResolvedFeatureFlag> = {};
      for (const f of raw) {
        const resolved = backendFlagToResolved(f);
        if (resolved) {
          map[resolved.key] = resolved;
        }
      }
      setFlags(map);
      setError(null);
    } catch {
      setError('Could not load feature flags.');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, activeProgramId]);

  useEffect(() => { void load(); }, [load, isAuthenticated]);

  const isEnabled = useCallback(
    (key: string) => flags[key]?.enabled ?? false,
    [flags],
  );

  const refresh = useCallback(async () => { await load(); }, [load]);

  const setFlag = useCallback(async (key: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> => {
    try {
      await api.patch(`/feature-flags/${key}`, { enabled });
      await load();
      return { ok: true };
    } catch {
      const message = 'Failed to update feature flag.';
      setError(message);
      return { ok: false, error: message };
    }
  }, [load]);

  const value = useMemo<FeatureFlagContextValue>(() => ({
    flags,
    loading,
    error,
    isEnabled,
    refresh,
    setFlag,
  }), [flags, loading, error, isEnabled, refresh, setFlag]);

  return <FeatureFlagContext.Provider value={value}>{children}</FeatureFlagContext.Provider>;
}
