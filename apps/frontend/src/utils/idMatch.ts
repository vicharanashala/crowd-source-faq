/**
 * idMatch — type-safe equality for ID fields that the backend may
 * populate either as a raw ID string or as a populated object
 * (depending on the mongoose query and the `.populate()` chain).
 *
 * The bug (H14 in audit-findings.md) was the old pattern
 *
 *   (typeof u === 'object' ? u._id || u : u)?.toString() === currentUserId
 *
 * which silently returned false for malformed server payloads:
 *
 *   - `String({})` is `'[object Object]'`, never equal to a real id.
 *   - The `_id || u` short-circuit returns the whole object reference
 *     when `_id` is a falsy string (`''`), then `?.toString()` on
 *     the object hits the same bug.
 *
 * These helpers fix the class of bug by:
 *
 *   - Returning false (not throwing, not coercing) for unrecognized
 *     input shapes — instead of comparing `'[object Object]'` against
 *     the user id and getting a wrong-but-plausible "not me" answer.
 *   - Providing a single `extractId()` so the UI badge / button
 *     "is this mine" check is identical to the upvoter check, etc.
 */

type IdLike =
  | string
  | number
  | { _id?: string | number | null }
  | null
  | undefined;

/**
 * Pull a string id out of either a primitive or a populated object.
 * Returns null if the input has no usable id (an object with `_id: null`,
 * an empty string, a malformed object, etc.).
 */
export function extractId(u: IdLike): string | null {
  if (u == null) return null;
  if (typeof u === 'string') return u.length > 0 ? u : null;
  if (typeof u === 'number') return Number.isFinite(u) ? String(u) : null;
  if (typeof u === 'object') {
    const inner = u._id;
    if (inner == null) return null;
    if (typeof inner === 'string') return inner.length > 0 ? inner : null;
    if (typeof inner === 'number') return Number.isFinite(inner) ? String(inner) : null;
    return null;
  }
  return null;
}

/**
 * True if `u` (any of the shapes above) represents `currentUserId`.
 * Returns false on any malformed input — never throws.
 */
export function idMatches(
  u: IdLike,
  currentUserId: string | null | undefined
): boolean {
  if (!currentUserId) return false;
  const id = extractId(u);
  return id != null && id === currentUserId;
}
