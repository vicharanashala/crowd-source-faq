import 'dotenv/config';
import mongoose from 'mongoose';
import Category, { slugifyCategoryName } from '../modules/faq/category.model.js';
import FAQ from '../modules/faq/faq.model.js';
import Batch from '../modules/program/batch.model.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateEmbedding } from '../utils/ai/embeddings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const categoryNames = [
  'ViBe Platform',
  'Team Formation',
  'Phase 1 — coursework, Vibe LMS, and projects',
  'Rosetta — your internship journal',
  'Spurti Points',
  'NOC (No Objection Certificate)',
  'Selection, offer letter, and certificate',
  'Work, mentorship, and projects',
  'About the internship',
  'Timing and dates',
  'Certificate',
  'Yaksha Chat Related',
  'Code of conduct — communication channels',
  'Interviews Related',
  'Community',
  'Attendance'
];

function mapToOfficialCategory(faq: any): string {
  const sec = (faq.section || '').toLowerCase();
  const q = (faq.question || '').toLowerCase();

  // section 10 contains a mix of coursework (ViBe) and live standups (Attendance)
  if (sec.includes('phase 1')) {
    if (q.includes('attendance') || q.includes('zoom id') || q.includes('standup') || q.includes('live session') || q.includes('participation')) {
      return 'Attendance';
    }
    if (q.includes('vibe') || q.includes('course')) {
      return 'ViBe Platform';
    }
    return 'Phase 1 — coursework, Vibe LMS, and projects';
  }

  if (sec.includes('work and projects')) {
    return 'Work, mentorship, and projects';
  }

  if (sec.includes('about the internship')) return 'About the internship';
  if (sec.includes('timing and dates')) return 'Timing and dates';
  if (sec.includes('noc') || sec.includes('no objection')) return 'NOC (No Objection Certificate)';
  if (sec.includes('selection, offer letter')) return 'Selection, offer letter, and certificate';
  if (sec.includes('code of conduct')) return 'Code of conduct — communication channels';
  if (sec.includes('interview')) return 'Interviews Related';
  if (sec.includes('certificate')) return 'Certificate';
  if (sec.includes('rosetta')) return 'Rosetta — your internship journal';
  if (sec.includes('spurti points')) return 'Spurti Points';
  if (sec.includes('yaksha chat')) return 'Yaksha Chat Related';
  if (sec.includes('vibe platform')) return 'ViBe Platform';
  if (sec.includes('team formation')) return 'Team Formation';
  if (sec.includes('spurti levels') || sec.includes('trophy league')) return 'Spurti Points';
  
  return 'About the internship';
}

async function seedCategories() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('ERROR: MONGODB_URI not set in env');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB!');

    // Get the default batch
    const defaultBatch = await Batch.findOne({ isDefault: true });
    if (!defaultBatch) {
      console.error('Error: Default batch not found in database. Run the server first.');
      process.exit(1);
    }
    console.log(`Found default batch: "${defaultBatch.name}" (${defaultBatch._id})`);

    // Clear old categories and FAQs associated with this batch
    console.log('Clearing old categories and FAQs for default batch...');
    await Category.deleteMany({ batchId: defaultBatch._id });
    await FAQ.deleteMany({ batchId: defaultBatch._id });

    // Read scraped FAQs
    const faqPath = path.join(__dirname, '..', 'faqs.json');
    let scrapedFaqs: any[] = [];
    try {
      const faqDataRaw = await fs.readFile(faqPath, 'utf-8');
      const parsed = JSON.parse(faqDataRaw) as any;
      scrapedFaqs = Array.isArray(parsed) ? parsed : (parsed.faqs || []);
      console.log(`Loaded ${scrapedFaqs.length} FAQs from faqs.json`);
    } catch (e) {
      console.log('No scraped FAQs found, seeding placeholders only.');
    }

    // Seed new categories
    const categoryDocMap = new Map<string, any>();
    for (const name of categoryNames) {
      const slug = slugifyCategoryName(name);
      const categoryDoc = await Category.create({
        batchId: defaultBatch._id,
        name,
        slug,
        description: `FAQs and topics related to ${name}.`
      });
      categoryDocMap.set(name, categoryDoc);
    }
    console.log(`Seeded ${categoryNames.length} categories.`);

    // Distribute FAQs
    let inserted = 0;
    const seededCategories = new Set<string>();

    for (const faq of scrapedFaqs) {
      const officialCat = mapToOfficialCategory(faq);
      const categoryDoc = categoryDocMap.get(officialCat);
      if (!categoryDoc) continue;

      const embedding = await generateEmbedding(`Section: ${officialCat}. Question: ${faq.question}. Answer: ${faq.answer}`);
      await FAQ.create({
        question: faq.question,
        answer: faq.answer,
        category: officialCat,
        batchId: defaultBatch._id,
        categoryId: categoryDoc._id,
        embedding,
        status: 'approved',
        reviewStatus: 'verified'
      });
      inserted++;
      seededCategories.add(officialCat);
    }
    console.log(`Seeded ${inserted} FAQs.`);

    // Seed placeholders for any empty categories so they still render
    for (const name of categoryNames) {
      if (!seededCategories.has(name)) {
        const categoryDoc = categoryDocMap.get(name);
        await FAQ.create({
          question: `Placeholder question for ${name}`,
          answer: `This is a placeholder answer for the category: ${name}. You can edit or replace this question in the Admin dashboard.`,
          category: name,
          batchId: defaultBatch._id,
          categoryId: categoryDoc?._id,
          status: 'approved',
          reviewStatus: 'verified'
        });
        console.log(`Seeded placeholder FAQ for empty category: ${name}`);
      }
    }

    console.log('\nSeeding custom categories and FAQs completed successfully!');
  } catch (err) {
    console.error('Error seeding categories:', err);
  } finally {
    await mongoose.disconnect();
  }
}

seedCategories();
