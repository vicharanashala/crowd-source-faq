/**
 * Migration: Add performance and safety indexes
 * Run: npx tsx scripts/addIndexes.ts
 *
 * Indexes added:
 *  1. SearchLog TTL index — auto-deletes logs after 90 days
 *  2. SearchLog query index — speeds up aggregation grouping
 *  3. FAQ category+status compound index — speeds up admin FAQ list
 *  4. CommunityPost status+createdAt index — speeds up community feed filtering
 *  5. UnresolvedSearch status+createdAt index
 *  6. UnresolvedSearch faqId index
 *
 * NOTE: User email unique index is intentionally NOT added here — User.ts schema
 * field 'unique: true' on email already auto-creates it. Adding it in this script
 * causes a duplicate schema index warning.
 */

import 'dotenv/config';
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/yaksha_faq';

async function migrate() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.\n');

  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection not established');

  const indexes: { name: string; coll: string; key: Record<string, 1 | -1>; options?: Record<string, unknown> }[] = [
    { name: 'TTL 90-day expiry',           coll: 'yaksha_faq_searchlogs',              key: { createdAt: 1 },                       options: { expireAfterSeconds: 60 * 60 * 24 * 90 } },
    { name: 'query+createdAt',            coll: 'yaksha_faq_searchlogs',              key: { query: 1, createdAt: -1 } },
    { name: 'batchId+createdAt',          coll: 'yaksha_faq_searchlogs',              key: { batchId: 1, createdAt: -1 } },
    { name: 'category+status+createdAt',   coll: 'yaksha_faq_faqs',                   key: { category: 1, status: 1, createdAt: -1 } },
    { name: 'status+createdAt',            coll: 'yaksha_faq_communityposts',          key: { status: 1, createdAt: -1 } },
    { name: 'status+createdAt (unresolved)', coll: 'yaksha_faq_unresolved_searches',   key: { status: 1, createdAt: -1 } },
    { name: 'faqId (unresolved)',          coll: 'yaksha_faq_unresolved_searches',     key: { faqId: 1 } },
    // Freshness system
    { name: 'faqId+reviewCycle+voterId',  coll: 'yaksha_faq_fresh_review_votes',       key: { faqId: 1, reviewCycle: 1, voterId: 1 }, options: { unique: true, background: true } },
    { name: 'faqId+reviewCycle+verdict',  coll: 'yaksha_faq_fresh_review_votes',       key: { faqId: 1, reviewCycle: 1, verdict: 1 } },
    { name: 'faqId+createdAt',            coll: 'yaksha_faq_fresh_review_logs',        key: { faqId: 1, createdAt: -1 } },
    { name: 'event+createdAt',            coll: 'yaksha_faq_fresh_review_logs',        key: { event: 1, createdAt: -1 } },
    { name: 'reviewStatus+flaggedAt',     coll: 'yaksha_faq_faqs',                     key: { reviewStatus: 1, flaggedAt: 1 } },
    // Escalation system
    { name: 'escalationStatus+createdAt', coll: 'yaksha_faq_communityposts',          key: { escalationStatus: 1, createdAt: -1 } },
    { name: 'escalationStatus+escalatedAt', coll: 'yaksha_faq_communityposts',       key: { escalationStatus: 1, escalatedAt: -1 } },
  ];

  for (const idx of indexes) {
    console.log(`Creating index "${idx.name}" on ${idx.coll}...`);
    try {
      await db.collection(idx.coll).createIndex(idx.key, idx.options);
      console.log('  ✓ Created');
    } catch (err: any) {
      if (err.code === 85 || err.code === 86) {
        console.log('  ✓ Already exists — skipping');
      } else {
        throw err;
      }
    }
  }

  console.log('\n✅ All indexes applied successfully.');
  console.log('Note: TTL index takes up to 60s to begin processing deletions.\n');

  await mongoose.disconnect();
  process.exit(0);
}

migrate().catch((err) => {
  console.error('\n❌ Migration failed:', (err as Error).message);
  process.exit(1);
});
