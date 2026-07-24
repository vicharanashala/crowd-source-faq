/**
 * validateObjectId — Express middleware factory for ObjectId validation.
 *
 * Addresses audit Pattern A: ~25 call sites in the codebase previously
 * did `Model.findById(req.params.id)` raw, which throws a Mongoose
 * CastError on a malformed id and surfaces as a 500. Centralizing
 * the check into a middleware means each route just declares which
 * params to validate, and a malformed id returns a clean 400.
 *
 * Usage:
 *
 *   // Single param:
 *   router.get('/api/foo/:id', validateObjectId('id'), handler);
 *
 *   // Multiple params (validate all):
 *   router.get('/api/foo/:batchId/items/:itemId', validateObjectId('batchId', 'itemId'), handler);
 *
 *   // Use with router.param() for global application to a param name:
 *   router.param('id', validateObjectIdParam);
 *   // (then every route with :id in it auto-validates)
 *
 * The middleware reads from `req.params` (URL), `req.query` (query
 * string), and `req.body` (request body) — so the same helper works
 * for `:id` routes, `?id=` query params, and `{id}` request bodies.
 */

import type { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { httpLog } from '../utils/http/logger.js';

type ObjectIdLike = string | number | string[] | undefined | null;

/**
 * Check whether a value is a syntactically-valid Mongo ObjectId (24-char
 * hex). Exported for tests; the middleware uses it internally.
 */
export function isValidObjectId(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return Types.ObjectId.isValid(value);
}

/**
 * Pull a value from a request (params, query, body — first match wins).
 * `req.params` takes priority because URL params are the most likely
 * source for `:id`-style routes.
 */
function readFromRequest(req: Request, name: string): ObjectIdLike {
  // 1. URL params
  const fromParams = (req.params as Record<string, string | undefined>)[name];
  if (fromParams !== undefined && fromParams !== '') return fromParams;
  // 2. Query string
  const fromQuery = (req.query as Record<string, unknown>)[name];
  if (typeof fromQuery === 'string' && fromQuery.length > 0) return fromQuery;
  if (Array.isArray(fromQuery) && fromQuery.length > 0) return fromQuery as string[];
  // 3. Request body
  const body = req.body as Record<string, unknown> | undefined;
  if (body && typeof body === 'object') {
    const fromBody = body[name];
    if (typeof fromBody === 'string' && fromBody.length > 0) return fromBody;
  }
  return undefined;
}

/**
 * Middleware factory. Validates that each named param is a valid
 * ObjectId; otherwise responds with 400 and a clear message. Missing
 * params (e.g. optional `:id` in a route that sometimes omits it)
 * are NOT considered invalid — they pass through so the controller
 * can handle the absence.
 */
export function validateObjectId(...params: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    for (const name of params) {
      const raw = readFromRequest(req, name);
      if (raw === undefined || raw === null || raw === '') continue;
      // For array values (e.g. duplicate query keys), validate each.
      if (Array.isArray(raw)) {
        for (const v of raw) {
          if (typeof v === 'string' && !isValidObjectId(v)) {
            res.status(400).json({ message: `Invalid ${name}: ${v}` });
            return;
          }
        }
        continue;
      }
      if (typeof raw === 'string' && !isValidObjectId(raw)) {
        res.status(400).json({ message: `Invalid ${name}: ${raw}` });
        return;
      }
    }
    next();
  };
}

/**
 * Express `router.param()` callback. Use with `router.param('id', validateObjectIdParam)`
 * to apply ObjectId validation to a single URL param globally. The
 * difference from `validateObjectId` is that router.param callbacks
 * receive `(req, res, next, value, name)` — the value is pre-extracted.
 */
export const validateObjectIdParam = (
  req: Request,
  res: Response,
  next: NextFunction,
  value: string,
  name = 'id',
): void => {
  if (!isValidObjectId(value)) {
    httpLog.warn(`[validateObjectIdParam] invalid ${name}: ${value}`);
    res.status(400).json({ message: `Invalid ${name}: ${value}` });
    return;
  }
  next();
};
