/**
 * cleanupSeedData.ts — removes the data that
 * `npm run seed:live` added, so the DB goes back to the
 * pre-seed state.
 *
 * Run:  npm run cleanup:seed
 *
 * What it removes (all matches are by signature — the
 * seed writes distinctive titles, filenames, and
 * topics; pre-existing data won't match):
 *   - 8 support tickets with title `${issueType} support request`
 *   - 2 zoom meetings with topic 'Sprint Retro Q3 Planning Meeting'
 *     or 'Full Data Mapping Test'
 *   - 2 document records with filename 'orientation-handbook.pdf'
 *     or 'faq-template.docx'
 *   - 10 'helpful' badge awards (deletes the positiveBadges
 *     entries that match the seed reason string)
 *   - Resets points/reputation/tier to 0 on the 8 oldest
 *     users (the leaderboard seed)
 *
 * What it KEEPS:
 *   - 131 FAQs (real product data)
 *   - 31 community posts (pre-existing)
 *   - All 48 users (but the 8 leaderboard users get their
 *     points reset to 0)
 *   - The 61 pre-existing support tickets (only the 8
 *     added by seed:live are removed — by title match)
 *
 * Idempotent — running it again is a no-op.
 */

import 'dotenv/config';
import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGODB_URI!;
if (!MONGO_URI) {
  console.error('MONGODB_URI is required');
  process.exit(1);
}

const SEED_TICKET_TITLES = ['internet', 'camera', 'microphone', 'device', 'power', 'other']
  .map((t) => `${t} support request`);

const SEED_ZOOM_TOPICS = [
  'Sprint Retro Q3 Planning Meeting',
  'Full Data Mapping Test',
];

const SEED_DOC_FILENAMES = [
  'orientation-handbook.pdf',
  'faq-template.docx',
];

const SEED_BADGE_REASON = 'Auto awawarded: helpful community contributions';

async function main() {
  console.log('Cleaning up seed:live data');
  console.log('========================');

  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db!;

  // 1. Support tickets — match the seed's title pattern
  const t1 = await db.collection('yaksha_faq_session_support').deleteMany({
    title: { $in: SEED_TICKET_TITLES },
  });
  console.log(`  support tickets deleted: ${t1.deletedCount}`);

  // 2. Zoom meetings — match the seed's topic
  const t2 = await db.collection('yaksha_zoom_meetings').deleteMany({
    topic: { $in: SEED_ZOOM_TOPICS },
  });
  console.log(`  zoom meetings deleted:    ${t2.deletedCount}`);

  // 3. Document records — match the seed's filenames
  const t3 = await db.collection('yaksha_faq_documents').deleteMany({
    fileName: { $in: SEED_DOC_FILENAMES },
  });
  console.log(`  document records deleted: ${t3.deletedCount}`);

  // 4. Badge awards — pull the positiveBadges entries that
  //    match the seed reason string. \$pull with a filter
  //    only removes the matching element, leaves the rest
  //    of the array intact.
  const t4 = await db.collection('yaksha_faq_users').updateMany(
    { 'positiveBadges.reason': SEED_BADGE_REASON },
    { $pull: { positiveBadges: { reason: SEED_BADGE_REASON } as never } }
  );
  console.log(`  badge awards removed:     ${t4.modifiedCount} users had the seed badge pulled`);

  // 5. Reset leaderboard points on the 8 oldest users
  const oldest = await db.collection('yaksha_faq_users')
    .find({}, { projection: { _id: 1, createdAt: 1 } })
    .sort({ createdAt: 1 })
    .limit(8)
    .toArray();
  const oldestIds = oldest.map((u: { _id: mongoose.Types.ObjectId }) => u._id);
  const t5 = await db.collection('yaksha_faq_users').updateMany(
    { _id: { $in: oldestIds } },
    { $set: { points: 0, reputation: 0, tier: 'newcomer', acceptedAnswers: 0, faqContributions: 0 } }
  );
  console.log(`  leaderboard reset:        ${t5.modifiedCount} users had their points/tier reset to defaults`);

  const total = t1.deletedCount + t2.deletedCount + t3.deletedCount + t4.modifiedCount + t5.modifiedCount;
  console.log(`\n✅ Total cleaned: ${total} (${t1.deletedCount + t2.deletedCount + t3.deletedCount} deletes + ${t4.modifiedCount + t5.modifiedCount} updates)`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error((err as Error).message); process.exit(1); });
