/**
 * Rate-limit Redis store — MongoDB-queue era stub.
 *
 * Post-migration, the application has no Redis dependency. express-rate-limit
 * falls back to its built-in in-memory MemoryStore when `getRedisRateLimitStore`
 * returns `undefined`. This stub preserves the public API so the existing
 * `rateLimit.ts` callers don't need to change.
 *
 * NOTE: in-memory rate-limit counters are per-process. A multi-instance
 * deployment would need a shared store. The plan recommends Keyv + SQLite
 * for that — see queue migration plan §"Final Stack".
 */

import type { Store } from 'express-rate-limit';
import { logger } from '../http/logger.js';

export function getRedisRateLimitStore(_prefix: string): Store | undefined {
  // express-rate-limit's default in-memory Map is the documented fallback.
  // Returning undefined signals "use the default MemoryStore".
  return undefined;
}