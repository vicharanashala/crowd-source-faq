/**
 * Backfill structural metadata (category / audience / tags / summary) onto
 * EXISTING document + zoom insights that were created before the ingestion
 * tagging prompt existed.
 *
 * Run: npm run backfill:insight-metadata
 *
 * Idempotent: only rows whose `summary` is missing or empty are processed,
 * so re-running it resumes where a previous run stopped (e.g. after a crash
 * or rate-limit). Each row costs one cheap LLM call via tagInsight(), which
 * never throws — a single bad row falls back to safe defaults and the run
 * continues.
 */

import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local' });
import mongoose from 'mongoose';
import { tagInsight, PROMPT_VERSION } from '../utils/ai/documentAiPipeline.js';

const DOC_COLL = 'yaksha_faq_document_insights';
const ZOOM_COLL = 'yaksha_zoom_insights';

interface InsightRow {
  _id: mongoose.Types.ObjectId;
  question?: string;
  answer_or_content?: string;
}

/** Throttle between LLM calls so we don't trip provider rate limits. */
const DELAY_MS = 200;

async function backfillCollection(
  db: NonNullable<typeof mongoose.connection.db>,
  collName: string,
  opts: { setPromptVersion: boolean },
): Promise<void> {
  const coll = db.collection(collName);
  // Untagged = no summary field yet, or an empty summary string.
  const rows = (await coll
    .find({ $or: [{ summary: { $exists: false } }, { summary: '' }] })
    .toArray()) as unknown as InsightRow[];

  console.log(`\n${collName}: ${rows.length} untagged insights`);
  if (rows.length === 0) return;

  let done = 0;
  let errors = 0;
  for (const row of rows) {
    try {
      const meta = await tagInsight(row.question ?? '', row.answer_or_content ?? '');
      const set: Record<string, unknown> = {
        category: meta.category,
        audience: meta.audience,
        tags: meta.tags,
        summary: meta.summary,
      };
      if (opts.setPromptVersion) set.aiPromptVersion = PROMPT_VERSION;
      await coll.updateOne({ _id: row._id }, { $set: set });
      done++;
      process.stdout.write(`\r  ${collName}: ${done}/${rows.length}   `);
    } catch (err) {
      errors++;
      console.error(`\n  [backfill] Failed to tag ${collName} ${row._id}: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  console.log(`\n  ✓ ${done} tagged${errors ? `, ${errors} errors` : ''}`);
}

async function main(): Promise<void> {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db!;

  // Document insights carry an aiPromptVersion stamp; zoom insights don't.
  await backfillCollection(db, DOC_COLL, { setPromptVersion: true });
  await backfillCollection(db, ZOOM_COLL, { setPromptVersion: false });

  console.log('\n✅ Insight metadata backfill complete!');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
