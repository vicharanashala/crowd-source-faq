/**
 * bridge-enrollment.ts — program enrollment for samagama.in bridge logins.
 *
 * The bridge (auth-bridge.controller.ts) authenticates a user coming
 * from samagama.in. Authentication alone is not enough: csfaq scopes
 * almost everything to a Batch (a.k.a. "Program"), so a bridged user
 * with no ProgramEnrollment is signed in but sees nothing.
 *
 * This module turns the `programSlug` samagama.in sends into a real
 * ProgramEnrollment row.
 *
 * Design notes:
 *
 *  - **Slugs are derived, not stored.** `slugifyProgramName()` is
 *    computed from `Batch.name` at read time (see batch.model.ts).
 *    We therefore use the same regex-prefilter-then-exact-match
 *    strategy as `getBatchBySlug` in batch.controller.ts rather than
 *    loading every batch on each login.
 *
 *  - **We never guess a batch.** If the slug does not resolve, the
 *    caller is expected to fail the request. Silently dropping a
 *    learner into the wrong cohort is worse than a failed login,
 *    because nobody notices it.
 *
 *  - **We never downgrade a role.** samagama.in only knows that
 *    someone is a participant. It does not know that we promoted them
 *    to `ta` or `mentor` inside csfaq. A login must never undo that.
 *    Same principle as the bridge not touching `User.role`.
 *
 *  - **`enrollmentMode` is deliberately bypassed.** That flag governs
 *    *self*-enrollment from the public portal. A bridge call is an
 *    assertion from the upstream system of record, which is closer to
 *    an admin enrolling someone than to a user joining on their own.
 */

import { Types } from 'mongoose';
import Batch, { slugifyProgramName, type IBatch } from '../program/batch.model.js';
import ProgramEnrollment, { type ProgramRole } from '../program/program-enrollment.model.js';
import { logger } from '../../utils/http/logger.js';

/** Roles samagama.in is allowed to assert over the bridge. */
export const BRIDGE_ASSIGNABLE_ROLES: ProgramRole[] = ['student', 'ta', 'mentor'];

/**
 * Privilege ordering, used only to decide whether an incoming role
 * would be a downgrade. Higher index wins. `program_admin` and
 * `moderator` are included so that an existing high-privilege
 * enrollment is protected, even though the bridge cannot assign them.
 */
const PROGRAM_ROLE_RANK: Record<ProgramRole, number> = {
  student: 0,
  ta: 1,
  mentor: 2,
  moderator: 3,
  program_admin: 4,
};

export interface BridgeEnrollmentResult {
  batchId: Types.ObjectId;
  batchName: string;
  batchSlug: string;
  /** The role the enrollment ended up with (may differ from requested). */
  programRole: ProgramRole;
  /** True when a new enrollment row was created. */
  created: boolean;
  /** True when a previously soft-removed enrollment was reactivated. */
  reactivated: boolean;
  /** True when we kept a higher existing role instead of the requested one. */
  rolePreserved: boolean;
}

/**
 * Resolve an active Batch from a derived slug.
 *
 * Returns `null` when nothing matches. Only `status: 'active'`
 * batches are eligible: enrolling someone into a draft or archived
 * program would give them a login into a cohort that is not running.
 */
export async function resolveActiveBatchBySlug(slug: string): Promise<Pick<IBatch, '_id' | 'name'> | null> {
  const normalised = slug.trim().toLowerCase();
  if (!normalised) return null;

  // Mirror getBatchBySlug's strategy: a cheap name regex narrows the
  // candidate set, then we confirm with the exact slugify transform.
  // The regex alone is not sufficient ("x-y" vs "X Y"), so the exact
  // match below is what actually decides.
  const escapeReg = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const searchRegex = new RegExp(escapeReg(normalised.replace(/-/g, ' ')), 'i');

  // Note the same caveat getBatchBySlug carries: the regex will not
  // catch every theoretically-possible name whose slug matches (e.g.
  // "x-y" vs "X Y"). It holds for the names we actually use
  // ("Summership", "Monsoonship", "Guru Vaani"), and the exact
  // slugify comparison below is what decides.
  const candidates = await Batch.find({
    status: 'active',
    name: { $regex: searchRegex },
  })
    .select('_id name')
    .limit(50)
    .lean();

  const match = candidates.find((b) => slugifyProgramName(b.name) === normalised);
  return match ? ({ _id: match._id, name: match.name } as Pick<IBatch, '_id' | 'name'>) : null;
}

/**
 * Create or update the ProgramEnrollment for a bridged user.
 *
 * Idempotent. Safe to call on every login: the unique index on
 * (userId, batchId) means a repeat call updates the existing row
 * rather than creating a duplicate.
 */
export async function syncBridgeEnrollment(
  userId: Types.ObjectId,
  batch: Pick<IBatch, '_id' | 'name'>,
  requestedRole: ProgramRole,
): Promise<BridgeEnrollmentResult> {
  const batchId = batch._id as Types.ObjectId;
  const batchSlug = slugifyProgramName(batch.name);

  const existing = await ProgramEnrollment.findOne({ userId, batchId });

  if (!existing) {
    await ProgramEnrollment.create({
      userId,
      batchId,
      programRole: requestedRole,
      // enrolledBy stays null: this was not an admin action, it was an
      // assertion from samagama.in.
      enrolledBy: null,
      isActive: true,
    });
    logger.info(
      `[auth-bridge] enrolled user ${String(userId)} into "${batch.name}" as ${requestedRole}`,
    );
    return {
      batchId,
      batchName: batch.name,
      batchSlug,
      programRole: requestedRole,
      created: true,
      reactivated: false,
      rolePreserved: false,
    };
  }

  const reactivated = !existing.isActive;
  if (reactivated) existing.isActive = true;

  // Never downgrade. If csfaq promoted this person to ta / mentor /
  // moderator / program_admin, a routine login must not undo it.
  const currentRank = PROGRAM_ROLE_RANK[existing.programRole] ?? 0;
  const requestedRank = PROGRAM_ROLE_RANK[requestedRole] ?? 0;
  const rolePreserved = currentRank > requestedRank;
  if (!rolePreserved && existing.programRole !== requestedRole) {
    existing.programRole = requestedRole;
  }

  if (existing.isModified()) {
    await existing.save();
  }

  if (rolePreserved) {
    logger.info(
      `[auth-bridge] kept existing role "${existing.programRole}" for user ${String(userId)} ` +
        `in "${batch.name}" (bridge asked for "${requestedRole}")`,
    );
  }

  return {
    batchId,
    batchName: batch.name,
    batchSlug,
    programRole: existing.programRole,
    created: false,
    reactivated,
    rolePreserved,
  };
}
