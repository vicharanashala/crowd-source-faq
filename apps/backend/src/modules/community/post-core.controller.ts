/**
 * postCore.ts — Shared helpers, types, and Express augmentation for the
 * community-post controllers.
 *
 * Modules that import from here:
 *   - postReadsController     (getAllPosts, getPostById, getSolvedPosts)
 *   - postMutationsController (createPost, toggleUpvote, deletePost, reportPost)
 *   - postLifecycleController (resolvePost, requestExpertHelp, convertToFAQ, setDNA, setTags)
 *   - postModerationController (objectToPromotion, confirmSpam, hide/unhide/lock/unlock)
 *
 * `buildCommentTree` is exported so it can be reused by getPostById AND by
 * any future endpoint that needs the nested replies tree.
 */

import type { IUser } from '../auth/user.model.js';

// Extend Express Request to include the authenticated user. The shape
// matches what middleware/auth.ts attaches to req.user. The global
// augmentation is here (not in middleware/auth.ts) because multiple
// post sub-controllers need it and Express's declaration-merging
// works best at the module level.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: IUser;
    }
  }
}

/** Build a nested comment tree from a flat comments array. Each
 *  comment's `_id` and `parentId` are stringified for JSON safety.
 *  Orphaned replies (parent not present) are treated as roots. */
export function buildCommentTree(flat: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  const roots: Array<Record<string, unknown>> = [];

  // Clone each comment so we can mutate safely and ensure plain object structure
  for (const c of flat) {
    const plain = typeof (c as { toObject?: () => Record<string, unknown> }).toObject === 'function'
      ? (c as { toObject: () => Record<string, unknown> }).toObject()
      : c;
    const id = String(plain._id);
    const normalized = {
      ...plain,
      _id: id,
      parentId: plain.parentId ? String(plain.parentId) : null,
      replies: [],
    };
    map.set(id, normalized);
  }

  for (const c of flat) {
    const plain = typeof (c as { toObject?: () => Record<string, unknown> }).toObject === 'function'
      ? (c as { toObject: () => Record<string, unknown> }).toObject()
      : c;
    const commentId = String(plain._id);
    const node = map.get(commentId);
    if (!node) continue;
    const parentId = node.parentId as string | null;
    if (parentId) {
      const parent = map.get(parentId);
      if (parent) {
        (parent.replies as Array<Record<string, unknown>>).push(node);
      } else {
        roots.push(node); // Orphaned reply — treat as root
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/** Compute the remaining hours for a pending Time-Trial post, or null
 *  if not pending. Used by getAllPosts and getPostById. */
export function timeTrialHoursRemaining(
  post: { timeTrialStatus?: string; timeTrialStartedAt?: Date | string | null },
  totalHours = 16,
): number | null {
  if (post.timeTrialStatus !== 'pending' || !post.timeTrialStartedAt) return null;
  const startedAt = new Date(post.timeTrialStartedAt).getTime();
  if (isNaN(startedAt)) return null;
  const elapsed = (Date.now() - startedAt) / 3_600_000;
  return Math.max(0, Math.round((totalHours - elapsed) * 10) / 10);
}
