import 'dotenv/config';
import mongoose from 'mongoose';
import FAQ from '../models/FAQ.js';
import CommunityPost from '../models/CommunityPost.js';
import { generateEmbedding } from '../utils/embeddings.js';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('Connected to MongoDB');

  const faqs = await FAQ.find({ embedding: { $exists: true, $ne: null }, status: 'approved' })
    .select('_id question')
    .lean()
    .limit(5);
  console.log(`\nFAQs with embeddings: ${faqs.length}`);
  for (const f of faqs) {
    console.log(`  - "${f.question.slice(0, 60)}" | emb len: ${f.embedding?.length}`);
  }

  const posts = await CommunityPost.find().select('_id title body').lean().limit(3);
  console.log(`\nCommunity posts: ${posts.length}`);
  for (const p of posts) {
    console.log(`  - "${p.title.slice(0, 60)}"`);
  }

  // Test embedding generation
  console.log('\nTesting embedding generation...');
  const emb = await generateEmbedding('offer letter');
  console.log(`Query "offer letter" → embedding length: ${emb.length}`);

  // Check a FAQ with lean(false) to see raw field type
  const fRaw = await FAQ.findOne({ status: 'approved', embedding: { $exists: true } });
  console.log('\nRaw FAQ (lean=false):');
  console.log('  type:', typeof fRaw?.embedding);
  console.log('  is array:', Array.isArray(fRaw?.embedding));
  console.log('  len:', (fRaw?.embedding as any)?.length);
  console.log('  first 3:', (fRaw?.embedding as any)?.slice(0, 3));

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch(console.error);