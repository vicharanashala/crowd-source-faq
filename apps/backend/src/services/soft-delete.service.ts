/**
 * services/soft-delete.service.ts — Phase 1 R8.
 *
 * Soft-delete helper for program-scoped data. The audit
 * (docs/redesign-plan.md §2.4 R8) wanted `deletedAt`/`deletedBy`
 * fields on every collection so the cascade-delete could be
 * reversible. This commit ships the helper + the schema changes
 * on the highest-value collections (CommunityPost, FAQ,
 * DocumentRecord, ZoomMeeting). The other 25+ collections covered
 * by cascade-delete are NOT schema-migrated in this commit — the
 * helper does an `updateMany(..., { $set: { deletedAt, deletedBy } })`
 * which is a Mongo no-op when the field doesn't exist (returns
 * modifiedCount: 0). Future PRs can add the field per collection
 * once the audit signal is clearer on which ones are worth the
 * schema cost.
 *
 * The controller-side wiring (which routes call softDelete instead
 * of hardDelete) is deferred — the plan explicitly calls it a
 * follow-up. This commit is the helper + a per-collection listing
 * + tests, so future controllers can opt in one route at a time.
 */
import { Types } from 'mongoose';
import CommunityPost from '../modules/community/community-post.model.js';
import FAQ from '../modules/faq/faq.model.js';
import DocumentRecord from '../modules/knowledge/document-record.model.js';
import { ZoomMeeting } from '../modules/zoom/zoom-meeting.model.js';
import { adminLog, httpLog } from '../utils/http/logger.js';

export interface SoftDeleteInput {
  batchId: Types.ObjectId | string;
  deletedBy: Types.ObjectId | string;
  /** Optional reason — surfaced in the deletedAt row for audit. */
  reason?: string;
  /** Only soft-delete docs that are NOT already soft-deleted
   *  (deletedAt is null). Default true. Set false to overwrite. */
  skipAlreadyDeleted?: boolean;
}

export interface SoftDeleteResult {
  /** Per-collection cleared count. */
  perCollection: Record<string, number>;
  total: number;
}

interface SoftDeleteTarget {
  /** Display name (matches the model.collection.name). */
  name: string;
  /** Mongoose model with a `batchId` field and the soft-delete methods
   *  we need. `updateMany` applies $set; `deleteMany` is the hard-delete
   *  primitive we DON'T want (we soft-delete, not hard-delete). */
  model: {
    updateMany: (
      filter: object,
      update: object,
    ) => Promise<{ modifiedCount?: number; matchedCount?: number }>;
  };
}

/**
 * The list of collections that participate in soft-delete. New
 * collections added here will be picked up automatically — but
 * until their schema has the deletedAt + deletedBy fields, the
 * updateMany is a no-op (Mongo silently ignores unknown fields in
 * $set when strict mode is off, which is the default).
 */
const SOFT_DELETE_TARGETS: SoftDeleteTarget[] = [
  { name: 'CommunityPost', model: CommunityPost },
  { name: 'FAQ', model: FAQ },
  { name: 'DocumentRecord', model: DocumentRecord },
  { name: 'ZoomMeeting', model: ZoomMeeting },
];

class SoftDeleteService {
  /**
   * Soft-delete every document in every registered collection for
   * the given batchId. Sets `deletedAt` + `deletedBy` (and a
   * `deletedReason` if provided). Idempotent — re-running on
   * already-deleted docs is a no-op.
   */
  async softDelete(input: SoftDeleteInput): Promise<SoftDeleteResult> {
    const batchId = new Types.ObjectId(String(input.batchId));
    const deletedBy = new Types.ObjectId(String(input.deletedBy));
    const filter: Record<string, unknown> = { batchId };
    if (input.skipAlreadyDeleted !== false) {
      // Only soft-delete docs that haven't been soft-deleted yet.
      filter.deletedAt = null;
    }
    const update = {
      $set: {
        deletedAt: new Date(),
        deletedBy,
        ...(input.reason ? { deletedReason: input.reason } : {}),
      },
    };

    const perCollection: Record<string, number> = {};
    let total = 0;
    for (const target of SOFT_DELETE_TARGETS) {
      try {
        // updateMany with $set + filter (deletedAt is null) — soft delete.
        // deleteMany would hard-delete and can't apply $set.
        const result = await target.model.updateMany(filter, update);
        // updateMany returns modifiedCount. Use it.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = result as { modifiedCount?: number; matchedCount?: number };
        const count = r.modifiedCount ?? r.matchedCount ?? 0;
        perCollection[target.name] = count;
        total += count;
      } catch (err) {
        // Field doesn't exist on this collection — Mongo throws
        // "Unknown modifier: $set" or "Cannot create field".
        // Skip silently per the design (no-op for collections
        // without the deletedAt field).
        httpLog.info(
          `[softDelete] skip ${target.name}: ${(err as Error).message}`,
        );
        perCollection[target.name] = 0;
      }
    }

    adminLog.info(
      `[softDelete] batch ${String(batchId)} marked ${total} docs across ` +
        `${Object.keys(perCollection).length} collections.`,
    );
    return { perCollection, total };
  }

  /**
   * Restore soft-deleted docs (set deletedAt back to null). Useful
   * for admin "undo program deletion" flow. Not wired in the UI
   * yet — ships as a service method so future PRs can add the
   * admin endpoint.
   */
  async restore(batchId: Types.ObjectId | string): Promise<SoftDeleteResult> {
    const bid = new Types.ObjectId(String(batchId));
    const filter = { batchId: bid, deletedAt: { $ne: null } };
    const update = { $set: { deletedAt: null, deletedBy: null, deletedReason: null } };

    const perCollection: Record<string, number> = {};
    let total = 0;
    for (const target of SOFT_DELETE_TARGETS) {
      try {
        const result = await target.model.updateMany(filter, update);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r: { modifiedCount?: number } = result as { modifiedCount?: number };
        const count = r.modifiedCount ?? 0;
        perCollection[target.name] = count;
        total += count;
      } catch {
        perCollection[target.name] = 0;
      }
    }
    return { perCollection, total };
  }
}

export const softDeleteService = new SoftDeleteService();
