/**
 * DRY RUN ONLY — read-only. Makes no writes.
 *
 * Jinal's rule (2026-09-25) for correcting/backfilling ProgramEnrollment
 * by signup date, to replace the broken "everyone -> default batch"
 * logic in migrate-batch-backfill.ts:
 *
 *   - User.createdAt in [2026-05-15, 2026-07-15]  -> summership
 *   - User.createdAt  > 2026-07-15                -> Monsoonship
 *
 * This does NOT touch Vriddhi. A user is excluded from this rule (left
 * untouched, flagged `vriddhi_excluded`) if they already have a Vriddhi
 * ProgramEnrollment row OR any Vriddhi-batchId activity evidence
 * (ProgramReputation/CommunityPost/FAQ/ResourceCompletion/
 * ZoomAssessmentAttempt/SearchLog) — Vriddhi started 2026-09-01, well
 * after the July 15 cutoff, so without this exclusion every Vriddhi
 * student would be wrongly reclassified as Monsoonship.
 *
 * A user with createdAt BEFORE 2026-05-15 falls outside the rule
 * entirely (the rule doesn't say what they should be) — flagged
 * `before_range`, left untouched, needs a human decision.
 *
 * Prints, for every non-admin user, what WOULD change:
 *   - already_correct      — current active enrollment already matches
 *   - would_create         — zero active rows, would create one
 *   - would_fix_mismatch   — has a wrong-batch active row, would need
 *                            to deactivate it and activate the right one
 *   - vriddhi_excluded     — left alone, has Vriddhi signal
 *   - before_range         — createdAt < 2026-05-15, no rule applies
 *
 * NO WRITES. Run this, review the printed list, THEN a separate
 * --apply script (not this one) does the actual writes after sign-off.
 *
 * Run:  npx tsx src/scripts/backfill-enrollment-by-date-DRYRUN.ts
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
const RANGE_START = new Date('2026-05-15T00:00:00.000Z');
const CUTOFF = new Date('2026-07-15T23:59:59.999Z');

async function evidenceBatchIds(userId: Types.ObjectId): Promise<Set<string>> {
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

  const summership = await Batch.findOne({ name: 'summership' }).select('_id').lean();
  const monsoonship = await Batch.findOne({ name: 'Monsoonship' }).select('_id').lean();
  const vriddhi = await Batch.findOne({ name: 'Vriddhi' }).select('_id').lean();
  if (!summership || !monsoonship || !vriddhi) throw new Error('Could not resolve one of summership/Monsoonship/Vriddhi by name');
  const summershipId = summership._id.toString();
  const monsoonshipId = monsoonship._id.toString();
  const vriddhiId = vriddhi._id.toString();

  const users = await User.find({ role: { $ne: 'admin' } }).select('_id name email role createdAt').lean();
  console.log(`Dry-running backfill logic against ${users.length} non-admin users...\n`);

  const counts = { already_correct: 0, would_create: 0, would_fix_mismatch: 0, vriddhi_excluded: 0, before_range: 0 };
  const changes: Array<Record<string, unknown>> = [];

  for (let i = 0; i < users.length; i += CONCURRENCY) {
    const chunk = users.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(async (user) => {
      const enrollments = await ProgramEnrollment.find({ userId: user._id, isActive: true }).select('batchId').lean();
      const enrolledIds = new Set(enrollments.map((e) => e.batchId.toString()));
      const evidence = await evidenceBatchIds(user._id as Types.ObjectId);

      if (enrolledIds.has(vriddhiId) || evidence.has(vriddhiId)) {
        counts.vriddhi_excluded++;
        return;
      }

      const createdAt = new Date(user.createdAt);
      if (createdAt < RANGE_START) {
        counts.before_range++;
        changes.push({ category: 'before_range', email: user.email, name: user.name, createdAt: user.createdAt });
        return;
      }

      const correctBatchId = createdAt <= CUTOFF ? summershipId : monsoonshipId;
      const correctBatchName = correctBatchId === summershipId ? 'summership' : 'Monsoonship';

      if (enrolledIds.size === 0) {
        counts.would_create++;
        changes.push({ category: 'would_create', email: user.email, name: user.name, createdAt: user.createdAt, wouldEnroll: correctBatchName });
        return;
      }

      if (enrolledIds.has(correctBatchId)) {
        counts.already_correct++;
        return;
      }

      counts.would_fix_mismatch++;
      changes.push({
        category: 'would_fix_mismatch',
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        currentlyEnrolledIn: [...enrolledIds].map((id) => (id === summershipId ? 'summership' : id === monsoonshipId ? 'Monsoonship' : id)),
        wouldReenrollAs: correctBatchName,
      });
    }));
  }

  console.log('=== SUMMARY (DRY RUN — no writes made) ===');
  console.log(JSON.stringify(counts, null, 2));
  console.log(`\nTotal users: ${users.length}`);

  console.log('\n=== WOULD_FIX_MISMATCH (existing wrong-batch row would be corrected) ===');
  for (const c of changes.filter((c) => c.category === 'would_fix_mismatch')) console.log(JSON.stringify(c, null, 2));

  console.log('\n=== WOULD_CREATE (zero rows today, would get a new enrollment) — first 30 shown ===');
  const creates = changes.filter((c) => c.category === 'would_create');
  for (const c of creates.slice(0, 30)) console.log(JSON.stringify(c, null, 2));
  if (creates.length > 30) console.log(`... and ${creates.length - 30} more (truncated for log length)`);

  console.log('\n=== BEFORE_RANGE (createdAt before 2026-05-15 — rule does not cover them, needs a human call) ===');
  for (const c of changes.filter((c) => c.category === 'before_range')) console.log(JSON.stringify(c, null, 2));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
