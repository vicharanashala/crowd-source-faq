/**
 * migrate-categories.ts — Remap FAQ categories from 31 old names to 9 new ones.
 *
 * Idempotent: re-running won't duplicate or corrupt data.
 * Exports a pre-migration snapshot, remaps FAQ.category strings,
 * updates Category documents, and prints a summary report.
 *
 * Run:
 *   npx tsx apps/backend/src/scripts/migrate-categories.ts
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import FAQ from '../modules/faq/faq.model.js';
import Category, { slugifyCategoryName } from '../modules/faq/category.model.js';

// ── Deterministic old → new mapping ────────────────────────────────────────
const CATEGORY_MAP: Record<string, string> = {
  'About the Internship': 'Internship Basics',
  'Offer Letter':         'Internship Basics',
  'Account':              'Internship Basics',
  'NOC':                  'Internship Basics',
  'Requirements':         'Internship Basics',
  'Code of Conduct':      'Internship Basics',
  'Timing and Dates':     'Internship Basics',

  'Projects':             'Projects & GitHub',
  'GitHub Contributions': 'Projects & GitHub',

  'Attendance':           'Attendance & Zoom',
  'Attendance & Zoom':    'Attendance & Zoom',
  'Zoom':                 'Attendance & Zoom',
  'Internship Timeline':  'Attendance & Zoom',

  'ViBe Platform':        'Learning Platform',
  'Resources':            'Learning Platform',

  'Team Formation':       'Teams & Collaboration',
  'Mentorship':           'Teams & Collaboration',

  'Spurti Points':        'Rewards & Certificates',
  'Golden Tickets':       'Rewards & Certificates',
  'Certificates':         'Rewards & Certificates',
  'Certificate':          'Rewards & Certificates',

  'AI Providers':         'AI & Tools',
  'AI Usage':             'AI & Tools',

  'Community':            'Using Yaksha',
  'FAQ Portal':           'Using Yaksha',
  'FAQ':                  'Using Yaksha',
  'Search':               'Using Yaksha',

  'Technical Issues':     'Technical Support',
  'Support':              'Technical Support',
  'Notifications':        'Technical Support',
  'Administration':       'Technical Support',
};

// New category definitions (slug, description, icon, color)
const NEW_CATEGORIES = [
  { name: 'Internship Basics',      slug: 'internship-basics',      description: 'Getting started, registration, offer letters, NOC, requirements, and general internship information.', icon: 'GraduationCap', color: '#2563EB' },
  { name: 'Projects & GitHub',      slug: 'projects-github',        description: 'Project allocation, submissions, evaluations, and GitHub contribution guidelines.',                  icon: 'FolderGit2',   color: '#14B8A6' },
  { name: 'Attendance & Zoom',      slug: 'attendance-zoom',        description: 'Zoom sessions, attendance tracking, recordings, and internship timeline.',                         icon: 'Video',        color: '#EF4444' },
  { name: 'Learning Platform',      slug: 'learning-platform',      description: 'ViBe learning platform access, coursework, and resource availability.',                             icon: 'Monitor',      color: '#6366F1' },
  { name: 'Teams & Collaboration',  slug: 'teams-collaboration',    description: 'Team formation, mentorship, and collaborative project work.',                                       icon: 'Users',        color: '#F97316' },
  { name: 'Rewards & Certificates', slug: 'rewards-certificates',   description: 'Spurti Points, Golden Tickets, certificates, and recognition.',                                    icon: 'Award',        color: '#EC4899' },
  { name: 'AI & Tools',             slug: 'ai-tools',               description: 'Using AI tools, API keys, and AI usage policies during the internship.',                            icon: 'Sparkles',     color: '#7C3AED' },
  { name: 'Using Yaksha',           slug: 'using-yaksha',           description: 'FAQ portal, community features, search, and platform navigation.',                                  icon: 'MessageCircle',color: '#0891B2' },
  { name: 'Technical Support',      slug: 'technical-support',      description: 'Portal issues, support tickets, notifications, and troubleshooting.',                               icon: 'LifeBuoy',     color: '#DC2626' },
];

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not set in .env');
  }
  console.log('Connecting to MongoDB…');
  await mongoose.connect(mongoUri);
  console.log('Connected.\n');

  // ── Phase 1: export pre-migration snapshot ───────────────────────────────
  console.log('Phase 1 — exporting pre-migration snapshot…');
  const allFaqs = await FAQ.find({}, { _id: 1, question: 1, category: 1 }).lean();
  const allCats = await Category.find({}).lean();
  console.log(`  FAQs in DB:     ${allFaqs.length}`);
  console.log(`  Categories:     ${allCats.length}`);

  const oldCatCounts: Record<string, number> = {};
  for (const f of allFaqs) {
    const c = f.category || '(none)';
    oldCatCounts[c] = (oldCatCounts[c] || 0) + 1;
  }
  console.log('\n  Pre-migration category distribution:');
  for (const [cat, count] of Object.entries(oldCatCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cat}: ${count}`);
  }

  // ── Phase 2: remap FAQ.category strings ──────────────────────────────────
  console.log('\nPhase 2 — remapping FAQ.category strings…');
  let remapped = 0;
  let skipped = 0;
  let unmapped = 0;

  for (const faq of allFaqs) {
    const oldCat = faq.category || '';
    const newCat = CATEGORY_MAP[oldCat];

    if (!newCat) {
      console.log(`  ⚠ No mapping for "${oldCat}" (FAQ: ${faq.question?.slice(0, 60)}…)`);
      unmapped += 1;
      continue;
    }

    if (oldCat === newCat) {
      skipped += 1;
      continue;
    }

    await FAQ.updateOne(
      { _id: faq._id },
      { $set: { category: newCat } },
    );
    remapped += 1;
  }

  console.log(`  ✓ Remapped: ${remapped}`);
  console.log(`  ✓ Already correct: ${skipped}`);
  console.log(`  ⚠ Unmapped: ${unmapped}`);

  // ── Phase 3: delete old Category documents, insert new ones ──────────────
  console.log('\nPhase 3 — replacing Category documents…');

  // Collect all batchIds that have FAQs
  const batchIds = await FAQ.distinct('batchId');
  console.log(`  Found ${batchIds.length} distinct batchIds.`);

  // For each batch, delete old categories and insert new ones
  for (const batchId of batchIds) {
    if (!batchId) continue;

    const oldCats = await Category.find({ batchId }).lean();
    console.log(`  Batch ${batchId}: ${oldCats.length} old categories → deleting…`);
    await Category.deleteMany({ batchId });

    // Insert new categories
    const newCatDocs = NEW_CATEGORIES.map((cat) => ({
      batchId,
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
    }));

    const result = await Category.insertMany(newCatDocs, { ordered: true }).catch(() => {
      // If insertMany fails (e.g. duplicate), fall back to upserts
      return null;
    });

    if (result) {
      console.log(`  ✓ Inserted ${result.length} new categories for batch ${batchId}`);
    } else {
      // Fallback: upsert one by one
      let inserted = 0;
      for (const cat of newCatDocs) {
        await Category.findOneAndUpdate(
          { batchId, slug: cat.slug },
          { $setOnInsert: cat },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        inserted += 1;
      }
      console.log(`  ✓ Upserted ${inserted} new categories for batch ${batchId}`);
    }
  }

  // ── Phase 4: update FAQ.categoryId references ────────────────────────────
  console.log('\nPhase 4 — updating FAQ.categoryId references…');
  let catIdUpdated = 0;

  for (const batchId of batchIds) {
    if (!batchId) continue;

    const categories = await Category.find({ batchId }).lean();
    const slugToId = new Map(categories.map((c) => [c.slug, c._id]));

    const faqsInBatch = await FAQ.find(
      { batchId },
      { _id: 1, category: 1 },
    ).cursor();

    const ops: Array<{
      updateOne: {
        filter: { _id: mongoose.Types.ObjectId };
        update: { $set: { categoryId: mongoose.Types.ObjectId } };
      };
    }> = [];

    for await (const faq of faqsInBatch) {
      const slug = slugifyCategoryName(faq.category || '');
      const catId = slugToId.get(slug);
      if (catId) {
        ops.push({
          updateOne: {
            filter: { _id: faq._id as mongoose.Types.ObjectId },
            update: { $set: { categoryId: catId } },
          },
        });
      }
    }

    if (ops.length > 0) {
      const r = await FAQ.bulkWrite(ops, { ordered: false });
      catIdUpdated += r.modifiedCount;
    }
  }
  console.log(`  ✓ Updated categoryId on ${catIdUpdated} FAQs.`);

  // ── Phase 5: summary report ──────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════');
  console.log('  MIGRATION SUMMARY');
  console.log('═══════════════════════════════════════════════');

  const finalFaqs = await FAQ.find({}, { category: 1 }).lean();
  const finalCats = await Category.countDocuments({});
  const newCatCounts: Record<string, number> = {};
  for (const f of finalFaqs) {
    const c = f.category || '(none)';
    newCatCounts[c] = (newCatCounts[c] || 0) + 1;
  }

  console.log(`\n  Total FAQs:            ${finalFaqs.length}`);
  console.log(`  Total Categories:      ${finalCats}`);
  console.log(`  FAQs remapped:         ${remapped}`);
  console.log(`  FAQs with categoryId:  ${catIdUpdated}`);

  console.log('\n  Post-migration category distribution:');
  for (const [cat, count] of Object.entries(newCatCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cat}: ${count}`);
  }

  console.log('\n  Old categories → New categories:');
  for (const [oldCat, newCat] of Object.entries(CATEGORY_MAP).sort((a, b) => a[0].localeCompare(b[0]))) {
    if (oldCatCounts[oldCat]) {
      console.log(`    ${oldCat} → ${newCat} (${oldCatCounts[oldCat]} FAQs)`);
    }
  }

  await mongoose.disconnect();
  console.log('\nMigration complete.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
