/**
 * Seed FAQs and users from faqs.json + embedded data.
 * Run: npx tsx scripts/seed.ts
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import mongoose from 'mongoose';
import FAQ from '../modules/faq/faq.model.js';
import User from '../modules/auth/user.model.js';
import Batch from '../modules/program/batch.model.js';
import { generateEmbedding } from '../utils/ai/embeddings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI not set in .env');
  process.exit(1);
}

// v1.69 — the seed now bootstraps a default program (Batch) so the
// public site has something to show. The flag is `isDefault: true`;
// the BatchContext on the frontend prefers isDefault batches when no
// batch is selected. Re-running the seed is idempotent: it only
// creates the default batch if none exists, and only backfills FAQs
// whose batchId is still null.
const DEFAULT_BATCH = {
  name: 'Yaksha 2026-27',
  description:
    'The two-month, full-time research internship at the Vicharanashala Lab, ' +
    'IIT Ropar. Real open-source work under a mentor, free of charge.',
  // Today → ~2 months out, so the program is "live" at seed time.
  // These are placeholders; admins can edit dates from /admin/batches.
  startDate: () => new Date(),
  endDate: () => {
    const d = new Date();
    d.setMonth(d.getMonth() + 2);
    return d;
  },
};

const seed = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);

    // Upsert users
    console.log('[1/3] Seeding users...');
    const users = [
      { name: 'Test User', email: 'user@yaksha.com', password: 'password123', role: 'user' },
      { name: 'Admin User', email: 'admin@yaksha.com', password: 'admin123', role: 'admin' },
    ];
    for (const user of users) {
      const existing = await User.findOne({ email: user.email });
      if (existing) {
        // Only update name and role — never touch password of existing users
        existing.name = user.name;
        existing.role = user.role as any;
        await existing.save();
      } else {
        const created = await User.create(user);
        // hash the password by triggering the pre-save hook
        created.password = user.password;
        await created.save();
      }
    }
    console.log('  ✓ Users upserted and passwords hashed');

    // Bootstrap a default program (Batch). Idempotent: if any batch
    // already has isDefault:true we leave it alone; otherwise we
    // create the Yaksha 2026-27 batch and flag it as default.
    console.log('[2/3] Bootstrapping default program...');
    let defaultBatch = await Batch.findOne({ isDefault: true });
    if (!defaultBatch) {
      // Edge case: a batch with the right name exists from a prior
      // run but never had isDefault flipped. Promote it instead of
      // creating a duplicate (the Batch name index is case-insensitive
      // unique, so a plain create would throw on the second run).
      defaultBatch = await Batch.findOne({ name: DEFAULT_BATCH.name });
      if (defaultBatch) {
        defaultBatch.isDefault = true;
        await defaultBatch.save();
        console.log(`  ✓ Promoted existing batch "${defaultBatch.name}" to isDefault: true`);
      } else {
        defaultBatch = await Batch.create({
          name: DEFAULT_BATCH.name,
          description: DEFAULT_BATCH.description,
          startDate: DEFAULT_BATCH.startDate(),
          endDate: DEFAULT_BATCH.endDate(),
          isActive: true,
          isDefault: true,
        });
        console.log(`  ✓ Created default batch "${defaultBatch.name}" (${defaultBatch._id})`);
      }
    } else {
      console.log(`  ✓ Default batch already exists: "${defaultBatch.name}" (${defaultBatch._id})`);
    }

    // Upsert FAQs from faqs.json
    console.log('[3/3] Seeding FAQs...');
    const faqPath = path.join(__dirname, '..', 'faqs.json');
    try {
      const faqDataRaw = await fs.readFile(faqPath, 'utf-8');
      // v1.68 — faqs.json is a wrapped object: { source, version, ..., faqs: [...] }.
      // Older revisions were a bare array; handle both shapes.
      const parsed = JSON.parse(faqDataRaw) as unknown;
      const allFaqs: { id?: string; section?: string; question: string; answer: string; category?: string }[] = Array.isArray(parsed)
        ? (parsed as { question: string; answer: string; category?: string }[])
        : ((parsed as { faqs?: { id?: string; section?: string; question: string; answer: string; category?: string }[] }).faqs ?? []);
      console.log(`  Found ${allFaqs.length} FAQs in faqs.json`);

      let inserted = 0, skipped = 0;
      for (let i = 0; i < allFaqs.length; i++) {
        const faq = allFaqs[i];
        const existing = await FAQ.findOne({ question: faq.question });
        if (existing) { skipped++; continue; }

        const embedding = await generateEmbedding(`Section: ${faq.category ?? faq.section ?? 'General'}. Question: ${faq.question}. Answer: ${faq.answer}`);
        await FAQ.create({
          question: faq.question,
          answer: faq.answer,
          category: faq.category ?? faq.section ?? 'General',
          embedding,
          searchCount: 0,
          status: 'approved',
          reviewStatus: 'verified',
          // Tie every newly-seeded FAQ to the default program so the
          // public home page actually has data to render.
          batchId: defaultBatch._id,
        });
        inserted++;
        if ((i + 1) % 10 === 0) console.log(`  Processed ${i + 1}/${allFaqs.length} (${inserted} inserted, ${skipped} skipped)`);
      }

      console.log(`  ✓ ${inserted} inserted, ${skipped} skipped`);

      // One-time backfill: any pre-existing FAQ with batchId:null
      // (e.g. from an earlier seed run before this commit) gets
      // attached to the default batch so the public list isn't empty.
      const orphaned = await FAQ.countDocuments({ batchId: null });
      if (orphaned > 0) {
        const res = await FAQ.updateMany(
          { batchId: null },
          { $set: { batchId: defaultBatch._id } }
        );
        console.log(`  ✓ Backfilled ${res.modifiedCount} orphaned FAQ(s) to default batch`);
      }
    } catch (err) {
      console.warn(`  ⚠ Warning: Could not read faqs.json from ${faqPath}. Skipping FAQ seeding. ${(err as Error).message}`);
    }

    console.log('Seeding complete!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
};

seed();

