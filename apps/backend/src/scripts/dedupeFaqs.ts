/**
 * dedupeFaqs.ts — bring the yaksha_faq_faqs collection to
 * exactly the contents of the current backend/faqs.json.
 *
 * Idempotent and non-destructive in the user's sense: it
 * only removes rows whose question text is NOT in the
 * current faqs.json. Anything else (user-generated FAQs,
 * audit logs, etc.) is untouched.
 *
 * Use case: after `npm run fetch:faqs` + `npm run seed`,
 * you have 126 old (v21) + 141 new (v24) = 267 rows
 * because the live site reworded some questions between
 * versions and the seed's exact-text dedup found 0 matches.
 * This script removes the 126 stale rows.
 *
 * Run:  npm run dedupe:faqs
 *
 * Algorithm:
 *   1. Load the question texts from backend/faqs.json
 *   2. find() all FAQ rows where question is NOT in the
 *      canonical set → batch deleteMany in chunks of 100
 *   3. Report: canonical count, removed count, remaining count
 *
 * Idempotent — running it twice does nothing the second time.
 */

import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import FAQ from '../modules/faq/faq.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FAQS_JSON = path.join(__dirname, '..', 'faqs.json');

const MONGO_URI = process.env.MONGODB_URI!;
if (!MONGO_URI) {
  console.error('MONGODB_URI is not set');
  process.exit(1);
}

async function main(): Promise<void> {
  console.log('Yaksha FAQ dedupe');
  console.log('================');
  console.log(`Source: ${FAQS_JSON}`);

  // 1. Load the canonical question set
  const raw = await fs.readFile(FAQS_JSON, 'utf-8');
  const parsed = JSON.parse(raw) as { faqs?: { question: string }[] };
  const canonical = new Set<string>(
    (parsed.faqs ?? []).map((f) => f.question.trim())
  );
  console.log(`Canonical (from faqs.json): ${canonical.size} questions`);

  // 2. Connect + count
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db!;
  const col = db.collection('yaksha_faq_faqs');
  const totalBefore = await col.countDocuments();
  const canonicalInDb = await col.countDocuments({ question: { $in: [...canonical] } });
  const staleCount = totalBefore - canonicalInDb;
  console.log(`DB before: ${totalBefore} docs (${canonicalInDb} match canonical, ${staleCount} stale)`);

  if (staleCount === 0) {
    console.log('\n✅ Nothing to remove — DB already matches faqs.json.');
    await mongoose.disconnect();
    return;
  }

  // 3. Delete stale docs in chunks of 100 (Mongo's BSON
  //    limit caps deleteMany's filter at 16MB; 100 docs
  //    is safely under that)
  const CHUNK = 100;
  let removed = 0;
  // Pull just the _id of stale docs in chunks
  const staleIds = (await col
    .find({ question: { $nin: [...canonical] } }, { projection: { _id: 1 } })
    .toArray()).map((d) => d._id);
  for (let i = 0; i < staleIds.length; i += CHUNK) {
    const batch = staleIds.slice(i, i + CHUNK);
    const r = await col.deleteMany({ _id: { $in: batch } });
    removed += r.deletedCount;
    console.log(`  removed ${r.deletedCount} (${removed}/${staleIds.length})`);
  }

  // 4. Verify
  const totalAfter = await col.countDocuments();
  console.log(`\nDB after: ${totalAfter} docs (target: ${canonical.size})`);
  if (totalAfter === canonical.size) {
    console.log('✅ DB matches faqs.json exactly.');
  } else {
    console.log(`⚠  Drift: ${Math.abs(totalAfter - canonical.size)} rows off.`);
  }
  await mongoose.disconnect();
}

main().catch((err) => { console.error((err as Error).message); process.exit(1); });
