/**
 * v1.87 follow-up — one-time backfill for `Batch.status` on the
 * `summership` batch (`6a2da1bd887f1e7ceb58dcbb`).
 *
 * The `status` field (v1.69) declares `default: 'active'`, but
 * `summership` predates the field entirely and every read path uses
 * `.lean()`, so the default never materialized on this document.
 * `resolveActiveBatchBySlug()` (bridge-enrollment.ts) queries
 * `{ status: 'active' }` directly against Mongo — a document with no
 * `status` key does not match that query, regardless of the schema
 * default. Every bridged Samagama student hitting "Need support?"
 * for summership currently 404s because of this.
 *
 * Verified live 2026-09-24: `GET /api/batches/by-slug/summership`
 * returns no `status` key, while vriddhi and monsoonship both show
 * `"status":"active"`.
 *
 * Idempotent — only sets `status` where it is currently unset, and
 * matches by name, not the hardcoded id above (that id is cited in
 * this comment for traceability only).
 *
 * Run:  npx tsx scripts/migrate-summership-status.ts
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import Batch from '../modules/program/batch.model.js';

const BATCH_NAME = 'summership';

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(mongoUri);

  console.log(`Setting status: 'active' on batch "${BATCH_NAME}" where status is unset...`);
  const result = await Batch.updateMany(
    { name: BATCH_NAME, status: { $exists: false } },
    { $set: { status: 'active' } },
  );
  console.log(`  matched ${result.matchedCount}, modified ${result.modifiedCount}`);
  if (result.matchedCount === 0) {
    console.warn(`  warning: no batch named "${BATCH_NAME}" with an unset status was found. Either it already has a status, or the name has changed (see docs/samagama-csfaq-integration.md).`);
  }

  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
