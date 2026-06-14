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

import Batch from '../models/Batch.js';
import FAQ from '../models/FAQ.js';
import Category from '../models/Category.js';
import GuestEvent from '../models/GuestEvent.js';
import CommunityPost from '../models/CommunityPost.js';
import { ZoomMeeting } from '../models/ZoomMeeting.js';
import DocumentInsight from '../models/DocumentInsight.js';
import { TranscriptKnowledge } from '../models/TranscriptKnowledge.js';
import Badge from '../models/Badge.js';
import ReputationLog from '../models/ReputationLog.js';
import SearchLog from '../models/SearchLog.js';
import UnresolvedSearch from '../models/UnresolvedSearch.js';
import Notification from '../models/Notification.js';
import TeaNotification from '../models/TeaNotification.js';
import SupportRequest from '../models/SupportRequest.js';
import AiQuestion from '../models/AiQuestion.js';
import ProgramSettings, { defaultSettings } from '../models/ProgramSettings.js';

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

  console.log(`\nDone. ${total} document(s) backfilled across ${TARGETS.length} collection(s); ${settingsCreated} ProgramSettings created.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
