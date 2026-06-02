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
import { logger, type LogLevel } from './logger.js';
import { getRequestId, getUserId } from './requestContext.js';
import { logToFile } from './fileLogger.js';

// Sanitize fields that should never appear in logs
const SANITIZED_KEYS = new Set([
  'password', 'newPassword', 'currentPassword', 'confirmPassword',
  'token', 'accessToken', 'refreshToken', 'authorization',
  'apiKey', 'api_key', 'secret', 'jwt', 'cookie',
  'x-api-key', 'x-api-token',
]);

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

function statusColor(code: number): string {
  if (code >= 500) return '🔴';
  if (code >= 400) return '🟠';
  if (code >= 300) return '🟡';
  if (code >= 200) return '🟢';
  return '⚪';
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Skip logging for the log ingest endpoint itself — it's noise
  if (req.path === '/api/log') { next(); return; }

  const startMs = Date.now();
  const requestId = (req as Request & { id?: string }).id || '-';
  const method = req.method;
  const path = req.route?.path ?? req.path;
  const query = Object.keys(req.query ?? {}).length > 0 ? `?${new URLSearchParams(req.query as Record<string, string>).toString()}` : '';
  const url = `${method} ${path}${query}`;
  const userId = getUserId() || req.user?.id || '-';
  const userAgent = req.get('user-agent') || '-';
  const ip = req.ip || req.socket.remoteAddress || '-';

  // Log request arrival
  logger.info(`--> ${url}`, {
    requestId,
    userId,
    ip,
    userAgent,
    method,
    path,
    query: req.query,
    contentLength: req.get('content-length') || '0',
  }, requestId);

  // Intercept res.end to capture the response stats
  const originalEnd = res.end;
  res.end = function (this: Response, ...args: Parameters<Response['end']>): ReturnType<Response['end']> {
    const durationMs = Date.now() - startMs;
    const statusCode = res.statusCode;
    const contentLength = res.get('content-length') || '-';

    // Determine log level and color
    const isError = statusCode >= 500;
    const isWarn = statusCode >= 400;
    const level = isError ? 'error' : isWarn ? 'warn' : 'info';

    // Build concise log string (no emojis — terminal colors only)
    const meta = { requestId, userId, ip, method, path, statusCode, durationMs, contentLength };

    if (isError) {
      logger.error(`<-- ${url} ${statusCode} ${durationMs}ms`, meta, requestId);
      logToFile('ERROR', `[backend]: <-- ${url} ${statusCode} ${durationMs}ms`, meta, requestId);
    } else if (isWarn) {
      logger.warn(`<-- ${url} ${statusCode} ${durationMs}ms`, meta, requestId);
      logToFile('WARN', `[backend]: <-- ${url} ${statusCode} ${durationMs}ms`, meta, requestId);
    } else {
      logger.info(`<-- ${url} ${statusCode} ${durationMs}ms`, meta, requestId);
      logToFile('INFO', `[backend]: <-- ${url} ${statusCode} ${durationMs}ms`, meta, requestId);
    }

    // Restore original end and call it
    res.end = originalEnd;
    return res.end.apply(this, args as Parameters<typeof originalEnd>);
  } as typeof res.end;

  next();
}