import mongoose from 'mongoose';
import { evaluateDuplicates } from '../modules/community/post-duplicate.controller.js';
import 'dotenv/config';

// Inject active mongo uri
process.env.MONGODB_URI = 'mongodb://127.0.0.1:2884/yaksha_faq';

async function test() {
  console.log('Connecting to database...');
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('Connected!');

  const faqs = await FAQ.find({});
  console.log(`FAQs count in DB: ${faqs.length}`);
  faqs.forEach(f => {
    console.log(`- ID: ${f._id}, Category: ${f.category}, Question: "${f.question}", Status: "${f.status}", BatchId: ${f.batchId}`);
  });

  const q = 'attendance is attendance mandetory for every session';
  console.log(`Running evaluateDuplicates for: "${q}"`);
  
  const matches = await evaluateDuplicates(q, null);
  console.log('Matches returned:', JSON.stringify(matches, null, 2));

  await mongoose.disconnect();
}

test().catch(console.error);
