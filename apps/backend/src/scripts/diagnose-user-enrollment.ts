/**
 * Read-only diagnostic for the 2026-09-25 incident follow-up: a
 * genuinely-enrolled student still gets "You are not enrolled in this
 * program" after the PR #247 fail-open fix, even though the server is
 * confirmed running that code (`/api/build-info` shows the right sha).
 *
 * The fail-open fix only triggers when a user has ZERO active
 * ProgramEnrollment rows. If this user has at least one row — just not
 * one matching the batch they're requesting — they'd still 403. This
 * script prints exactly what's in the DB for one user so we don't have
 * to guess further.
 *
 * Read-only. Makes no writes.
 *
 * Run:  npx tsx src/scripts/diagnose-user-enrollment.ts <email>
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../modules/auth/user.model.js';
import ProgramEnrollment from '../modules/program/program-enrollment.model.js';
import Batch from '../modules/program/batch.model.js';

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error('Usage: npx tsx src/scripts/diagnose-user-enrollment.ts <email>');

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(mongoUri);

  const user = await User.findOne({ email }).select('_id name email role createdAt').lean();
  if (!user) {
    console.log(`NO USER FOUND for email: ${email}`);
    await mongoose.disconnect();
    return;
  }
  console.log('User:', JSON.stringify(user, null, 2));

  const enrollments = await ProgramEnrollment.find({ userId: user._id }).lean();
  console.log(`\nProgramEnrollment rows for this user: ${enrollments.length}`);
  for (const e of enrollments) {
    const batch = await Batch.findById(e.batchId).select('name isActive isDefault').lean();
    console.log(JSON.stringify({
      batchId: e.batchId,
      batchName: batch?.name ?? '(batch not found)',
      programRole: e.programRole,
      isActive: e.isActive,
      enrolledAt: e.enrolledAt,
    }, null, 2));
  }

  const activeCount = enrollments.filter((e) => e.isActive).length;
  console.log(`\nActive ProgramEnrollment rows: ${activeCount}`);
  console.log(activeCount > 0
    ? 'This user WILL be blocked from any batch not in the list above (fail-open does NOT apply — they have at least one active row).'
    : 'This user has zero active rows — fail-open SHOULD apply and let them through.');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
