import { type Request, type Response, type NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';

/**
 * internalApiKey — guards routes that should only be called by trusted
 * same-process services (today: the Discord bot). The client sends
 * `X-Internal-Api-Key: <secret>` and we compare it to `INTERNAL_API_KEY`
 * in the env using a constant-time comparison so a brute-force guess
 * can't be timed.
 *
 * The bot config in backend/bot/discordBot.ts reads INTERNAL_API_KEY at
 * boot and sends the header on every fetch (see botApiHeaders). This
 * middleware is what actually validates it — before this existed the
 * header was a no-op.
 *
 * If INTERNAL_API_KEY is not set in the env, this middleware refuses
 * EVERY request (fail-closed) and logs a one-shot warning at module
 * load. We don't want a missing secret to silently allow access.
 *
 * Usage:
 *   import { internalApiKey } from './internalApiKey.js';
 *   router.post('/some-bot-route', internalApiKey, handler);
 *
 *   // Or compose with adminOnly so the web admin (JWT) AND the bot
 *   // (X-Internal-Api-Key) can both call it:
 *   import { internalApiKeyOrAdmin } from './internalApiKeyOrAdmin.js';
 *   router.post('/shared', internalApiKeyOrAdmin, handler);
 */
const ENV_KEY = (process.env.INTERNAL_API_KEY ?? '').trim();
let warnedMissing = false;
if (!ENV_KEY) {
  // eslint-disable-next-line no-console
  console.warn('[internalApiKey] INTERNAL_API_KEY env var is not set — the internalApiKey middleware will reject every request. Set it in backend/.env.local.');
  warnedMissing = true;
}

/**
 * Pure check: does the request's X-Internal-Api-Key header match the
 * configured secret? Returns false on missing key, missing header,
 * length mismatch, or value mismatch. Constant-time on equal lengths.
 *
 * Exported so the combined internalApiKeyOrAdmin middleware can use
 * the same check without a fake-res Promise dance.
 */
export function checkInternalApiKey(req: Request): boolean {
  if (!ENV_KEY) return false;
  const provided = (req.header('x-internal-api-key') ?? '').trim();
  if (!provided || provided.length !== ENV_KEY.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(ENV_KEY, 'utf8'));
  } catch {
    return false;
  }
}

export const internalApiKey = (req: Request, res: Response, next: NextFunction): void => {
  if (!ENV_KEY) {
    if (!warnedMissing) {
      // eslint-disable-next-line no-console
      console.warn('[internalApiKey] rejecting request — INTERNAL_API_KEY not set');
      warnedMissing = true;
    }
    res.status(401).json({ message: 'Internal API key not configured' });
    return;
  }
  if (!checkInternalApiKey(req)) {
    res.status(401).json({ message: 'Invalid or missing internal API key' });
    return;
  }
  // Mark the request as bot-authenticated so downstream handlers can
  // tell the difference between a JWT user and the bot. (Some
  // controllers may want to skip per-user logic like SP crediting.)
  (req as Request & { internalBot?: boolean }).internalBot = true;
  next();
};
