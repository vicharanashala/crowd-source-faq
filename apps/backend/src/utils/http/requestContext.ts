/**
 * requestContext.ts
 *
 * Provides AsyncLocalStorage for request-scoped context propagation.
 * Any async operation (job queue, DB calls, external services) run within
 * a request handler can access the requestId and userId without passing
 * them explicitly through every function signature.
 *
 * Usage:
 *   import { getContext, runWithContext } from './requestContext.js';
 *
 *   // Inside a middleware or handler:
 *   runWithContext({ requestId: req.id, userId: req.user?.id }, async () => {
 *     await someAsyncOperation(); // getContext() works inside
 *   });
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  userId?: string;
  batchId?: string;
}

/** The AsyncLocalStorage instance — singleton per process. */
export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/** Set or update the batchId in the current context store. */
export function setContextBatchId(batchId: string): void {
  const store = requestContextStorage.getStore();
  if (store) {
    store.batchId = batchId;
  }
}

/**
 * Get the current request context, if any.
 * Returns undefined when called outside any runWithContext block.
 */
export function getContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

/**
 * Get the current requestId, or '-' if not in a request context.
 */
export function getRequestId(): string {
  return getContext()?.requestId ?? '-';
}

/**
 * Get the current userId, or undefined if not authenticated.
 */
export function getUserId(): string | undefined {
  return getContext()?.userId;
}

/**
 * Run an async callback within a request context.
 * All async operations spawned (directly or indirectly) from `fn`
 * can call getContext() to retrieve the same context.
 *
 * @param ctx    - The context to attach
 * @param fn     - The async function to run
 * @returns the return value of `fn`
 */
export function runWithContext<T>(
  ctx: RequestContext,
  fn: () => Promise<T>
): Promise<T> {
  return requestContextStorage.run(ctx, fn);
}