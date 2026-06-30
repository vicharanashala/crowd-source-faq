// FeatureFlagContext — exposes the live state of every experimental
// feature so the navbar / sidebar / page guards can hide or show
// affordances without each page making its own API call.
//
// Reuses the existing `api` axios client. The /api/feature-flags
// endpoint is auth-required (returns flags for the authed user, no
// admin gate on read) so the page chrome can decide what to render.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../utils/api';
import { useAuth } from '../hooks/useAuth';

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  label: string;
  description: string;
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
  setFlag: (key: string, enabled: boolean) => Promise<boolean>;
}

const FeatureFlagContext = createContext<FeatureFlagContextValue | null>(null);

export function useFeatureFlags(): FeatureFlagContextValue {
  const ctx = useContext(FeatureFlagContext);
  if (!ctx) {
    throw new Error('useFeatureFlags must be used inside a <FeatureFlagProvider>');
  }
  return ctx;
}

/** Convenience: a hook for one specific flag. Returns undefined while
 *  the flag list is still loading. */
export function useFeatureFlag(key: string): boolean | undefined {
  const { flags, loading } = useFeatureFlags();
  if (loading) return undefined;
  return flags[key]?.enabled ?? false;
}

interface ProviderProps { children: React.ReactNode }

export function FeatureFlagProvider({ children }: ProviderProps): React.ReactElement {
  const { isAuthenticated } = useAuth();
  const [flags, setFlags] = useState<Record<string, FeatureFlag>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setFlags({});
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<{ flags: FeatureFlag[] }>('/feature-flags');
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
  }, [isAuthenticated]);

  useEffect(() => { void load(); }, [load]);

  const isEnabled = useCallback(
    (key: string) => flags[key]?.enabled ?? false,
    [flags],
  );

  const refresh = useCallback(async () => { await load(); }, [load]);

  const setFlag = useCallback(async (key: string, enabled: boolean): Promise<boolean> => {
    try {
      await api.patch(`/feature-flags/${key}`, { enabled });
      await load();
      return true;
    } catch (err) {
      setError('Failed to update feature flag.');
      return false;
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
