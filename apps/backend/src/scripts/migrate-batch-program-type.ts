/**
 * v1.87 — one-time backfill for `Batch.programType`.
 *
 * The schema default (`'internship'`) already covers every existing
 * batch correctly except one: Vriddhi, which is a faculty
 * development programme (FDP), not an internship, and must not ask
 * its members for an `internshipEndDate`.
 *
 * Idempotent. Matches by name rather than a hardcoded batchId, since
 * `programType` is a one-time content decision, not a fragile
 * lookup key like the derived slug — safe to re-run.
 *
 * Run:  npx tsx scripts/migrate-batch-program-type.ts
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import Batch from '../modules/program/batch.model.js';

const FDP_BATCH_NAMES = ['Vriddhi'];

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error('MONGO_URI is not set');
  await mongoose.connect(mongoUri);

  console.log(`Marking ${FDP_BATCH_NAMES.join(', ')} as programType: 'fdp'...`);
  const result = await Batch.updateMany(
    { name: { $in: FDP_BATCH_NAMES } },
    { $set: { programType: 'fdp' } },
  );
  console.log(`  matched ${result.matchedCount}, modified ${result.modifiedCount}`);
  if (result.matchedCount < FDP_BATCH_NAMES.length) {
    console.warn(`  warning: matched fewer batches than expected. Check for a rename (see docs/samagama-csfaq-integration.md).`);
  }

  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
