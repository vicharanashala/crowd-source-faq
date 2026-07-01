/**
 * migrate-and-clean.ts
 *
 * One-time script to:
 *   1. Backfill new schema fields on existing documents
 *      - User: bookmarks, acceptedAnswers, faqContributions
 *      - CommunityPost: lifecycle subdoc
 *      - FAQ: tags
 *   2. Reset stale tier names (bronze/silver/gold/platinum/legend → new tier names)
 *   3. Clear test artifacts (search logs, notifications, tea drops, admin/moderation logs)
 *   4. Ensure missing indexes exist for the new fields
 *
 * Idempotent — safe to re-run. Logs every operation.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const dbName = process.env.DB_NAME || 'yaksha_faq';
await mongoose.connect(process.env.MONGODB_URI + '/' + dbName);
const db = mongoose.connection.db!;

const USERS = 'yaksha_faq_users';
const POSTS = 'yaksha_faq_communityposts';
const FAQS = 'yaksha_faq_faqs';

const log = (msg: string) => console.log(`[migrate] ${msg}`);
const section = (msg: string) => console.log(`\n=== ${msg} ===`);

// ─── 1. User: backfill new fields + reset tier ───────────────────────────────
section('1. User migration');

const userResult = await db.collection(USERS).updateMany(
  { $or: [
    { bookmarks: { $exists: false } },
    { acceptedAnswers: { $exists: false } },
    { faqContributions: { $exists: false } },
  ]},
  { $set: { bookmarks: [], acceptedAnswers: 0, faqContributions: 0 } }
);
log(`Backfilled new fields on ${userResult.modifiedCount}/${await db.collection(USERS).countDocuments()} users`);

const TIER_MAP: Record<string, string> = {
  bronze: 'contributor',
  silver: 'helper',
  gold: 'expert',
  platinum: 'champion',
  legend: 'knowledge_master',
};
for (const [oldTier, newTier] of Object.entries(TIER_MAP)) {
  const r = await db.collection(USERS).updateMany(
    { tier: oldTier },
    { $set: { tier: newTier } }
  );
  if (r.modifiedCount > 0) log(`  ${oldTier} → ${newTier}: ${r.modifiedCount} users`);
}

// ─── 2. CommunityPost: backfill lifecycle subdoc ────────────────────────────
section('2. CommunityPost lifecycle backfill');

const postTotal = await db.collection(POSTS).countDocuments();
const postMissing = await db.collection(POSTS).countDocuments({ lifecycle: { $exists: false } });
log(`Posts missing lifecycle: ${postMissing}/${postTotal}`);

if (postMissing > 0) {
  const cursor = db.collection(POSTS).find({ lifecycle: { $exists: false } });
  let count = 0;
  for await (const post of cursor) {
    const initialStatus = post.status === 'answered' ? 'answered' : 'open';
    await db.collection(POSTS).updateOne(
      { _id: post._id },
      { $set: {
        lifecycle: {
          status: initialStatus,
          statusHistory: [{
            from: '',
            to: initialStatus,
            changedBy: post.author ?? new mongoose.Types.ObjectId(),
            changedAt: post.createdAt ?? new Date(),
            note: 'Backfilled by migration',
          }],
        }
      }}
    );
    count++;
  }
  log(`Backfilled lifecycle on ${count} posts`);
}

// ─── 3. FAQ: backfill tags array ─────────────────────────────────────────────
section('3. FAQ tags backfill');

const faqResult = await db.collection(FAQS).updateMany(
  { tags: { $exists: false } },
  { $set: { tags: [] } }
);
log(`Backfilled tags on ${faqResult.modifiedCount}/${await db.collection(FAQS).countDocuments()} FAQs`);

// ─── 4. Test artifact cleanup ────────────────────────────────────────────────
section('4. Test artifact cleanup');

const clears: Array<[string, string]> = [
  ['yaksha_faq_searchlogs',           'search logs (test searches)'],
  ['yaksha_faq_notifications',        'notifications (test events)'],
  ['yaksha_faq_tea_notifications',    'tea drops (test)'],
  ['yaksha_faq_adminlogs',            'admin logs (test)'],
  ['yaksha_faq_moderation_logs',      'moderation logs (test)'],
  ['yaksha_faq_reputation_logs',      'reputation logs (test)'],
];
for (const [col, label] of clears) {
  const exists = await db.listCollections({ name: col }).hasNext();
  if (!exists) continue;
  const r = await db.collection(col).deleteMany({});
  log(`Cleared ${r.deletedCount} ${label}`);
}

// ─── 5. Ensure indexes for new fields ────────────────────────────────────────
section('5. Index creation');

async function ensureIndex(col: string, keys: any, opts: any = {}) {
  try {
    await db.collection(col).createIndex(keys, opts);
    log(`  ✓ ${col}: ${JSON.stringify(keys)} ${opts.unique ? '(unique)' : ''}`);
  } catch (e: any) {
    if (e.code === 85 || e.codeName === 'IndexOptionsConflict') {
      log(`  · ${col}: index already exists (${JSON.stringify(keys)})`);
    } else {
      log(`  ✗ ${col}: ${e.message}`);
    }
  }
}

await ensureIndex(USERS, { bookmarks: 1 });
await ensureIndex(USERS, { acceptedAnswers: -1 });
await ensureIndex(USERS, { faqContributions: -1 });
await ensureIndex(POSTS, { 'lifecycle.status': 1, createdAt: 1 });
await ensureIndex(FAQS,  { tags: 1 });

// ─── 6. Final stats ──────────────────────────────────────────────────────────
section('6. Final state');

const finalUsers = await db.collection(USERS).countDocuments();
const finalPosts = await db.collection(POSTS).countDocuments();
const finalFaqs = await db.collection(FAQS).countDocuments();
log(`Users: ${finalUsers}, Posts: ${finalPosts}, FAQs: ${finalFaqs}`);

const sampleUser = await db.collection(USERS).findOne({}, { projection: { name: 1, tier: 1, acceptedAnswers: 1, faqContributions: 1, bookmarks: 1 } });
log(`Sample user: ${JSON.stringify(sampleUser)}`);

const samplePost = await db.collection(POSTS).findOne({}, { projection: { title: 1, lifecycle: 1 } });
log(`Sample post: ${JSON.stringify(samplePost)}`);

await mongoose.disconnect();
log('Done.');
