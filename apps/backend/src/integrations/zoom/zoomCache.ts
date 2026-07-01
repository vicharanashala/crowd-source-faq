/**
 * zoomCache.ts
 *
 * In-memory TTL cache for Zoom API responses.
 * Prevents hammering Zoom API when it's slow or rate-limited.
 *
 * Cache keys: `meetings:${userId}:${page}` | `insights:${meetingId}` | `meeting:${id}`
 * TTL: 60s for list data (stale-while-revalidate), 5min for single items.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  staleAt: number; // serve stale from here while revalidating in bg
}

interface CacheStats {
  hits: number;
  misses: number;
  staleHits: number;
  evicted: number;
}

export class ZoomCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private stats: CacheStats = { hits: 0, misses: 0, staleHits: 0, evicted: 0 };
  private readonly maxEntries = 200;

  // TTLs in ms
  static readonly LIST_TTL    = 60_000;   // 60s — meetings list
  static readonly ITEM_TTL    = 5 * 60_000; // 5min — single meeting / insights
  static readonly STALE_WINDOW = 30_000; // serve stale for 30s after expiry

  // ── Public API ───────────────────────────────────────────────────────────────

  get<T>(key: string): { data: T; isStale: boolean } | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    const now = Date.now();
    if (now < entry.expiresAt) {
      this.stats.hits++;
      return { data: entry.data, isStale: false };
    }

    if (now < entry.staleAt) {
      this.stats.staleHits++;
      return { data: entry.data, isStale: true };
    }

    // Expired past stale window
    this.store.delete(key);
    this.stats.evicted++;
    this.stats.misses++;
    return null;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      // evict oldest entry
      const oldest = [...this.store.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
      this.store.delete(oldest[0]);
      this.stats.evicted++;
    }
    const now = Date.now();
    this.store.set(key, {
      data,
      expiresAt: now + ttlMs,
      staleAt: now + ttlMs + ZoomCache.STALE_WINDOW,
    });
  }

  invalidate(pattern: string): number {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.includes(pattern)) {
        this.store.delete(key);
        count++;
      }
    }
    this.stats.evicted += count;
    return count;
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = { hits: 0, misses: 0, staleHits: 0, evicted: 0 };
  }

  // ── Convenience typed getters ───────────────────────────────────────────────

  meetingsKey(userId: string, page = 1) {
    return `meetings:${userId}:${page}`;
  }
  insightsKey(meetingId: string) {
    return `insights:${meetingId}`;
  }
  meetingKey(id: string) {
    return `meeting:${id}`;
  }
  userStatusKey(userId: string) {
    return `zoom:status:${userId}`;
  }

  getMeetings<T>(key: string): T | null {
    const hit = this.get<T>(key);
    return hit ? hit.data : null;
  }
  setMeetings<T>(key: string, data: T): void {
    this.set(key, data, ZoomCache.LIST_TTL);
  }

  getInsights<T>(key: string): T | null {
    const hit = this.get<T>(key);
    return hit ? hit.data : null;
  }
  setInsights<T>(key: string, data: T): void {
    this.set(key, data, ZoomCache.ITEM_TTL);
  }

  getMeeting<T>(key: string): T | null {
    const hit = this.get<T>(key);
    return hit ? hit.data : null;
  }
  setMeeting<T>(key: string, data: T): void {
    this.set(key, data, ZoomCache.ITEM_TTL);
  }
}

// Singleton — shared across all Zoom API calls
export const zoomCache = new ZoomCache();