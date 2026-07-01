/**
 * Backfill: compute CategoryCluster rows for every active batch.
 *
 * Idempotent. Safe to re-run: the clusterer preserves locked
 * rows and replaces everything else.
 *
 * Run:  npx tsx scripts/backfillCategoryClusters.ts
 *
 * For a dry-run pass (no DB writes), use --dry-run:
 *   npx tsx scripts/backfillCategoryClusters.ts --dry-run
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import { clusterAllActiveBatches, clusterCategoriesForBatch } from '../utils/ai/categoryClusterer.js';
import Batch from '../modules/program/batch.model.js';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI not set in .env');
  process.exit(1);
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`Connecting to MongoDB (dryRun=${dryRun})...`);
  await mongoose.connect(MONGODB_URI!);
  console.log('Connected.\n');

  if (dryRun) {
    const activeBatches = await Batch.find({ isActive: true }).select('_id name').lean();
    console.log(`Found ${activeBatches.length} active batch(es):`);
    for (const b of activeBatches) {
      const result = await clusterCategoriesForBatch(String(b._id), { dryRun: true });
      console.log(`  - "${b.name}" (${b._id}): would produce ${result.clusters} cluster(s), skipped=${result.skipped}`);
    }
  } else {
    console.log('Clustering all active batches...');
    await clusterAllActiveBatches();
    console.log('Done.');
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
