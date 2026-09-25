/**
 * Read-only diagnostic for the 3 accounts still missing real Samagama
 * data (25010733@scale.iitrpr.ac.in, user_b_trek_program@yaksha.com,
 * prateeksinghmbd01@gmail.com) from the 2026-09-25 enrollment audit.
 *
 * Prints role, signup time, and every ProgramEnrollment row (including
 * the new `source` marker where present) plus any independent activity
 * evidence, for a hardcoded list of emails.
 *
 * Read-only. Makes no writes.
 *
 * Run:  npx tsx src/scripts/diagnose-specific-users.ts
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

const EMAILS = [
  '25010733@scale.iitrpr.ac.in',
  'user_b_trek_program@yaksha.com',
  'prateeksinghmbd01@gmail.com',
];

async function evidenceBatchIds(userId: Types.ObjectId): Promise<string[]> {
  const [rep, posts, faqs, completions, zoom, searches] = await Promise.all([
    ProgramReputation.find({ userId, batchId: { $ne: null } }).distinct('batchId'),
    CommunityPost.find({ author: userId, batchId: { $ne: null } }).distinct('batchId'),
    FAQ.find({ createdBy: userId, batchId: { $ne: null } }).distinct('batchId'),
    ResourceCompletion.find({ userId, batchId: { $ne: null } }).distinct('batchId'),
    ZoomAssessmentAttempt.find({ userId, batchId: { $ne: null } }).distinct('batchId'),
    SearchLog.find({ userId, batchId: { $ne: null } }).distinct('batchId'),
  ]);
  const all = [...rep, ...posts, ...faqs, ...completions, ...zoom, ...searches] as Types.ObjectId[];
  return [...new Set(all.map((id) => id.toString()))];
}

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(mongoUri);

  const batches = await Batch.find({}).select('name').lean();
  const batchName = new Map(batches.map((b) => [b._id.toString(), b.name]));

  for (const email of EMAILS) {
    console.log(`\n=== ${email} ===`);
    const user = await User.findOne({ email }).select('_id name email role createdAt').lean();
    if (!user) {
      console.log('NO USER FOUND');
      continue;
    }
    console.log(JSON.stringify({ _id: user._id, name: user.name, role: user.role, createdAt: user.createdAt }, null, 2));

    const enrollments = await ProgramEnrollment.find({ userId: user._id }).lean();
    console.log(`ProgramEnrollment rows: ${enrollments.length}`);
    for (const e of enrollments) {
      console.log(JSON.stringify({
        batch: batchName.get(e.batchId.toString()) ?? e.batchId,
        programRole: e.programRole,
        isActive: e.isActive,
        source: e.source ?? '(none — predates provenance marker)',
        enrolledAt: e.enrolledAt,
      }, null, 2));
    }

    const evidence = await evidenceBatchIds(user._id as Types.ObjectId);
    console.log(`Activity evidence batches: ${evidence.length ? evidence.map((id) => batchName.get(id) ?? id).join(', ') : '(none)'}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
