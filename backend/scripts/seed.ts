/**
 * Seed FAQs and users from faqs.json + embedded data.
 * Run: npx tsx scripts/seed.ts
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import mongoose from 'mongoose';
import FAQ from '../models/FAQ.js';
import User from '../models/User.js';
import { generateEmbedding } from '../utils/embeddings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI not set in .env');
  process.exit(1);
}

const seed = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);

    // Upsert users
    console.log('[1/2] Seeding users...');
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

    // Upsert FAQs from faqs.json
    console.log('[2/2] Seeding FAQs...');
    const faqPath = path.join(__dirname, '..', 'faqs.json');
    try {
      const faqDataRaw = await fs.readFile(faqPath, 'utf-8');
      const allFaqs = JSON.parse(faqDataRaw).map((faq: any) => ({
        question: faq.question,
        answer: faq.answer,
        category: faq.category || 'General',
      }));
      console.log(`  Found ${allFaqs.length} FAQs in faqs.json`);

      let inserted = 0, skipped = 0;
      for (let i = 0; i < allFaqs.length; i++) {
        const faq = allFaqs[i];
        const existing = await FAQ.findOne({ question: faq.question });
        if (existing) { skipped++; continue; }

        const embedding = await generateEmbedding(`Section: ${faq.category}. Question: ${faq.question}. Answer: ${faq.answer}`);
        await FAQ.create({ ...faq, embedding, searchCount: 0 });
        inserted++;
        if ((i + 1) % 10 === 0) console.log(`  Processed ${i + 1}/${allFaqs.length} (${inserted} inserted, ${skipped} skipped)`);
      }

      console.log(`  ✓ ${inserted} inserted, ${skipped} skipped`);
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

