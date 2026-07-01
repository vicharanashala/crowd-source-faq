/**
 * adminScopedApi — adminApi wrapper that auto-injects the active
 * program id into every request.
 *
 * Drop-in replacement for `adminApi`. Reads the active program from
 * ProgramContext on every call so program switches take effect
 * immediately, no manual refetch. Pages still need to re-render
 * (re-mount the useEffect) when the program changes — this wrapper
 * just guarantees the next request will carry the right batchId.
 *
 * Why a wrapper instead of changing call sites:
 *   - The welcome-kit admin pages have dozens of adminApi.get/post
 *     calls. Editing every one is a much larger PR with a lot of
 *     regressions risk. The wrapper pattern means the existing call
 *     shapes continue to work, and we add the batchId param at one
 *     well-tested layer.
 *   - The backend already accepts `?batchId=...` on every welcome
 *     route, so this is a one-line attach on the frontend side.
 *
 * The wrapper does NOT add batchId to admin paths that already have
 * a per-id route segment (e.g. `/admin/programs/:id/feature-flags`).
 * Those routes are inherently scoped to the id in the path, and
 * adding a redundant batchId would just be noise. The
 * `attachBatchId: false` option is set for those call sites.
 */

import { useMemo } from 'react';
import axios, { type AxiosRequestConfig, type InternalAxiosRequestConfig, type AxiosInstance } from 'axios';
import adminApiBase from './adminApi';
import { useCurrentProgramId } from '../../hooks/useProgramScopedApi';

const adminApi: AxiosInstance = adminApiBase;

/**
 * Decide whether to attach batchId to a given URL+method. We skip
 * routes that already have a per-id program segment, or that are
 * inherently global (auth, health, public settings, listing all
 * programs). For everything else we attach batchId when an active
 * program exists.
 */
function shouldAttachBatchId(url: string, method: string): boolean {
  if (!url) return false;
  // Inherently global — never scope.
  if (url.startsWith('/auth/') || url.startsWith('/health') || url.startsWith('/public/')) return false;
  // Per-id routes — already scoped by path, batchId is redundant.
  // Examples: /admin/programs/<id>/..., /admin/batches/<id>/...
  if (/\/admin\/(programs|batches)\/[a-f0-9]{24}/i.test(url)) return false;
  // Listing all programs (for the picker) — must not be scoped.
  if (url === '/admin/batches/admin/all') return false;
  if (url === '/admin/programs' || url === '/admin/programs/') return false;
  if (url === '/admin/batches' || url === '/admin/batches/') return false;
  if (url === '/admin/batches/by-slug' || url.startsWith('/admin/batches/by-slug/')) return false;
  // Admin-onboarding overview routes that operate on the global
  // singleton; per-program equivalents use the path-id form above.
  if (url === '/admin/registration-config') return false;
  // Default: attach batchId for every other admin call. This is
  // the safety net — if a page forgets, the wrapper still scopes
  // the request correctly.
  return true;
}

let isInstalled = false;
let originalRequestInterceptor: number | null = null;

/**
 * Install the batchId interceptor on the singleton adminApi axios
 * instance. Idempotent — calling twice is a no-op. The interceptor
 * is a thin wrapper that reads the current program id from a
 * getter (not a closure capture) so it always sees the latest value.
 *
 * Use `installAdminScopedApiInterceptor()` once at app boot (or
 * lazily on first use) before any call goes through `adminApi`.
 */
export function installAdminScopedApiInterceptor(): void {
  if (isInstalled) return;
  isInstalled = true;

  // We use a module-level getter that the latest useCurrentProgramId
  // value is written to. This is the only way to bridge React's
  // render-cycle hooks into a singleton axios instance — the
  // interceptor runs outside React's lifecycle.
  let lastKnownProgramId: string | null = null;
  // Exposed so the Provider can write into it on every render.
  setActiveProgramIdGetter(() => lastKnownProgramId);
  // We can't return a setter for free; piggyback on a closure that
  // the hook updates.
  (installAdminScopedApiInterceptor as unknown as { _set?: (id: string | null) => void })._set = (id) => {
    lastKnownProgramId = id;
  };

  originalRequestInterceptor = adminApi.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const url = config.url ?? '';
    const method = (config.method ?? 'get').toLowerCase();
    if (lastKnownProgramId && shouldAttachBatchId(url, method)) {
      // Merge batchId into existing params without clobbering them.
      // Guard against BOTH sources of an existing batchId: the axios
      // `params` object AND one already baked into the URL query string.
      // Missing the URL-string case caused a duplicate `batchId=id&batchId=id`
      // (collapsed to an invalid comma-joined ObjectId → 400).
      const existing = (config.params ?? {}) as Record<string, unknown>;
      const urlHasBatchId = /[?&]batchId=/.test(url);
      if (!('batchId' in existing) && !urlHasBatchId) {
        config.params = { ...existing, batchId: lastKnownProgramId };
      }
    }
    return config;
  });
}

let activeIdGetter: () => string | null = () => null;
function setActiveProgramIdGetter(fn: () => string | null): void {
  activeIdGetter = fn;
}

/** Hook component that wires the active program id into the
 *  singleton adminApi interceptor. Render once near the root of the
 *  admin tree (inside ProgramProvider). */
export function AdminProgramScopeWiring(): null {
  const id = useCurrentProgramId();
  useMemo(() => {
    // Push the latest id into the module-level slot so the
    // interceptor sees it without a render cycle.
    (installAdminScopedApiInterceptor as unknown as { _set?: (id: string | null) => void })._set?.(id);
  }, [id]);
  return null;
}

export { adminApi };
export default adminApi;