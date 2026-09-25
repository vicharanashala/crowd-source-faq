/**
 * One-time cleanup: drops the throwaway `debug_temp_2026_09_25`
 * collection created during the 2026-09-25 live-bug investigation
 * (see programScope.ts git history / project memory for context).
 * Safe to run even if the collection doesn't exist.
 *
 * Run:  npx tsx src/scripts/drop-debug-temp-collection.ts
 */

import 'dotenv/config';
import mongoose from 'mongoose';

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(mongoUri);

  const db = mongoose.connection.db;
  if (!db) throw new Error('no db connection');

  const collections = await db.listCollections({ name: 'debug_temp_2026_09_25' }).toArray();
  if (collections.length === 0) {
    console.log('debug_temp_2026_09_25 does not exist — nothing to do.');
  } else {
    await db.collection('debug_temp_2026_09_25').drop();
    console.log('Dropped debug_temp_2026_09_25.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
