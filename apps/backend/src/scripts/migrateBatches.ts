/**
 * migrateBatches.ts — one-time backfill of the Batch + Category models.
 *
 * Idempotent: re-running won't double-create anything. Every step is an
 * upsert or a set-on-missing. Logs counts so you can verify the result.
 *
 * Run once:
 *   npx tsx scripts/migrateBatches.ts
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import Batch from '../modules/program/batch.model.js';
import Category, { slugifyCategoryName } from '../modules/faq/category.model.js';
import FAQ from '../modules/faq/faq.model.js';

const LEGACY_BATCH_NAME = 'Yaksha 2025–26';
const LEGACY_BATCH_DESCRIPTION =
  'Pre-batch-migration cohort. Holds all FAQs created before the Batch ' +
  'feature shipped. Visible to admins in the legacy analytics view.';

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not set in .env');
  }
  console.log('Connecting to MongoDB…');
  await mongoose.connect(mongoUri);
  console.log('Connected.\n');

  // ── Phase 1: bootstrap the legacy batch ──────────────────────────────────
  console.log('Phase 1 — bootstrapping legacy batch…');
  const legacy = await Batch.findOneAndUpdate(
    { name: LEGACY_BATCH_NAME },
    {
      $setOnInsert: {
        name: LEGACY_BATCH_NAME,
        description: LEGACY_BATCH_DESCRIPTION,
        startDate: new Date('2025-06-01T00:00:00Z'),
        endDate: new Date('2027-12-31T23:59:59Z'),
        isActive: true,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  console.log(`  ✓ Legacy batch id: ${legacy._id.toString()}`);

  // ── Phase 2: backfill batchId on FAQs that don't have one yet ───────────
  console.log('\nPhase 2 — backfilling FAQ.batchId…');
  const faqFilter = { batchId: { $in: [null, undefined] } };
  const pendingFaqs = await FAQ.countDocuments(faqFilter);
  if (pendingFaqs === 0) {
    console.log('  ✓ All FAQs already have a batchId — skipping.');
  } else {
    const r = await FAQ.updateMany(faqFilter, { $set: { batchId: legacy._id } });
    console.log(`  ✓ Updated ${r.modifiedCount} FAQs to batchId = ${legacy._id.toString()}`);
  }

  // ── Phase 3: create Category docs from existing FAQ.category strings ─────
  console.log('\nPhase 3 — building Categories from FAQ.category…');
  const distinct = await FAQ.distinct('category', { batchId: legacy._id });
  console.log(`  Found ${distinct.length} distinct category names in legacy batch.`);

  let catCreated = 0;
  let catReused = 0;
  const categoryIdBySlug = new Map<string, mongoose.Types.ObjectId>();

  for (const rawName of distinct) {
    if (!rawName || typeof rawName !== 'string') continue;
    const name = rawName.trim();
    if (!name) continue;
    const slug = slugifyCategoryName(name);

    const existing = await Category.findOneAndUpdate(
      { batchId: legacy._id, slug },
      {
        $setOnInsert: { batchId: legacy._id, slug, name, description: '' },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    categoryIdBySlug.set(slug, existing._id);
    // Cheap heuristic: if name is unchanged from when we last saw it, count as reused
    if (existing.createdAt.getTime() < Date.now() - 1000) catReused += 1;
    else catCreated += 1;
  }
  console.log(`  ✓ Categories: ${catCreated} newly created, ${catReused} already existed.`);

  // ── Phase 4: backfill FAQ.categoryId where missing ───────────────────────
  console.log('\nPhase 4 — backfilling FAQ.categoryId…');
  const needsCatId = await FAQ.countDocuments({
    batchId: legacy._id,
    categoryId: null,
  });
  if (needsCatId === 0) {
    console.log('  ✓ All legacy FAQs already have a categoryId — skipping.');
  } else {
    // Use a single aggregation pipeline update so we resolve each FAQ's
    // category in one round trip per chunk, not N findOne calls.
    const cursor = FAQ.find(
      { batchId: legacy._id, categoryId: null },
      { _id: 1, category: 1 },
    ).cursor();

    const ops: Array<{ updateOne: { filter: { _id: mongoose.Types.ObjectId }; update: { $set: { categoryId: mongoose.Types.ObjectId } } } }> = [];
    for await (const f of cursor) {
      const slug = slugifyCategoryName(f.category || '');
      const catId = categoryIdBySlug.get(slug);
      if (!catId) continue;
      ops.push({
        updateOne: { filter: { _id: f._id as mongoose.Types.ObjectId }, update: { $set: { categoryId: catId } } },
      });
    }
    if (ops.length > 0) {
      const r = await FAQ.bulkWrite(ops, { ordered: false });
      console.log(`  ✓ Set categoryId on ${r.modifiedCount} legacy FAQs.`);
    } else {
      console.log('  ✓ No categoryId updates needed.');
    }
  }

  // ── Final report ─────────────────────────────────────────────────────────
  console.log('\nFinal counts:');
  const totalBatches = await Batch.countDocuments({});
  const totalCats = await Category.countDocuments({ batchId: legacy._id });
  const totalFaqsInLegacy = await FAQ.countDocuments({ batchId: legacy._id });
  const totalFaqsWithCatId = await FAQ.countDocuments({ batchId: legacy._id, categoryId: { $ne: null } });
  console.log(`  Batches:                   ${totalBatches}`);
  console.log(`  Categories in legacy:      ${totalCats}`);
  console.log(`  FAQs in legacy batch:      ${totalFaqsInLegacy}`);
  console.log(`  FAQs with categoryId:      ${totalFaqsWithCatId}`);

  await mongoose.disconnect();
  console.log('\nMigration complete.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
