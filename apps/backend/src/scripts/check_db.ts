import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

// Load connection URI from backend/.env
const envPath = path.join(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const match = envContent.match(/^MONGODB_URI=(.*)$/m);
const MONGODB_URI = match ? match[1].trim() : '';

console.log('Connecting to database:', MONGODB_URI);

const faqSchema = new mongoose.Schema({}, { strict: false });
const FAQ = mongoose.model('FAQ', faqSchema, 'yaksha_faq_faqs');

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected!');

  const counts = await FAQ.aggregate([
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  console.log('=== FAQS BY CATEGORY ===');
  for (const c of counts) {
    console.log(`- Category: "${c._id}", Count: ${c.count}`);
  }

  await mongoose.disconnect();
}

run().catch(console.error);
