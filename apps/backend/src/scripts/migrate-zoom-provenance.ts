/**
 * Migration: backfill provenance fields on ZoomMeeting and ZoomInsight records.
 *
 * ZoomMeeting fields:
 *   - sourcing:     set to 'webhook' for records where sourceType is null (pre-fix webhook imports)
 *   - sourceType:   set to 'zoom'    for records where sourceType is null (pre-fix webhook imports)
 *
 * ZoomInsight fields:
 *   - sourcing:     set to 'webhook' for records where sourcing is null (pre-fix)
 *   - processedBy:  set to 'unknown:unknown' for records where null (pre-fix)
 *   - sourceType:   set to 'zoom_transcript' for records where null (pre-fix)
 *
 * Run: node scripts/migrate-zoom-provenance.ts
 */

import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:27017/yaksha_faq';

async function main() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db!;

  // ── ZoomMeeting ────────────────────────────────────────────────────────────
  console.log('\n=== ZoomMeeting ===');

  const mtgResult = await db.collection('yaksha_zoom_meetings').updateMany(
    { sourcing: { $exists: false } },
    {
      $set: {
        sourcing:    'webhook',
        sourceType:  'zoom',
        processedBy: 'unknown:unknown',
      },
    }
  );
  console.log(`  Backfilled ${mtgResult.modifiedCount} meetings (sourcing/sourceType/processedBy)`);

  // ── ZoomInsight ────────────────────────────────────────────────────────────
  console.log('\n=== ZoomInsight ===');

  const insResult = await db.collection('yaksha_zoom_insights').updateMany(
    { sourcing: { $exists: false } },
    {
      $set: {
        sourcing:      'webhook',
        processedBy:   'unknown:unknown',
        sourceType:    'zoom_transcript',
        sourceTitle:   null,
      },
    }
  );
  console.log(`  Backfilled ${insResult.modifiedCount} insights (sourcing/processedBy/sourceType/sourceTitle)`);

  // ── Summary ────────────────────────────────────────────────────────────────
  const remainingMeetings = await db.collection('yaksha_zoom_meetings').countDocuments({ sourcing: { $exists: false } });
  const remainingInsights = await db.collection('yaksha_zoom_insights').countDocuments({ sourcing: { $exists: false } });

  console.log(`\n  Remaining meetings without sourcing: ${remainingMeetings}`);
  console.log(`  Remaining insights  without sourcing: ${remainingInsights}`);
  console.log('\n✅ Migration complete.');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});