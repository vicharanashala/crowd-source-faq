// FeatureFlagContext — exposes the live state of every experimental
// feature so the navbar / sidebar / page guards can hide or show
// affordances without each page making its own API call.
//
// v1.69 — multi-program scoping: every fetch passes the active
// program's batchId as a query param so the backend resolves the
// correct per-program override. Switching the active program via
// ProgramContext automatically re-fetches the flag list because
// `activeProgramId` is in the useEffect dependency array.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import { useCurrentProgramId } from '../hooks/useProgramScopedApi';

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  label: string;
  description: string;
  // v1.69 — surfaced from the backend so the admin UI can show
  // whether a flag's value comes from a per-program override or
  // the global default. Frontend renderers can ignore it.
  overridden?: boolean;
  firstEnabledAt: string | null;
  lastDisabledAt: string | null;
}

interface FeatureFlagContextValue {
  flags: Record<string, FeatureFlag>;
  loading: boolean;
  error: string | null;
  /** True if the named feature is currently enabled. */
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

/** Convenience: a hook for one specific flag. Returns:
 *  - `undefined` while the flag list is still loading
 *  - `null` when the key is not found in the map (unknown flag)
 *  - `true` / `false` when the flag exists and has a known enabled state
 */
export function useFeatureFlag(key: string): boolean | null | undefined {
  const { flags, loading } = useFeatureFlags();
  if (loading) return undefined;
  return flags[key]?.enabled ?? null;
}

interface ProviderProps { children: React.ReactNode }

export function FeatureFlagProvider({ children }: ProviderProps): React.ReactElement {
  const { isAuthenticated } = useAuth();
  const activeProgramId = useCurrentProgramId();
  const [flags, setFlags] = useState<Record<string, FeatureFlag>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // H6 fix: reset error at start so a transient failure doesn't permanently
    // brick every FeatureGate. L7 fix: keep loading=true for guests so the
    // loading skeleton shows instead of silently rendering all-off.
    setError(null);
    setLoading(true);
    if (!isAuthenticated) {
      setFlags({});
      setLoading(false);
      return;
    }
    try {
      // v1.69 — pass the active program so the backend resolves
      // per-program overrides. Without batchId the endpoint falls
      // back to global defaults only, which would mean switching
      // programs doesn't update feature flags until full reload.
      const params = activeProgramId ? { batchId: activeProgramId } : {};
      const res = await api.get<{ flags: FeatureFlag[] }>('/feature-flags', { params });
      const map: Record<string, FeatureFlag> = {};
      for (const f of res.data.flags ?? []) {
        map[f.key] = f;
      }
      setFlags(map);
      setError(null);
    } catch (err) {
      // Non-fatal — pages will treat unknown features as "off" and
      // show a "not available" message if the user navigates directly.
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
    } catch (err) {
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
