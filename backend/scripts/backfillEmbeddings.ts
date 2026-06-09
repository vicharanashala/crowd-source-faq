/**
 * Regenerate all FAQ and CommunityPost embeddings.
 * Run: npx tsx scripts/backfillEmbeddings.ts
 *
 * IMPORTANT: If you change the model in utils/embeddings.ts,
 * you MUST run this script and update your Atlas vector index numDimensions.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { generateEmbedding } from '../utils/embeddings.js';

const FAQ_COLL = 'yaksha_faq_faqs';
const COMM_COLL = 'yaksha_faq_communityposts';

async function main() {
  if (!process.env.MONGODB_URI) { console.error('MONGODB_URI not set.'); process.exit(1); }
  console.log('Model: Xenova/multi-qa-mpnet-base-dot-v1 (768-dim)');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db!;

  const faqColl = db.collection(FAQ_COLL);
  const commColl = db.collection(COMM_COLL);

  let fp = 0, fe = 0;
  // find().lean() returns a Query that is directly iterable in Mongoose 8
  // Cast to any — db.collection().find() returns FindCursor, not Query; .lean() is on Query
  const faqCursor = faqColl.find<{ _id: mongoose.Types.ObjectId; category: string; question: string; answer: string }>(
    { embedding: { $exists: true, $ne: null } }
  ) as any;
  for await (const faq of faqCursor) {
    try {
      const embedding = await generateEmbedding(`Section: ${faq.category}. Question: ${faq.question}. Answer: ${faq.answer}`);
      await faqColl.updateOne({ _id: faq._id }, { $set: { embedding } });
      fp++;
      process.stdout.write(`\r  FAQs: ${fp}   `);
    } catch (err) {
      fe++;
      console.error(`\n  [backfill] Failed to generate embedding for FAQ ${faq._id}: ${(err as Error).message}`);
    }
  }
  console.log(`\n  ✓ ${fp} FAQs${fe ? `, ${fe} errors` : ''}`);

  let cp = 0, ce = 0;
  const commCursor = commColl.find<{ _id: mongoose.Types.ObjectId; title: string; body: string }>(
    { embedding: { $exists: true, $ne: null } }
  ) as any;
  for await (const post of commCursor) {
    try {
      const embedding = await generateEmbedding(`Question: ${post.title}. Description: ${post.body}`);
      await commColl.updateOne({ _id: post._id }, { $set: { embedding } });
      cp++;
      process.stdout.write(`\r  Posts: ${cp}   `);
    } catch (err) {
      ce++;
      console.error(`\n  [backfill] Failed to generate embedding for Post ${post._id}: ${(err as Error).message}`);
    }
  }
  console.log(`\n  ✓ ${cp} posts${ce ? `, ${ce} errors` : ''}`);

  console.log('\n✅ Backfill complete!');
  await mongoose.disconnect();
  process.exit(fp + cp > 0 ? 0 : 1);
}

main().catch((err) => { console.error((err as Error).message); process.exit(1); });
