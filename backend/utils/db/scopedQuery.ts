/**
 * v1.69 — scopedQuery: the data-access helper.
 *
 * Every controller that reads or writes program-scoped data
 * should funnel its Mongoose queries through this helper. It
 * automatically injects the active `batchId` into the filter so
 * a missed `.where('batchId', id)` becomes a one-line call.
 *
 * Two patterns:
 *   1. Explicit scope — pass the batchId you want to constrain to.
 *      `await FAQ.find(withProgramScope({ status: 'approved' }, batchId))`
 *
 *   2. Implicit scope — set `req.programContext.batchId` (done by
 *      the `programScope` middleware) and use `withCurrentProgram`.
 *      `await FAQ.find(withCurrentProgram(req, { status: 'approved' }))`
 *
 * Both fall back to NO `batchId` filter if neither is set, so
 * pre-program-scope code keeps working. The eventual Phase 3
 * rollout will tighten the fallback to a hard 400.
 */

import { FilterQuery, Model, Types } from 'mongoose';

export type ProgramScopedFilter<T> = FilterQuery<T>;

/**
 * Add a `batchId` filter to an existing filter object, unless one
 * is already explicitly set. Idempotent — calling it twice with
 * the same batchId is a no-op.
 */
export function withProgramScope<T>(
  filter: ProgramScopedFilter<T>,
  batchId: string | Types.ObjectId | null | undefined
): ProgramScopedFilter<T> {
  if (!batchId) return filter;
  // If the caller already explicitly set batchId, don't clobber.
  if (Object.prototype.hasOwnProperty.call(filter, 'batchId')) return filter;
  return { ...filter, batchId };
}

/**
 * Convenience for controllers that already have a `req` with a
 * `programContext` attached by the programScope middleware. If
 * the context is absent (e.g. a global admin route), returns the
 * filter unchanged.
 */
export function withCurrentProgram<T>(
  filter: ProgramScopedFilter<T>,
  programContext: { batchId?: string | null } | null | undefined
): ProgramScopedFilter<T> {
  return withProgramScope(filter, programContext?.batchId);
}

/**
 * Helper for Mongoose `.find()` / `.findOne()` / `.countDocuments()`.
 * Mirrors `withProgramScope` but accepts a model to make call
 * sites read like `await M.withProgramScope(M, filter, batchId)`.
 */
export async function findScoped<M extends Model<any>>(
  model: M,
  filter: ProgramScopedFilter<any>,
  batchId: string | Types.ObjectId | null | undefined
): Promise<ReturnType<M['find']>> {
  return (model as any).find(withProgramScope(filter, batchId)) as ReturnType<M['find']>;
}

/**
 * v1.69 — assertSameProgram: guard for handlers that look up a
 * document by ID and then mutate it. When `req.programContext`
 * is attached, the document's `batchId` must match. Otherwise
 * the helper sends a 404 (NOT a 403 — we don't want to leak
 * existence) and the caller should return immediately.
 *
 * Usage:
 *
 *   const post = await CommunityPost.findById(req.params.id);
 *   if (!post) { res.status(404).json({ message: 'Post not found.' }); return; }
 *   if (assertSameProgram(post, req.programContext, res)) return;
 *   // ... continue with the scoped-by-program mutation
 */
export function assertSameProgram(
  doc: { batchId?: unknown } | null,
  programContext: { batchId: string } | null | undefined,
  res: { status: (code: number) => { json: (body: unknown) => void } }
): boolean {
  if (!programContext) return false;
  const docBatch = (doc as { batchId?: { toString: () => string } | string | null } | null)?.batchId;
  if (!docBatch || docBatch.toString() !== programContext.batchId) {
    res.status(404).json({ message: 'Not found.' });
    return true;
  }
  return false;
}
