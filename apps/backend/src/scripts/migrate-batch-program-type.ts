/**
 * v1.87 — one-time backfill for `Batch.programType`.
 *
 * The schema declares `default: 'internship'`, but every read path in
 * this codebase uses `.lean()` (see batch.controller.ts,
 * bridge-enrollment.ts, tee.controller.ts), and a Mongoose schema
 * default never materializes on a pre-existing document under
 * `.lean()` — it only applies when a *new* document is constructed.
 * Verified live 2026-09-24: `GET /api/batches/by-slug/vriddhi` shows
 * no `programType` key at all, for a batch this same script has
 * supposedly already covered. So every existing batch, not just the
 * FDP one, needs its `programType` set explicitly here.
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
const INTERNSHIP_BATCH_NAMES = ['summership', 'Monsoonship'];

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(mongoUri);

  console.log(`Marking ${FDP_BATCH_NAMES.join(', ')} as programType: 'fdp'...`);
  const fdpResult = await Batch.updateMany(
    { name: { $in: FDP_BATCH_NAMES } },
    { $set: { programType: 'fdp' } },
  );
  console.log(`  matched ${fdpResult.matchedCount}, modified ${fdpResult.modifiedCount}`);
  if (fdpResult.matchedCount < FDP_BATCH_NAMES.length) {
    console.warn(`  warning: matched fewer batches than expected. Check for a rename (see docs/samagama-csfaq-integration.md).`);
  }

  console.log(`Marking ${INTERNSHIP_BATCH_NAMES.join(', ')} as programType: 'internship'...`);
  const internshipResult = await Batch.updateMany(
    { name: { $in: INTERNSHIP_BATCH_NAMES } },
    { $set: { programType: 'internship' } },
  );
  console.log(`  matched ${internshipResult.matchedCount}, modified ${internshipResult.modifiedCount}`);
  if (internshipResult.matchedCount < INTERNSHIP_BATCH_NAMES.length) {
    console.warn(`  warning: matched fewer batches than expected. Check for a rename (see docs/samagama-csfaq-integration.md).`);
  }

  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
