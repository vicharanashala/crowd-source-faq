// Hooks for the public FAQ page. All endpoints are unauthenticated; the
// public FAQ page never sets an Authorization header.

import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../utils/api';
import type {
  CategoriesResponse,
  CategoryClustersResponse,
  PopularResponse,
  PublicFaq,
  RecentResponse,
  SearchResponse,
  TrackReadingResponse,
  TrackViewResponse,
} from './types';

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Generic GET hook with cancel-on-unmount + lightweight in-memory caching.
 * The cache key includes the URL + params so different filter combinations
 * (including batchId) don't collide.
 *
 * v1.69 — exported so adjacent hooks (e.g. `useCourses`) can reuse
 * the same caching / cancellation behaviour.
 */
export function usePublicGet<T>(url: string | null, params?: Record<string, unknown>): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ data: null, loading: !!url, error: null });
  const cacheRef = useRef<Map<string, T>>(usePublicGet.cache);

  useEffect(() => {
    if (!url) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const key = `${url}::${JSON.stringify(params ?? {})}`;
    const cached = cacheRef.current.get(key);
    if (cached) {
      setState({ data: cached, loading: false, error: null });
      return;
    }
    const controller = new AbortController();
    setState({ data: null, loading: true, error: null });
    api
      .get<T>(url, { params, signal: controller.signal })
      .then((res) => {
        cacheRef.current.set(key, res.data);
        setState({ data: res.data, loading: false, error: null });
      })
      .catch((err) => {
        if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
        setState({ data: null, loading: false, error: 'Could not load. Please try again.' });
      });
    return () => controller.abort();
  }, [url, JSON.stringify(params ?? {})]);

  return state;
}

// Cross-hook cache, shared across all usePublicGet callers in the app.
usePublicGet.cache = new Map();

/** Build a memoised params object that only changes when batchId/limit change. */
function useBatchParams(batchId: string | null, courseId: string | null, extra?: Record<string, unknown>): Record<string, unknown> {
  return useMemo(() => {
    const p: Record<string, unknown> = {};
    if (batchId) p.batchId = batchId;
    if (courseId) p.courseId = courseId;
    if (extra) Object.assign(p, extra);
    return p;
  }, [batchId, courseId, JSON.stringify(extra ?? {})]);
}

export function usePopularFaqs(batchId: string | null, courseId: string | null | undefined, limit = 5) {
  const params = useBatchParams(batchId, courseId ?? null, { limit });
  // Don't fetch until we have a batch — backend returns empty for unscoped
  return usePublicGet<PopularResponse>(batchId ? '/public/popular-faqs' : null, params);
}

export function useRecentFaqs(batchId: string | null, courseId: string | null | undefined, limit = 6) {
  const params = useBatchParams(batchId, courseId ?? null, { limit });
  return usePublicGet<RecentResponse>(batchId ? '/public/recent-faqs' : null, params);
}

export function useCategories(batchId: string | null, courseId: string | null | undefined, includeTop = false, topN = 3) {
  const params = useBatchParams(
    batchId,
    courseId ?? null,
    includeTop ? { withTop: topN } : undefined,
  );
  return usePublicGet<CategoriesResponse>(batchId ? '/public/categories' : null, params);
}

export function usePublicFaqSearch(batchId: string | null, courseId: string | null | undefined, query: string, category: string | null) {
  const params: Record<string, unknown> = { q: query };
  if (category) params.category = category;
  const enabled = !!batchId && query.length >= 2;
  return usePublicGet<SearchResponse>(enabled ? '/public/search' : null, useBatchParams(batchId, courseId ?? null, params));
}

export function usePublicFaqById(id: string | null) {
  return usePublicGet<PublicFaq>(id ? `/public/faqs/${id}` : null);
}

/**
 * v1.70 — Dynamic Categories hook. Fetches the AI-named category
 * clusters for the given program from /api/public/category-clusters.
 *
 * The response is the top N (default 10) clusters, sorted by
 * `faqCount` desc. Components that want to render the suggestion
 * pills should use this in preference to importing `categoryPills`
 * from CategoryGrid directly — the dynamic list is per-program
 * and stays in sync with the live FAQ set.
 */
export function useCategoryClusters(batchId: string | null, limit = 10) {
  const params = useBatchParams(batchId, null, { limit });
  return usePublicGet<CategoryClustersResponse>(
    batchId ? '/public/category-clusters' : null,
    params
  );
}

// ─── Tracking helpers (fire-and-forget) ──────────────────────────────────────
//
// These use navigator.sendBeacon on `pagehide` to survive tab close. For
// non-final tracking (e.g. the `view` event), a plain POST is fine.

export function trackPublicView(faqId: string, sessionId: string, batchId: string): void {
  try {
    const payload = JSON.stringify({ faqId, sessionId, batchId });
    // Use sendBeacon if available — non-blocking and survives unload.
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/csfaq/api/public/track-view', blob);
    } else {
      void api.post<TrackViewResponse>('/public/track-view', { faqId, sessionId, batchId }).catch(() => {});
    }
  } catch { /* tracking is best-effort, never block the UI */ }
}

export function trackPublicReading(
  faqId: string,
  sessionId: string,
  batchId: string,
  payload: { dwellMs: number; scrollPct: number; faqLength: number },
): void {
  try {
    const body = JSON.stringify({ faqId, sessionId, batchId, ...payload });
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon('/csfaq/api/public/track-reading', blob);
    } else {
      void api
        .post<TrackReadingResponse>('/public/track-reading', { faqId, sessionId, batchId, ...payload })
        .catch(() => {});
    }
  } catch { /* best-effort */ }
}
