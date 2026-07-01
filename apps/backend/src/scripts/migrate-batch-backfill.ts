/**
 * v1.69 — one-time batch backfill.
 *
 * Adds the new `batchId` column to 12 content collections and
 * backfills every document whose `batchId` is still null to the
 * default batch (the one with `isDefault: true`).
 *
 * Idempotent. Re-running on a fully-migrated DB is a no-op (all
 * counts are 0, all writes skipped).
 *
 * Run:  npx tsx scripts/migrate-batch-backfill.ts
 */

import 'dotenv/config';
import mongoose, { Types } from 'mongoose';

import Batch from '../modules/program/batch.model.js';
import FAQ from '../modules/faq/faq.model.js';
import Category from '../modules/faq/category.model.js';
import GuestEvent from '../modules/program/guest-event.model.js';
import { defaultSettings } from '../modules/program/program-settings.model.js';
import ProgramSettings from '../modules/program/program-settings.model.js';
import AiConfig from '../modules/ai/ai-config.model.js';
import FeatureFlag from '../modules/program/feature-flag.model.js';
import CommunityPost from '../modules/community/community-post.model.js';
import { ZoomMeeting } from '../modules/zoom/zoom-meeting.model.js';
import DocumentInsight from '../modules/knowledge/document-insight.model.js';
import { TranscriptKnowledge } from '../modules/knowledge/transcript-knowledge.model.js';
import Badge from '../modules/moderation/badge.model.js';
import ReputationLog from '../modules/moderation/reputation-log.model.js';
import SearchLog from '../modules/search/search-log.model.js';
import UnresolvedSearch from '../modules/search/unresolved-search.model.js';
import Notification from '../modules/notification/notification.model.js';
import TeaNotification from '../modules/notification/tea-notification.model.js';
import SupportRequest from '../modules/support/support-request.model.js';
import AiQuestion from '../modules/ai/ai-question.model.js';
// v1.69 — Phase 11: per-user-per-program aggregates
import ProgramReputation from '../modules/moderation/program-reputation.model.js';
import ProgramEnrollment from '../modules/program/program-enrollment.model.js';
import User from '../modules/auth/user.model.js';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI not set in .env');
  process.exit(1);
}

// The 14 collections we need to backfill, with a human label.
// Already-batch-aware models (Batch, FAQ, Category, GuestEvent) are
// included for completeness; they're typically a no-op because the
// seed or the earlier seed-time migration has already populated them.
const TARGETS: Array<{ label: string; model: mongoose.Model<any> }> = [
  { label: 'FAQ',                    model: FAQ as mongoose.Model<any> },
  { label: 'Category',               model: Category as mongoose.Model<any> },
  { label: 'GuestEvent',             model: GuestEvent as mongoose.Model<any> },
  { label: 'CommunityPost',          model: CommunityPost as mongoose.Model<any> },
  { label: 'ZoomMeeting',            model: ZoomMeeting as mongoose.Model<any> },
  { label: 'DocumentInsight',        model: DocumentInsight as mongoose.Model<any> },
  { label: 'TranscriptKnowledge',    model: TranscriptKnowledge as mongoose.Model<any> },
  { label: 'Badge',                  model: Badge as mongoose.Model<any> },
  { label: 'ReputationLog',          model: ReputationLog as mongoose.Model<any> },
  { label: 'SearchLog',              model: SearchLog as mongoose.Model<any> },
  { label: 'UnresolvedSearch',       model: UnresolvedSearch as mongoose.Model<any> },
  { label: 'Notification',           model: Notification as mongoose.Model<any> },
  { label: 'TeaNotification',        model: TeaNotification as mongoose.Model<any> },
  { label: 'SupportRequest',         model: SupportRequest as mongoose.Model<any> },
  { label: 'AiQuestion',             model: AiQuestion as mongoose.Model<any> },
];

async function main(): Promise<void> {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI!);
  console.log('Connected.\n');

  // 1. Find the default batch (the one with isDefault: true).
  const defaultBatch = await Batch.findOne({ isDefault: true });
  if (!defaultBatch) {
    console.error(
      'ERROR: no default batch found. Run `npm run seed` first ' +
      'to create the "Yaksha 2026-27" default batch.'
    );
    process.exit(1);
  }
  console.log(`Default batch: "${defaultBatch.name}" (${defaultBatch._id})\n`);

  // 2. Backfill each target collection.
  let total = 0;
  for (const { label, model } of TARGETS) {
    const orphaned = await model.countDocuments({ batchId: null });
    if (orphaned === 0) {
      console.log(`  ${label.padEnd(22)} ✓ already scoped (0 orphaned)`);
      continue;
    }
    const res = await model.updateMany(
      { batchId: null },
      { $set: { batchId: defaultBatch._id } }
    );
    total += res.modifiedCount;
    console.log(`  ${label.padEnd(22)} ✓ backfilled ${res.modifiedCount} of ${orphaned} orphaned`);
  }

  // 3. Backfill ProgramSettings for any batch that doesn't have one.
  //    The public program page always returns settings (it falls back
  //    to the factory defaults on the controller side), but having a
  //    stored doc means the admin "Settings" editor shows the
  //    existing values rather than starting from a blank slate.
  console.log(`\n[4/4] Backfilling ProgramSettings...`);
  const allBatches = await Batch.find().select('_id name description').lean();
  let settingsCreated = 0;
  for (const b of allBatches) {
    const exists = await ProgramSettings.exists({ batchId: b._id });
    if (exists) continue;
    const draft = defaultSettings(new Types.ObjectId(String(b._id)), b.name, b.description);
    await ProgramSettings.create(draft);
    settingsCreated++;
  }
  console.log(`  ✓ Created ProgramSettings for ${settingsCreated} batch(es)`);

  // v1.69 — Phase 4: backfill AiConfig.batchId. The pre-Phase-4
  // schema had no batchId field at all; the existing doc is the
  // global default. Setting batchId:null makes the resolver
  // chain work (per-program override → global default).
  console.log(`\n[5/5] Backfilling AiConfig + FeatureFlag scopes...`);
  const aiConfigResult = await AiConfig.updateMany(
    { batchId: { $exists: false } },
    { $set: { batchId: null } }
  );
  console.log(`  ✓ AiConfig: ${aiConfigResult.modifiedCount} doc(s) backfilled (batchId: null)`);

  // v1.69 — Phase 8: same for FeatureFlag. The legacy doc was a
  // global default with no batchId — backfill so the per-program
  // override chain finds the right fallback.
  const featureFlagResult = await FeatureFlag.updateMany(
    { batchId: { $exists: false } },
    { $set: { batchId: null } }
  );
  console.log(`  ✓ FeatureFlag: ${featureFlagResult.modifiedCount} doc(s) backfilled (batchId: null)`);

  // v1.69 — Phase 11: ProgramReputation backfill. Every user
  // gets a per-user-per-program reputation record in the
  // default program, seeded from their current User.points /
  // sp / tier / acceptedAnswers / faqContributions. This is
  // the source of truth for the per-program leaderboard added
  // in Phase 3i. After the migration, the existing User.points
  // stays as the global aggregate (sum across programs) for
  // backwards compat; new writes dual-update both via
  // awardToUser (Phase 7).
  console.log(`\n[6/6] Backfilling ProgramReputation for the default program...`);
  const defaultBatchForRep = await Batch.findOne({ isDefault: true }).select('_id name').lean();
  if (!defaultBatchForRep) {
    console.log('  ⚠ No default program found — skipping ProgramReputation backfill.');
  } else {
    const defaultRepBatchId = new Types.ObjectId(String(defaultBatchForRep._id));
    let repCreated = 0;
    const userCursor = User.find({})
      .select('_id points sp tier acceptedAnswers faqContributions lastGoldenTicketAt lastGoldenRejectionAt')
      .lean().cursor({ batchSize: 200 });
    for await (const u of userCursor) {
      if (!u._id) continue;
      const exists = await ProgramReputation.exists({ userId: u._id, batchId: defaultRepBatchId });
      if (exists) continue;
      await ProgramReputation.create({
        userId: u._id,
        batchId: defaultRepBatchId,
        points: u.points ?? 0,
        sp: u.sp ?? 0,
        tier: u.tier ?? 'newcomer',
        acceptedAnswers: u.acceptedAnswers ?? 0,
        faqContributions: u.faqContributions ?? 0,
        lastGoldenTicketAt: u.lastGoldenTicketAt ?? null,
        lastGoldenRejectionAt: u.lastGoldenRejectionAt ?? null,
      });
      repCreated++;
    }
    console.log(`  ✓ Created ProgramReputation for ${repCreated} user(s) in default program '${defaultBatchForRep.name}'`);
  }

  // v1.69 — Phase 11: ProgramEnrollment backfill. Every user is
  // enrolled as a 'student' in the default program. Admin/moderator
  // roles keep their global permissions; this enrollment just
  // makes the per-program authz chain happy for the existing
  // single-tenant users. The default enrollmentMode on each
  // Batch is 'open' (from the model), so future users can
  // self-enroll.
  console.log(`\n[7/7] Backfilling ProgramEnrollment for the default program...`);
  const defaultBatchForEnr = await Batch.findOne({ isDefault: true }).select('_id name').lean();
  if (!defaultBatchForEnr) {
    console.log('  ⚠ No default program found — skipping ProgramEnrollment backfill.');
  } else {
    const defaultEnrBatchId = new Types.ObjectId(String(defaultBatchForEnr._id));
    let enrCreated = 0;
    const userCursor2 = User.find({})
      .select('_id role')
      .lean().cursor({ batchSize: 200 });
    for await (const u of userCursor2) {
      if (!u._id) continue;
      const exists = await ProgramEnrollment.exists({ userId: u._id, batchId: defaultEnrBatchId });
      if (exists) continue;
      // Admins and moderators get the matching program-role
      // so they can act inside the program without a separate
      // enrollment step. Everyone else is a student.
      const programRole = u.role === 'admin'
        ? 'program_admin'
        : u.role === 'moderator'
          ? 'moderator'
          : 'student';
      await ProgramEnrollment.create({
        userId: u._id,
        batchId: defaultEnrBatchId,
        programRole,
        enrolledBy: null,
        isActive: true,
      });
      enrCreated++;
    }
    console.log(`  ✓ Enrolled ${enrCreated} user(s) in default program '${defaultBatchForEnr.name}'`);
  }

  // v1.69 — Phase 11: default enrollmentMode. The pre-Phase-1
  // batches had no enrollmentMode field. Set them all to
  // 'open' so existing users can still self-enroll (matches
  // the schema default).
  console.log(`\n[8/8] Defaulting Batch.enrollmentMode to 'open'...`);
  const enrollmentModeResult = await Batch.updateMany(
    { enrollmentMode: { $exists: false } },
    { $set: { enrollmentMode: 'open' } }
  );
  console.log(`  ✓ Batch: ${enrollmentModeResult.modifiedCount} doc(s) defaulted to enrollmentMode: 'open'`);

  console.log(`\nDone. ${total} document(s) backfilled across ${TARGETS.length} collection(s); ${settingsCreated} ProgramSettings created; ${aiConfigResult.modifiedCount + featureFlagResult.modifiedCount} per-program scope(s) backfilled; ProgramReputation + ProgramEnrollment backfill complete.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
