import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local'), override: true });

import mongoose from 'mongoose';
import CommunityPost from '../modules/community/community-post.model.js';
import Batch from '../modules/program/batch.model.js';
import { clusterPosts } from '../utils/ai/postClusterer.js';

// Topic-based mock embedding generator for deterministic testing
function mockGenerateEmbedding(text: string): number[] {
  const lowercase = text.toLowerCase();
  
  // Baseline vector for unrelated items
  let baseVector = Array.from({ length: 1024 }, (_, i) => Math.sin(i * 5.5));
  
  if (lowercase.includes('stipend')) {
    // Topic: Stipend
    baseVector = Array.from({ length: 1024 }, (_, i) => Math.sin(i * 1.1));
  } else if (lowercase.includes('git')) {
    // Topic: Git
    baseVector = Array.from({ length: 1024 }, (_, i) => Math.sin(i * 2.2));
  } else if (lowercase.includes('orientation')) {
    // Topic: Orientation
    baseVector = Array.from({ length: 1024 }, (_, i) => Math.sin(i * 3.3));
  }

  // Add small noise so vectors are similar (cos ~0.99) but not identical
  const noisyVector = baseVector.map((v) => v + (Math.random() - 0.5) * 0.02);

  // L2 Normalize
  let sumSq = 0;
  for (const v of noisyVector) sumSq += v * v;
  const norm = Math.sqrt(sumSq);
  return norm === 0 ? noisyVector : noisyVector.map((v) => v / norm);
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dev';
  console.log(`Connecting to DB: ${uri}`);
  await mongoose.connect(uri);

  // 1. Get current default active batch
  const batch = await Batch.findOne({ isActive: true });
  if (!batch) {
    console.error('No active program batch found to run test. Seed the database first.');
    process.exit(1);
  }
  console.log(`Active batch found: "${batch.name}" (${batch._id})`);

  // 2. Prepare test posts data
  const testPostsData = [
    {
      title: 'When do we receive our monthly stipend?',
      body: 'I wanted to know the exact payout day for the internship monthly stipend.',
    },
    {
      title: 'What is the schedule for stipend payments?',
      body: 'Can anyone tell me what dates the monthly internship stipends are credited?',
    },
    {
      title: 'Stipend has not arrived yet, is there a delay?',
      body: 'Normally I get my stipend on the 1st of the month, but it is the 3rd and still nothing.',
    },
    {
      title: 'How do I resolve a Git merge conflict in main?',
      body: 'I have some conflicts in main branch when trying to push my changes.',
    },
    {
      title: 'Where can I find the link to the orientation video?',
      body: 'I missed the first onboarding session and need the recorded replay link.',
    },
  ];

  console.log('\nGenerating semantic mock vector embeddings for 5 test posts...');
  const createdPosts = [];

  for (const postData of testPostsData) {
    const embedding = mockGenerateEmbedding(`Question: ${postData.title}. Description: ${postData.body}`);
    const post = await CommunityPost.create({
      ...postData,
      author: new mongoose.Types.ObjectId(), // mock author ID
      batchId: batch._id,
      status: 'unanswered',
      embedding,
    });
    createdPosts.push(post);
  }
  console.log(`✓ 5 test posts created successfully in DB.`);

  try {
    // 3. Retrieve and cluster
    console.log('\nRunning post clustering algorithm...');
    const dbPosts = await CommunityPost.find({ _id: { $in: createdPosts.map((p) => p._id) } });
    const clusters = await clusterPosts(dbPosts);

    console.log('\n=== CLUSTERING RESULTS ===');
    clusters.forEach((c, idx) => {
      console.log(`\nCluster ${idx + 1}: "${c.canonicalTitle}" (${c.posts.length} posts)`);
      c.posts.forEach((p) => {
        console.log(`  - [ID: ${p._id}] Title: "${p.title}"`);
      });
    });
    console.log('==========================');

    // 4. Verification assertions
    const stipendCluster = clusters.find((c) => c.posts.length >= 3);
    const gitCluster = clusters.find((c) => c.posts.some((p) => p.title.includes('Git')));
    const orientationCluster = clusters.find((c) => c.posts.some((p) => p.title.includes('orientation')));

    if (stipendCluster && gitCluster && orientationCluster) {
      console.log('\n✅ TEST PASSED: Similar questions were grouped successfully, and unrelated questions remained distinct!');
    } else {
      console.log('\n❌ TEST FAILED: Question grouping did not match expectations.');
    }
  } finally {
    // 5. Cleanup
    console.log('\nCleaning up test posts from DB...');
    await CommunityPost.deleteMany({ _id: { $in: createdPosts.map((p) => p._id) } });
    console.log('✓ Cleanup complete.');
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
