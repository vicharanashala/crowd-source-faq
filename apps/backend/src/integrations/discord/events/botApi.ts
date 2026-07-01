/**
 * v1.69 — Phase 6+ per-guild → batchId routing.
 *
 * The bot's command handlers call the backend HTTP API
 * (the /api/... routes). Every per-program endpoint
 * accepts `?batchId=...` to scope the response. This
 * helper builds the URL with the right query string from
 * the BotConfig + batchId tuple so each per-program bot's
 * /ask, /search, /status, etc. commands hit the right
 * program's data.
 *
 * The legacy global bot (no batchId) passes batchId=null;
 * the backend treats that as "global default" and returns
 * the merged-by-isDefault data.
 */

import { Types } from 'mongoose';
import type { BotConfig } from '../discordBot.js';

/**
 * Build a backend URL with `?batchId=...` if a batchId
 * was supplied. Returns the URL as a string.
 */
export function buildBotApiUrl(
  config: BotConfig,
  path: string,
  batchId: string | null = null
): string {
  const base = config.publicUrl.replace(/\/+$/, '');
  if (!batchId) return `${base}${path}`;
  // Skip the param if the batchId isn't a valid ObjectId
  // (defensive — BotManager only inserts valid ids).
  if (!Types.ObjectId.isValid(batchId)) return `${base}${path}`;
  const sep = path.includes('?') ? '&' : '?';
  return `${base}${path}${sep}batchId=${batchId}`;
}

/** Internal API key header — for the same-origin /api/ai
 *  routes that use a shared internal key. The batchId is
 *  passed through for completeness; today no header needs
 *  it but future per-program internal keys (e.g.
 *  X-Program-Internal-Key) might. */
export function botApiHeaders(
  config: BotConfig,
  _batchId: string | null = null
): Record<string, string> {
  if (config.internalApiKey) {
    return { 'X-Internal-Api-Key': config.internalApiKey };
  }
  return {};
}
