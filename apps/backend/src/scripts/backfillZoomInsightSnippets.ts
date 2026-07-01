/**
 * Backfill script — populates `transcript_snippet` on existing Zoom
 * insights that were created before the field was reliably populated.
 *
 * Why: issue #11 — pre-2026 insights have empty `transcript_snippet`,
 * which renders as "—" in the admin UI. Filling the field here means
 * future reads work without any fallback logic in the UI.
 *
 * Idempotent: re-running is safe (the $or filter only matches rows
 * with empty/missing snippet). No destructive operations.
 *
 * Run: npx tsx scripts/backfillZoomInsightSnippets.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { ZoomInsight, ZoomMeeting } from '../modules/zoom/zoom-meeting.model.js';
import type { IZoomMeeting } from '../modules/zoom/zoom-meeting.model.js';

// Cap matches the system-prompt constraint in zoomExtractor.ts:
// "Maximum 150 characters in transcript_snippet."
const SNIPPET_MAX_CHARS = 150;

function buildSnippet(transcript: string): string {
  // Collapse whitespace (the raw transcript may have tabs / newlines
  // / multiple spaces from VTT timestamps + speaker labels). Truncate
  // at the cap; if we sliced mid-word, that's acceptable for a UI hint.
  return transcript.replace(/\s+/g, ' ').trim().slice(0, SNIPPET_MAX_CHARS);
}

async function main(): Promise<void> {
  if (!process.env.MONGODB_URI) {
    console.error('ERROR: MONGODB_URI not set in backend/.env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.');

  // Cursor over the matching insights. We only fetch the snippet
  // field plus meetingId — small documents, stream-friendly.
  const cursor = ZoomInsight.find({
    $or: [
      { transcript_snippet: { $exists: false } },
      { transcript_snippet: null },
      { transcript_snippet: '' },
    ],
  })
    .select('_id meetingId')
    .lean()
    .cursor();

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for await (const insight of cursor) {
    try {
      if (!insight.meetingId) {
        skipped++;
        continue;
      }
      const meeting = await ZoomMeeting.findById(insight.meetingId)
        .select('rawTranscriptText')
        .lean() as Pick<IZoomMeeting, 'rawTranscriptText'> | null;
      const transcript = meeting?.rawTranscriptText;
      if (!transcript) {
        skipped++;
        continue;
      }
      const snippet = buildSnippet(transcript);
      if (!snippet) {
        skipped++;
        continue;
      }
      await ZoomInsight.updateOne({ _id: insight._id }, { $set: { transcript_snippet: snippet } });
      updated++;
    } catch (err) {
      failed++;
      console.error(`  ✗ ${String(insight._id)}: ${(err as Error).message}`);
    }
    process.stdout.write(`\r  Updated: ${updated}   Skipped: ${skipped}   Failed: ${failed}   `);
  }

  process.stdout.write('\n');
  console.log(`Done. Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}`);

  await mongoose.disconnect();
  // Don't process.exit — let the event loop drain so mongoose cleanup
  // finishes without abort (matches the pattern in backfillEmbeddings.ts).
}

main().catch((err) => {
  console.error('\nBackfill failed:', (err as Error).message);
  process.exit(1);
});