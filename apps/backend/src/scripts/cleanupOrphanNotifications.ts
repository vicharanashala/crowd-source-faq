/**
 * cleanupOrphanNotifications.ts — removes notifications
 * pointing at users that no longer exist in yaksha_faq_users.
 *
 * Run:  npm run cleanup:orphan-notifications
 *
 * The audit script (`npm run audit:data`) reports the orphan
 * count. This script deletes them.
 *
 * Idempotent — safe to re-run. After cleanup, the audit
 * should report 0 orphan-recipient issues.
 */

import 'dotenv/config';
import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGODB_URI!;
if (!MONGO_URI) {
  console.error('MONGODB_URI is required');
  process.exit(2);
}

/** Normalize an _id-ish value to a string. */
function idToString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v !== null && 'toString' in v) {
    return (v as { toString(): string }).toString();
  }
  return null;
}

async function main() {
  console.log('Cleaning up orphan notifications');
  console.log('===================================');

  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db!;

  // 1. Build the set of live user IDs
  const userIds = await db.collection('yaksha_faq_users').distinct('_id');
  const userIdSet = new Set(
    userIds.map((id) => idToString(id)).filter((s): s is string => s !== null)
  );
  console.log(`Loaded ${userIdSet.size} live user IDs`);

  // 2. Find distinct orphan recipient IDs
  const allRecipients = await db.collection('yaksha_faq_notifications')
    .find({}, { projection: { recipient: 1 } })
    .toArray();
  const orphans = new Set<string>();
  for (const n of allRecipients) {
    const str = idToString(n.recipient);
    if (str && !userIdSet.has(str)) orphans.add(str);
  }
  console.log(`Found ${orphans.size} orphan recipient IDs`);

  if (orphans.size === 0) {
    console.log('Nothing to clean.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // 3. List the orphan IDs and their notification counts
  //    BEFORE we delete — so the operator has a record.
  for (const id of orphans) {
    const n = await db.collection('yaksha_faq_notifications').countDocuments({ recipient: id });
    console.log(`  ${id}: ${n} notifications to delete`);
  }

  // 4. Delete
  // The recipient field is stored as either a string (older
  // rows) or an ObjectId (newer rows). We need to match both
  // representations of the same logical id.
  let totalDeleted = 0;
  for (const id of orphans) {
    const filter = {
      $or: [
        { recipient: id },                     // string match
        { recipient: new mongoose.Types.ObjectId(id) }, // ObjectId match
      ],
    };
    const r = await db.collection('yaksha_faq_notifications').deleteMany(filter);
    console.log(`  deleted ${r.deletedCount} (id=${id})`);
    totalDeleted += r.deletedCount;
  }

  console.log(`\n✅ Total deleted: ${totalDeleted}`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error((err as Error).message); process.exit(1); });
