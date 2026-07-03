/**
 * requestLogger.ts
 *
 * Express middleware that logs every HTTP request with:
 *   - Timestamp
 *   - Request ID (X-Request-ID header or generated UUID)
 *   - HTTP method + path + query string
 *   - Response status code (color-coded)
 *   - Response time (ms)
 *   - Response body size (bytes)
 *   - User ID (from JWT, if authenticated)
 *   - Request body (sanitized — no passwords/tokens)
 *   - User-Agent + Real IP
 *
 * Uses the existing logger.ts so all output is in the same format.
 */

import { Request, Response, NextFunction } from 'express';
import { httpLog, type LogLevel } from './logger.js';
import { getUserId } from './requestContext.js';
import { logToFile } from './fileLogger.js';

// Sanitize fields that should never appear in logs
const SANITIZED_KEYS = new Set([
  'password', 'newPassword', 'currentPassword', 'confirmPassword',
  'token', 'accessToken', 'refreshToken', 'authorization',
  'apiKey', 'api_key', 'secret', 'jwt', 'cookie',
  'x-api-key', 'x-api-token',
]);

// L6 fix: also redact token-bearing query keys (OAuth callbacks,
// share links, etc.). Any key matching this regex is replaced
// with [REDACTED] regardless of depth in the body.
const QUERY_KEY_REDACT_RE = /^(token|secret|key|jwt|code|state|signature|sig|nonce)$/i;

function sanitizeBody(body: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (SANITIZED_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string' && value.length > 500) {
      sanitized[key] = value.slice(0, 500) + '...[truncated]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeBody(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Skip logging for the log ingest endpoint itself — it's noise
  if (req.path === '/csfaq/api/log') { next(); return; }

  const startMs = Date.now();
  const requestId = (req as Request & { id?: string }).id || '-';
  const method = req.method;
  const path = req.route?.path ?? req.path;
  // L6 fix: stringify the query for shape consistency with the
  // response log's `path` field. Also redact token-bearing
  // query keys (the SANITIZED_KEYS list only applies to body
  // fields; query keys are matched separately).
  const redactedQuery: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.query ?? {})) {
    redactedQuery[k] = QUERY_KEY_REDACT_RE.test(k) ? '[REDACTED]' : String(v);
  }
  const query = Object.keys(redactedQuery).length > 0 ? `?${new URLSearchParams(redactedQuery).toString()}` : '';
  const url = `${method} ${path}${query}`;
  const userId = getUserId() || req.user?.id || '-';
  const userAgent = req.get('user-agent') || '-';
  const ip = req.ip || req.socket.remoteAddress || '-';

  // Log request arrival
  httpLog.info(`--> ${url}`, {
    requestId,
    userId,
    ip,
    userAgent,
    method,
    path,
    query: redactedQuery,
    contentLength: req.get('content-length') || '0',
  });

  // Intercept res.end to capture the response stats
  const originalEnd = res.end;
  res.end = function (this: Response, ...args: Parameters<Response['end']>): ReturnType<Response['end']> {
    const durationMs = Date.now() - startMs;
    const statusCode = res.statusCode;
    const contentLength = res.get('content-length') || '-';

    // Determine log level and color
    const isError = statusCode >= 500;
    const isWarn = statusCode >= 400;
    const level: LogLevel = isError ? 'error' : isWarn ? 'warn' : 'info';

    // M4 fix: removed the unused statusColor() function that
    // returned emoji strings — the file's inline policy says
    // "no emojis — terminal colors only" and the function was
    // never called. Dead code that contradicted the policy.
    const meta = { requestId, userId, ip, method, path, statusCode, durationMs, contentLength };

    if (isError) {
      httpLog.error(`<-- ${url} ${statusCode} ${durationMs}ms`, meta);
      logToFile('ERROR', `[backend]: <-- ${url} ${statusCode} ${durationMs}ms`, meta, requestId);
    } else if (isWarn) {
      httpLog.warn(`<-- ${url} ${statusCode} ${durationMs}ms`, meta);
      logToFile('WARN', `[backend]: <-- ${url} ${statusCode} ${durationMs}ms`, meta, requestId);
    } else {
      httpLog.info(`<-- ${url} ${statusCode} ${durationMs}ms`, meta);
      logToFile('INFO', `[backend]: <-- ${url} ${statusCode} ${durationMs}ms`, meta, requestId);
    }

    // Restore original end and call it
    res.end = originalEnd;
    return res.end.apply(this, args as Parameters<typeof originalEnd>);
  } as typeof res.end;

  next();
}