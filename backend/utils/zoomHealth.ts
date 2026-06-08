/**
 * zoomHealth.ts
 *
 * Lightweight health check for the Zoom integration.
 * Admins can poll GET /api/admin/zoom/health to see if Zoom is up/down.
 *
 * Returns:
 *   - circuit breaker state
 *   - cache hit rate
 *   - last error timestamp
 *   - number of failing meetings
 */

import { zoomOAuthCircuit, zoomApiCircuit } from './circuitBreaker.js';
import { zoomCache } from './zoomCache.js';
import { logger } from './logger.js';

export interface ZoomHealthStatus {
  overall: 'healthy' | 'degraded' | 'down';
  oauthCircuit: {
    state: string;
    failures: number;
  };
  apiCircuit: {
    state: string;
    failures: number;
  };
  cache: {
    hits: number;
    misses: number;
    staleHits: number;
    hitRate: string; // e.g. "87%"
    entries: number;
  };
  failingMeetingsCount: number;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
}

/** Track the most recent Zoom error for the health dashboard */
let _lastError: { at: Date; message: string } | null = null;

export function recordZoomError(message: string): void {
  _lastError = { at: new Date(), message };
}

export async function getZoomHealth(): Promise<ZoomHealthStatus> {
  const oauth = zoomOAuthCircuit.getState();
  const api = zoomApiCircuit.getState();

  const cacheStats = zoomCache.getStats();
  const total = cacheStats.hits + cacheStats.misses + cacheStats.staleHits;
  const cacheHitRate = total > 0
    ? `${Math.round(((cacheStats.hits + cacheStats.staleHits) / total) * 100)}%`
    : '100%';

  let failingMeetingsCount = 0;
  try {
    const { ZoomMeeting } = await import('../models/ZoomMeeting.js');
    failingMeetingsCount = await ZoomMeeting.countDocuments({ status: 'failed' });
  } catch (err) {
    // Model might not be loaded yet — log warning and ignore
    logger.warn(`[zoomHealth] Failed to count failing Zoom meetings: ${(err as Error).message}`);
  }

  const isDown = oauth === 'open' && api === 'open';
  const isDegraded = oauth === 'half-open' || api === 'half-open' || (cacheStats.staleHits > 0 && cacheStats.misses > cacheStats.hits);

  return {
    overall: isDown ? 'down' : isDegraded ? 'degraded' : 'healthy',
    oauthCircuit: {
      state: oauth,
      failures: zoomOAuthCircuit.getFailures(),
    },
    apiCircuit: {
      state: api,
      failures: zoomApiCircuit.getFailures(),
    },
    cache: {
      hits: cacheStats.hits,
      misses: cacheStats.misses,
      staleHits: cacheStats.staleHits,
      hitRate: cacheHitRate,
      entries: 0, // not exposed to avoid leaking internals
    },
    failingMeetingsCount,
    lastErrorAt: _lastError?.at.toISOString() ?? null,
    lastErrorMessage: _lastError?.message ?? null,
  };
}