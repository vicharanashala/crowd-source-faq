import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import Category, { slugifyCategoryName } from '../modules/faq/category.model.js';
import FAQ from '../modules/faq/faq.model.js';
import Batch from '../modules/program/batch.model.js';

function cleanHtml(html: string): string {
  let text = html;
  // Replace common tags with readable text or markdown equivalents
  text = text.replace(/<p>/g, '').replace(/<\/p>/g, '\n\n');
  text = text.replace(/<li>/g, '\n- ').replace(/<\/li>/g, '');
  text = text.replace(/<ul>/g, '').replace(/<\/ul>/g, '');
  text = text.replace(/<ol>/g, '').replace(/<\/ol>/g, '');
  text = text.replace(/<strong>/g, '**').replace(/<\/strong>/g, '**');
  text = text.replace(/<code>/g, '`').replace(/<\/code>/g, '`');
  text = text.replace(/<br\s*\/?>/g, '\n');
  
  // Strip any remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');
  
  // Resolve HTML entities
  text = text.replace(/&nbsp;/g, ' ')
             .replace(/&amp;/g, '&')
             .replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>')
             .replace(/&quot;/g, '"')
             .replace(/&#39;/g, "'")
             .replace(/&apos;/g, "'");

  return text.trim();
}

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('ERROR: MONGODB_URI not set');
    process.exit(1);
  }

  const filePath = 'C:\\Users\\Simranjit Kaur\\.gemini\\antigravity\\brain\\c6ec5744-1347-40e4-b6a6-19a68ae6fed8\\.system_generated\\steps\\783\\content.md';
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: HTML file not found at ${filePath}`);
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected!');

    const defaultBatch = await Batch.findOne({ isDefault: true });
    if (!defaultBatch) {
      console.error('ERROR: Default batch not found');
      process.exit(1);
    }
    console.log(`Using batch: "${defaultBatch.name}" (${defaultBatch._id})`);

    const htmlContent = fs.readFileSync(filePath, 'utf-8');

    // Parse the file by splitting at <h2 id="s-
    const sections = htmlContent.split('<h2 id="s-');
    // The first part is the header, discard it
    sections.shift();

    const parsedCategories: Map<string, { name: string; description: string }> = new Map();
    const parsedFaqs: { question: string; answer: string; category: string }[] = [];

    // Ensure Spandan exists
    parsedCategories.set('spandan', {
      name: 'Spandan',
      description: 'Questions and information related to Spandan polls and accounts.'
    });

    // Ensure Attendance exists
    parsedCategories.set('attendance', {
      name: 'Attendance',
      description: 'Questions regarding daily standups, leave policy, and attendance rules.'
    });

    for (const section of sections) {
      // Extract section title
      // Format: 1">1. About the internship <a class="anchor"...
      const titleMatch = section.match(/^\d+">(\d+\.\s+)?([^<]+)/);
      if (!titleMatch) continue;

      let sectionName = titleMatch[2].trim();
      // Remove trailing anchor indicators if any
      sectionName = sectionName.replace(/[\s§]+$/, '');

      // Normalize section name to match seeded names
      if (sectionName === 'Work and projects') {
        sectionName = 'Work, mentorship, and projects';
      }
      if (sectionName === 'Phase 1 — coursework, Vibe LMS, and live sessions') {
        sectionName = 'Phase 1 — coursework, Vibe LMS, and projects';
      }

      const sectionSlug = slugifyCategoryName(sectionName);
      if (!parsedCategories.has(sectionSlug)) {
        parsedCategories.set(sectionSlug, {
          name: sectionName,
          description: `FAQs and topics related to ${sectionName}.`
        });
      }

      // Find details blocks
      const detailsBlocks = section.split('<details class="faq-q"');
      detailsBlocks.shift(); // The first part is before the first details block

      for (const block of detailsBlocks) {
        // Extract summary text (question)
        const summaryStart = block.indexOf('<summary>');
        const summaryEnd = block.indexOf('</summary>');
        if (summaryStart === -1 || summaryEnd === -1) continue;

        const rawQuestion = block.substring(summaryStart + 9, summaryEnd);
        let question = cleanHtml(rawQuestion);
        
        // Remove leading section/question numbers (e.g., "1.1 ", "10.15 ")
        question = question.replace(/^\d+(\.\d+)+\s+/, '');
        // Remove trailing section/anchor markers
        question = question.replace(/[\s§]+$/, '').trim();

        if (!question) {
          console.warn('Warning: Parsed empty question block, skipping:', rawQuestion);
          continue;
        }

        // Extract answer body
        const answerEnd = block.indexOf('</details>');
        if (answerEnd === -1) continue;

        const rawAnswer = block.substring(summaryEnd + 10, answerEnd);
        const answer = cleanHtml(rawAnswer);

        // Decide category: if question or answer talks about Spandan, classify under Spandan
        let finalCategory = sectionName;
        if (question.toLowerCase().includes('spandan') || answer.toLowerCase().includes('spandan')) {
          finalCategory = 'Spandan';
        } else if (
          question.toLowerCase().includes('attendance') ||
          question.toLowerCase().includes('absent') ||
          (question.toLowerCase().includes('leave') && !question.toLowerCase().includes('rosetta')) ||
          (question.toLowerCase().includes('mandatory') && (question.toLowerCase().includes('session') || question.toLowerCase().includes('zoom') || question.toLowerCase().includes('standup') || question.toLowerCase().includes('attendance')))
        ) {
          finalCategory = 'Attendance';
        }

        parsedFaqs.push({
          question,
          answer,
          category: finalCategory
        });
      }
    }

    console.log(`Parsed ${parsedCategories.size} categories and ${parsedFaqs.length} FAQs.`);

    // Clear old data for default batch
    console.log('Clearing database collection data for default batch...');
    await Category.deleteMany({ batchId: defaultBatch._id });
    await FAQ.deleteMany({ batchId: defaultBatch._id });

    // Seed Categories
    const categoryIdMap: Map<string, mongoose.Types.ObjectId> = new Map();
    for (const [slug, info] of parsedCategories.entries()) {
      const catDoc = await Category.create({
        batchId: defaultBatch._id,
        name: info.name,
        slug,
        description: info.description
      });
      categoryIdMap.set(info.name, catDoc._id as mongoose.Types.ObjectId);
      console.log(`Seeded Category: "${info.name}"`);
    }

    // Seed FAQs
    for (const faq of parsedFaqs) {
      const categoryId = categoryIdMap.get(faq.category) || null;
      await FAQ.create({
        question: faq.question,
        answer: faq.answer,
        category: faq.category,
        batchId: defaultBatch._id,
        categoryId,
        status: 'approved',
        reviewStatus: 'verified'
      });
    }

    console.log(`Successfully seeded ${parsedFaqs.length} FAQs into the local database!`);
  } catch (err) {
    console.error('Error during parsing/seeding:', err);
  } finally {
    await mongoose.disconnect();
  }
}

main();
