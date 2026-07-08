/**
 * Seed sample community posts with embeddings.
 * Run: npx tsx scripts/seedPosts.ts [--keep]
 *
 * Usage:
 *   npx tsx scripts/seedPosts.ts          → interactive (asks before clearing)
 *   npx tsx scripts/seedPosts.ts --keep  → skips clearing, only inserts
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import CommunityPost from '../modules/community/community-post.model.js';
import User from '../modules/auth/user.model.js';
import { generateEmbedding } from '../utils/ai/embeddings.js';
import readline from 'readline';

interface SamplePost { title: string; body: string; status: string; answer: string | null; }

const samplePosts: SamplePost[] = [
  { title: 'Do I need to attend all team standups?', body: 'My team has daily standups at 9 AM but my timezone makes it hard. Is attendance strictly mandatory?', status: 'answered', answer: 'Standups are generally expected unless you have a prior arrangement with your manager.' },
  { title: 'Is daily standup attendance mandatory?', body: 'I have daily meetings at 9 AM but I have a class conflict. Can I skip standups?', status: 'unanswered', answer: null },
  { title: 'When do we receive our monthly stipend?', body: 'I wanted to know the exact payout day for the internship monthly stipend.', status: 'answered', answer: 'Stipends are processed on the 30th of each month.' },
  { title: 'What is the schedule for stipend payments?', body: 'Can anyone tell me what dates the monthly internship stipends are credited?', status: 'unanswered', answer: null },
  { title: 'How do I resolve a Git merge conflict in main?', body: 'I have some conflicts in main branch when trying to push my changes.', status: 'unanswered', answer: null },
];

function ask(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question + ' ', (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() !== 'n');
    });
  });
}

async function seedPosts() {
  if (!process.env.MONGODB_URI) {
    console.error('ERROR: MONGODB_URI not set.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const author = await User.findOne({ email: 'reg@yaksha.com' }) ?? (await User.findOne());
  if (!author) { console.error('No user found. Run seed.ts first.'); process.exit(1); }

  if (!process.argv.includes('--keep')) {
    const count = await CommunityPost.countDocuments();
    if (count > 0) {
      console.log(`WARNING: Will delete ${count} existing posts. Use --keep to skip clearing.`);
      const confirmed = await ask('Proceed with clearing existing posts? (Y/n)');
      if (!confirmed) { console.log('Aborted.'); await mongoose.disconnect(); process.exit(0); }
      await CommunityPost.deleteMany({});
      console.log('Cleared existing posts.');
    }
  }

  let inserted = 0;
  for (const post of samplePosts) {
    try {
      const embedding = await generateEmbedding(`Question: ${post.title}. Description: ${post.body}. Answer: ${post.answer ?? ''}`);
      await CommunityPost.create({ ...post, author: author._id, embedding });
      inserted++;
      console.log(`  + ${post.title}`);
    } catch (err) {
      console.error(`  ✗ Failed: ${post.title} — ${(err as Error).message}`);
    }
  }

  console.log(`\n✅ Inserted ${inserted}/${samplePosts.length} posts.`);
  await mongoose.disconnect();
  process.exit(inserted > 0 ? 0 : 1);
}

seedPosts().catch((err) => { console.error(err); process.exit(1); });
