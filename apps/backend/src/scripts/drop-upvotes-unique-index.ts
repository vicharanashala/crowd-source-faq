/**
 * Migration: Drop the broken unique index on the `upvotes` array field.
 *
 * Issue #13 — the unique constraint on a multikey (array) index prevents
 * a user from upvoting more than one post across the entire collection.
 * The schema definition has been fixed, but any existing MongoDB deployment
 * will still have the old unique index in place until it is explicitly
 * dropped.  This script does that.
 *
 * Usage:
 *   npx tsx scripts/drop-upvotes-unique-index.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const COLLECTION = 'yaksha_faq_communityposts';

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/cs15';
  await mongoose.connect(uri);
  console.log(`Connected to ${uri}`);

  const db = mongoose.connection.db!;
  const col = db.collection(COLLECTION);

  // List current indexes
  const indexes = await col.indexes();
  const upvoteIdx = indexes.find(
    (idx) =>
      idx.key && 'upvotes' in idx.key && idx.unique === true
  );

  if (!upvoteIdx) {
    console.log('✔  No unique index on upvotes found — nothing to do.');
  } else {
    console.log(`Found unique index "${upvoteIdx.name}" — dropping…`);
    await col.dropIndex(upvoteIdx.name!);
    console.log('✔  Unique index dropped successfully.');
  }

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
