import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import mongoose from 'mongoose';
import FAQ from '../modules/faq/faq.model.js';
import { generateEmbedding } from '../utils/ai/embeddings.js';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI not set');
  process.exit(1);
}

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);

    const faqs = await FAQ.find({});
    console.log(`Found ${faqs.length} FAQs to update embeddings for.`);

    console.log('Testing embedding connection...');
    const testConfig = await generateEmbedding('test connection');
    console.log('Test embedding connection successful. Vector shape length:', testConfig.length);

    let updated = 0;
    
    for (let i = 0; i < faqs.length; i++) {
      const faq = faqs[i];
      const textToEmbed = `Section: ${faq.category ?? 'General'}. Question: ${faq.question}. Answer: ${faq.answer}`;
      
      const startTime = Date.now();
      try {
        const embedding = await generateEmbedding(textToEmbed, { batchId: faq.batchId ? faq.batchId.toString() : null });
        faq.embedding = embedding;
        await faq.save();
        updated++;
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`  [${i + 1}/${faqs.length}] Updated FAQ ID ${faq._id} (${duration}s)`);
      } catch (err) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.error(`  [${i + 1}/${faqs.length}] Error updating FAQ ID ${faq._id} (${duration}s):`, (err as Error).message);
      }
    }

    console.log(`Successfully updated embeddings for ${updated}/${faqs.length} FAQs!`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

run();
