/**
 * Backfill only CommunityPost embeddings that are missing.
 * Run: npx tsx scripts/backfillCommunityEmbeddings.ts
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import CommunityPost from '../models/CommunityPost.js';
import { generateEmbedding } from '../utils/embeddings.js';

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('ERROR: MONGODB_URI not set.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const posts = await CommunityPost.find({ $or: [{ embedding: { $exists: false } }, { embedding: null }] });

  if (!posts.length) {
    console.log('No posts missing embeddings — nothing to do.');
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log(`Found ${posts.length} posts needing embeddings...`);

  let updated = 0;
  let failed = 0;
  for (const post of posts) {
    try {
      post.embedding = await generateEmbedding(`${post.title}. ${post.body}`);
      await post.save();
      updated++;
      process.stdout.write(`\r  Updated: ${updated}   Failed: ${failed}   `);
    } catch (err) {
      failed++;
      console.error(`\n  ✗ ${post._id}: ${(err as Error).message}`);
    }
  }

  console.log(`\n✅ Done. ${updated} updated${failed ? `, ${failed} failed` : ''}.`);
  await mongoose.disconnect();
  process.exit(failed > 0 && updated === 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
