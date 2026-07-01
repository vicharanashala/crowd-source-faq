/**
 * migrateTierNames.ts
 * One-time migration: remap old tier enum values (bronze/silver/gold/platinum/legend)
 * to the new knowledge-lifecycle tier names (contributor/helper/expert/champion/knowledge_master).
 * Safe to run multiple times — idempotent.
 */

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb+srv://meowmeow:***@cluster0.z3cgb58.mongodb.net/?appName=Cluster0';

const TIER_MAP: Record<string, string> = {
  bronze:    'contributor',
  silver:    'helper',
  gold:      'expert',
  platinum:  'champion',
  legend:    'knowledge_master',
};

async function main() {
  await mongoose.connect(MONGODB_URI, { dbName: 'yaksha_faq' });

  const db = mongoose.connection.db!;
  const collection = db.collection('users');

  let updated = 0;
  let alreadyCurrent = 0;
  let errors = 0;

  const cursor = collection.find({ tier: { $in: Object.keys(TIER_MAP) } });
  for await (const doc of cursor) {
    const oldTier = doc.tier as string;
    const newTier = TIER_MAP[oldTier];
    if (!newTier) continue;

    try {
      const result = await collection.updateOne(
        { _id: doc._id },
        { $set: { tier: newTier } }
      );
      if (result.modifiedCount > 0) {
        console.log(`  ✓ ${doc.email ?? doc._id}: "${oldTier}" → "${newTier}"`);
        updated++;
      } else {
        alreadyCurrent++;
      }
    } catch (e) {
      console.error(`  ✗ ${doc._id}: ${(e as Error).message}`);
      errors++;
    }
  }

  // Also fix any stale tier values in ReputationLog
  const logCollection = db.collection('reputationlogs');
  let logUpdated = 0;
  for (const [oldTier, newTier] of Object.entries(TIER_MAP)) {
    const result = await logCollection.updateMany(
      { 'metadata.tier': oldTier },
      { $set: { 'metadata.tier': newTier } }
    );
    if (result.modifiedCount > 0) {
      console.log(`  ✓ ReputationLog: "${oldTier}" → "${newTier}" (${result.modifiedCount} docs)`);
      logUpdated += result.modifiedCount;
    }
  }

  console.log(`\nDone. users updated=${updated}, log docs=${logUpdated}, errors=${errors}`);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });