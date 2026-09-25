/**
 * Read-only audit for the 2026-09-25 incident follow-up.
 *
 * PR #247's fail-open fix only rescues users with ZERO active
 * ProgramEnrollment rows. A user who has at least one row, but one
 * that points at the WRONG batch (e.g. blanket-assigned to the
 * "default" batch by the old `migrate-batch-backfill.ts` rather than
 * their real cohort), is still blocked. This script sizes that risk.
 *
 * ProgramEnrollment has no independent way to verify itself, so this
 * cross-checks each enrolled user's actual activity — batchId-tagged
 * records from ProgramReputation, CommunityPost, FAQ, ResourceCompletion,
 * ZoomAssessmentAttempt, and (recent-only, 90-day TTL) SearchLog — none
 * of which are derived from ProgramEnrollment. If a user's activity
 * points at a batch their enrollment doesn't include, that's a real
 * mismatch worth fixing by hand.
 *
 * Categories:
 *   - zero_rows       — no active ProgramEnrollment at all (already
 *                        covered by the fail-open fix; not at risk)
 *   - no_evidence     — has enrollment row(s) but no independent
 *                        activity signal exists to check against
 *                        (can't confirm either way)
 *   - consistent      — has enrollment row(s) and every activity
 *                        signal agrees with at least one of them
 *   - MISMATCH        — has enrollment row(s) but activity points at
 *                        a batch NOT in their enrollment — still at
 *                        risk of the "You are not enrolled" 403
 *
 * Read-only. Makes no writes.
 *
 * Run:  npx tsx src/scripts/audit-enrollment-mismatches.ts
 */

import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import User from '../modules/auth/user.model.js';
import ProgramEnrollment from '../modules/program/program-enrollment.model.js';
import ProgramReputation from '../modules/moderation/program-reputation.model.js';
import CommunityPost from '../modules/community/community-post.model.js';
import FAQ from '../modules/faq/faq.model.js';
import ResourceCompletion from '../modules/program/resource-completion.model.js';
import ZoomAssessmentAttempt from '../modules/zoom/zoom-assessment-attempt.model.js';
import SearchLog from '../modules/search/search-log.model.js';
import Batch from '../modules/program/batch.model.js';

const CONCURRENCY = 20;

async function batchIdsFor(userId: Types.ObjectId): Promise<Set<string>> {
  const [rep, posts, faqs, completions, zoom, searches] = await Promise.all([
    ProgramReputation.find({ userId, batchId: { $ne: null } }).distinct('batchId'),
    CommunityPost.find({ author: userId, batchId: { $ne: null } }).distinct('batchId'),
    FAQ.find({ createdBy: userId, batchId: { $ne: null } }).distinct('batchId'),
    ResourceCompletion.find({ userId, batchId: { $ne: null } }).distinct('batchId'),
    ZoomAssessmentAttempt.find({ userId, batchId: { $ne: null } }).distinct('batchId'),
    SearchLog.find({ userId, batchId: { $ne: null } }).distinct('batchId'),
  ]);
  const all = [...rep, ...posts, ...faqs, ...completions, ...zoom, ...searches] as Types.ObjectId[];
  return new Set(all.map((id) => id.toString()));
}

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(mongoUri);

  const batches = await Batch.find({}).select('name').lean();
  const batchName = new Map(batches.map((b) => [b._id.toString(), b.name]));

  const users = await User.find({ role: { $ne: 'admin' } }).select('_id name email role').lean();
  console.log(`Auditing ${users.length} non-admin users...\n`);

  const counts = { zero_rows: 0, no_evidence: 0, consistent: 0, mismatch: 0 };
  const mismatches: Array<{ email: string; name: string; enrolled: string[]; evidence: string[] }> = [];

  for (let i = 0; i < users.length; i += CONCURRENCY) {
    const chunk = users.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(async (user) => {
      const enrollments = await ProgramEnrollment.find({ userId: user._id, isActive: true }).select('batchId').lean();
      const enrolledIds = new Set(enrollments.map((e) => e.batchId.toString()));

      if (enrolledIds.size === 0) {
        counts.zero_rows++;
        return;
      }

      const evidenceIds = await batchIdsFor(user._id as Types.ObjectId);
      if (evidenceIds.size === 0) {
        counts.no_evidence++;
        return;
      }

      const anyMatch = [...evidenceIds].some((id) => enrolledIds.has(id));
      if (anyMatch) {
        counts.consistent++;
      } else {
        counts.mismatch++;
        mismatches.push({
          email: user.email,
          name: user.name ?? '(no name)',
          enrolled: [...enrolledIds].map((id) => batchName.get(id) ?? id),
          evidence: [...evidenceIds].map((id) => batchName.get(id) ?? id),
        });
      }
    }));
  }

  console.log('=== SUMMARY ===');
  console.log(JSON.stringify(counts, null, 2));
  console.log(`\nTotal users: ${users.length}`);
  console.log(`At risk of "not enrolled" 403 today (zero rows, covered by fail-open): ${counts.zero_rows}`);
  console.log(`Still at risk (wrong-batch enrollment, NOT covered by fail-open): ${counts.mismatch}`);
  console.log(`Unverifiable (enrolled, no independent activity to check): ${counts.no_evidence}`);
  console.log(`Verified consistent: ${counts.consistent}`);

  if (mismatches.length > 0) {
    console.log('\n=== MISMATCHED USERS (enrolled batch vs. activity batch disagree) ===');
    for (const m of mismatches) {
      console.log(JSON.stringify(m, null, 2));
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
