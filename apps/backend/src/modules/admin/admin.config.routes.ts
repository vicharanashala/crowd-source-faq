/**
 * admin.config.routes.ts — REST routes for the runtime config system.
 *
 * All endpoints require admin role (the existing `adminOnly` middleware).
 * Phase 2 will add the passphrase challenge for critical-key writes
 * via a second middleware layered on top of adminOnly.
 *
 * Route ordering: more specific paths (`/list`, `/categorize/:key`,
 * `/cache/clear`) MUST be registered before the wildcard `/:key` so
 * Express matches the literal first.
 */
import { Router } from 'express';
import { adminOnly } from '../../middleware/admin.js';
import {
  listConfig,
  categorizeHandler,
  getConfigHandler,
  setConfigHandler,
  deleteConfigHandler,
  clearCacheHandler,
} from './admin.config.controller.js';

const router = Router();

// Every endpoint in this module is admin-only. Layered here instead of
// on each route so future endpoints inherit the same protection.
router.use(adminOnly);

// List all known config keys (current values, masked if critical).
router.get('/list', listConfig);

// Classify a key without reading its value — diagnostic for the
// Discord bot's "what does this do" preview.
router.get('/categorize/:key', categorizeHandler);

// Flush the in-memory resolver cache. Useful after bulk CLI writes.
router.post('/cache/clear', clearCacheHandler);

// Set (upsert) a config value.
router.put('/', setConfigHandler);

// Delete an override (falls back to env / schema default).
router.delete('/:key', deleteConfigHandler);

// Get a single config value. Registered LAST among the GETs so the
// more-specific routes above win the match.
router.get('/:key', getConfigHandler);

export default router;