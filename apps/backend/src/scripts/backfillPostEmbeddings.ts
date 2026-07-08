import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local'), override: true });

import mongoose from 'mongoose';
import { generateEmbedding } from '../utils/ai/embeddings.js';

const COMM_COLL = 'yaksha_faq_communityposts';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set.');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const db = mongoose.connection.db!;

  const commColl = db.collection(COMM_COLL);

  type PostDoc = { _id: mongoose.Types.ObjectId; title: string; body: string };

  console.log('Checking for posts without embeddings...');
  const posts = (await commColl.find<PostDoc>({
    $or: [{ embedding: { $exists: false } }, { embedding: null }],
  }).toArray()) as PostDoc[];

  console.log(`Found ${posts.length} posts needing embeddings.`);

  let cp = 0, ce = 0;
  for (const post of posts) {
    try {
      const embedding = await generateEmbedding(`Question: ${post.title}. Description: ${post.body}`);
      await commColl.updateOne({ _id: post._id }, { $set: { embedding } });
      cp++;
      process.stdout.write(`\r  Progress: ${cp}/${posts.length}   `);
    } catch (err) {
      ce++;
      console.error(`\n  [backfill] Failed to generate embedding for Post ${post._id}: ${(err as Error).message}`);
    }
  }

  console.log(`\n  ✓ ${cp} posts embedded${ce ? `, ${ce} errors` : ''}`);
  console.log('✅ Backfill complete!');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
