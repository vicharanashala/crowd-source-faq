/**
 * recomputeTier.ts — one-shot tier recompute for all users.
 *
 * Run:  npm run recompute:tier
 *
 * The audit script reports users where `tier` doesn't match
 * `calculateTier(points)`. This script writes the correct
 * tier for every user based on the canonical calculateTier()
 * function.
 *
 * Idempotent — running it again is a no-op (the values will
 * already match).
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { calculateTier } from '../modules/auth/user.model.js';

const MONGO_URI = process.env.MONGODB_URI!;
if (!MONGO_URI) {
  console.error('MONGODB_URI is required');
  process.exit(1);
}

async function main() {
  console.log('Recomputing user tiers');
  console.log('=====================');

  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db!;

  const users = await db.collection('yaksha_faq_users')
    .find({}, { projection: { _id: 1, name: 1, points: 1, tier: 1 } })
    .toArray();
  console.log(`Loaded ${users.length} users`);

  let updated = 0;
  for (const u of users) {
    const correctTier = calculateTier(u.points || 0);
    if (u.tier !== correctTier) {
      await db.collection('yaksha_faq_users').updateOne(
        { _id: u._id },
        { $set: { tier: correctTier } }
      );
      updated++;
      console.log(`  ${u.name || u._id.toString()}: points=${u.points} ${u.tier} → ${correctTier}`);
    }
  }

  console.log(`\n✅ Updated ${updated} of ${users.length} users`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error((err as Error).message); process.exit(1); });
