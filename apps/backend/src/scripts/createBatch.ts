/**
 * createBatch.ts — seeds a default Batch (program context) into MongoDB.
 * Usage (from apps/backend):
 *   npx tsx --env-file=.env src/scripts/createBatch.ts
 *
 * Edit the BATCH block below if needed.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import Batch from '../modules/program/batch.model.js';

// ── ✏️  Edit these if needed ────────────────────────────────────────────────
const BATCH = {
  name:           'Summer Internship 2026',
  description:    'Default program batch for the Yaksha FAQ portal.',
  startDate:      new Date('2026-06-01'),
  endDate:        new Date('2026-12-31'),
  isActive:       true,
  isDefault:      true,
  status:         'active' as const,
  enrollmentMode: 'open' as const,
};
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌  MONGODB_URI is not set. Make sure .env is loaded.');
    process.exit(1);
  }

  console.log('🔌  Connecting to MongoDB…');
  await mongoose.connect(uri);
  console.log('✅  Connected');

  // Clear any existing isDefault flag first
  await (Batch as any).updateMany({ isDefault: true }, { $set: { isDefault: false } });

  const existing = await Batch.findOne({ name: BATCH.name });
  if (existing) {
    // Just mark it active + default
    existing.isActive  = true;
    existing.isDefault = true;
    existing.status    = 'active';
    await existing.save();
    console.log(`\n✅  Batch already exists — updated to active + default.`);
    console.log(`  _id  : ${existing._id}`);
    console.log(`  name : ${existing.name}\n`);
    await mongoose.disconnect();
    return;
  }

  const batch = new Batch(BATCH);
  await batch.save();

  console.log('\n🎉  Batch created successfully!');
  console.log('────────────────────────────────');
  console.log(`  _id    : ${batch._id}`);
  console.log(`  name   : ${batch.name}`);
  console.log(`  status : ${batch.status}`);
  console.log(`  default: ${batch.isDefault}`);
  console.log('────────────────────────────────');
  console.log('\nYou can now post questions in the portal.\n');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌  Error:', err.message ?? err);
  process.exit(1);
});
