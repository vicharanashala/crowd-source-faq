/**
 * zoomFallback.ts
 *
 * Retry + fallback layer for Zoom API calls.
 *
 * - Retries with exponential backoff (up to 3 attempts) on transient failures
 * - Serves stale cache when Zoom is down (circuit breaker open or network error)
 * - Logs all failures so admins can see Zoom health in the dashboard
 * - Never throws a bare Zoom error to the client — always returns a safe response
 */

import { CircuitOpenError } from './circuitBreaker.js';
import { zoomCache, ZoomCache } from './zoomCache.js';
import { logger } from './logger.js';

/**
 * Failure scenarios this handles:
 *   - 429 Rate limited         → retry after Retry-After header or 30s default
 *   - 500/502/503 Zoom server error → retry with backoff
 *   - Circuit breaker OPEN    → serve stale cache, log warning
 *   - Network timeout         → retry with backoff
 *   - Token expired mid-call  → NOT retried here (zoomOAuth handles that)
 */

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000; // 1s, 2s, 4s

interface RetryConfig {
  retries?: number;
  baseDelay?: number;
}

export class ZoomFallback {
  /**
   * Execute fn with retry + stale cache fallback.
   * Returns { data, fromCache, error } so callers can decide what to do.
   */
  async withFallback<T>(opts: {
    cacheKey: string;
    cacheTtlMs?: number;
    retries?: number;
    baseDelay?: number;
    fetch: () => Promise<T>;
  }): Promise<{ data: T | null; fromCache: boolean; error: string | null }> {
    const { cacheKey, cacheTtlMs, fetch } = opts;
    const retries = opts.retries ?? MAX_RETRIES;
    const baseDelay = opts.baseDelay ?? BASE_DELAY_MS;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      // Check cache first on retry attempts (not first attempt)
      if (attempt > 0) {
        const cached = zoomCache.get<T>(cacheKey);
        if (cached) {
          logger.warn(`[ZoomFallback] attempt ${attempt + 1}: serving stale cache for ${cacheKey}`);
          return { data: cached.data, fromCache: true, error: null };
        }
      }

      try {
        const result = await fetch();

        // Cache successful result
        if (cacheTtlMs) {
          zoomCache.set(cacheKey, result, cacheTtlMs);
        }

        return { data: result, fromCache: false, error: null };
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // ── Circuit breaker open → try stale cache, then give up ──────────
        if (err instanceof CircuitOpenError) {
          logger.warn(`[ZoomFallback] Circuit breaker open for ${cacheKey}: ${lastError.message}`);
          const cached = zoomCache.get<T>(cacheKey);
          if (cached) {
            return { data: cached.data, fromCache: true, error: null };
          }
          return { data: null, fromCache: false, error: 'Zoom API temporarily unavailable. Please try again later.' };
        }

        // ── Retryable errors ──────────────────────────────────────────────
        const isRetryable = this._isRetryable(err);

        if (isRetryable && attempt < retries) {
          const delay = this._retryDelay(err, attempt, baseDelay);
          logger.info(`[ZoomFallback] attempt ${attempt + 1} failed (${lastError.message}), retrying in ${delay}ms…`);
          await this._sleep(delay);
          continue;
        }

        // ── Non-retryable, or out of retries → try stale cache ────────────
        logger.error(`[ZoomFallback] Non-retryable failure for ${cacheKey} after ${attempt + 1} attempt(s): ${lastError.message}`);
        const cached = zoomCache.get<T>(cacheKey);
        if (cached) {
          return { data: cached.data, fromCache: true, error: null };
        }

        return { data: null, fromCache: false, error: lastError.message };
      }
    }

    // Should not reach here, but defensive
    const cached = zoomCache.get<T>(cacheKey);
    if (cached) return { data: cached.data, fromCache: true, error: null };
    return { data: null, fromCache: false, error: lastError?.message ?? 'Unknown error' };
  }

  /**
   * Shortcut for list endpoints: meetings, insights.
   */
  async getMeetings<T>(userId: string, fetch: () => Promise<T>, page = 1): Promise<{ data: T | null; fromCache: boolean; error: string | null }> {
    return this.withFallback({
      cacheKey: zoomCache.meetingsKey(userId, page),
      cacheTtlMs: ZoomCache.LIST_TTL,
      fetch,
    });
  }

  async getInsights<T>(meetingId: string, fetch: () => Promise<T>): Promise<{ data: T | null; fromCache: boolean; error: string | null }> {
    return this.withFallback({
      cacheKey: zoomCache.insightsKey(meetingId),
      cacheTtlMs: ZoomCache.ITEM_TTL,
      fetch,
    });
  }

  async getMeeting<T>(id: string, fetch: () => Promise<T>): Promise<{ data: T | null; fromCache: boolean; error: string | null }> {
    return this.withFallback({
      cacheKey: zoomCache.meetingKey(id),
      cacheTtlMs: ZoomCache.ITEM_TTL,
      fetch,
    });
  }

  /** Invalidate all cache entries for a user (e.g. after reconnecting Zoom) */
  invalidateUser(userId: string): number {
    return zoomCache.invalidate(`:${userId}:`);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _isRetryable(err: unknown): boolean {
    if (err instanceof CircuitOpenError) return false; // handled separately

    if (err instanceof Error) {
      // HTTP status-based
      const statusMatch = err.message.match(/\b([45]\d{2})\b/);
      if (statusMatch) {
        const status = parseInt(statusMatch[1]);
        // 429 = rate limit, 5xx = server error — retry
        if (status === 429) return true;
        if (status >= 500 && status < 600) return true;
      }
      // Network/timeout errors
      if (err.message.includes('fetch') || err.message.includes('ECONNREFUSED') ||
          err.message.includes('ETIMEDOUT') || err.message.includes('network') ||
          err.message.includes('timeout')) {
        return true;
      }
    }
    return false;
  }

  private _retryDelay(err: unknown, attempt: number, baseDelay: number): number {
    // Respect Retry-After header if present
    if (err instanceof Error) {
      const retryAfter = err.message.match(/retry-after[:\s]?(\d+)/i);
      if (retryAfter) return parseInt(retryAfter[1]) * 1000;
    }
    // Exponential backoff: 1s, 2s, 4s
    return Math.min(baseDelay * Math.pow(2, attempt), 30_000);
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const zoomFallback = new ZoomFallback();