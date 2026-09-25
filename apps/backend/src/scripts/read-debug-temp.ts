/**
 * Read-only: dumps the throwaway `debug_temp_2026_09_25` collection
 * written by the temporary instrumentation in programScope.ts (see
 * that file for context — a confirmed live case where an active,
 * demonstrably-correct ProgramEnrollment row isn't found by the exact
 * query that should match it).
 *
 * Run:  npx tsx src/scripts/read-debug-temp.ts
 */

import 'dotenv/config';
import mongoose from 'mongoose';

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(mongoUri);

  const db = mongoose.connection.db;
  if (!db) throw new Error('no db connection');

  const filterUserId = process.argv[2] || null;
  const query = filterUserId ? { userId: filterUserId } : {};
  const docs = await db.collection('debug_temp_2026_09_25').find(query).sort({ at: -1 }).limit(20).toArray();
  console.log(`Found ${docs.length} debug entries (most recent first):\n`);
  for (const d of docs) {
    console.log(JSON.stringify(d, null, 2));
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
