/**
 * Add a single welcome post to the community board.
 * Run: npx tsx scripts/addPost.ts
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import CommunityPost from '../modules/community/community-post.model.js';
import User from '../modules/auth/user.model.js';

async function addPost() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const author = await User.findOne({ email: 'reg@yaksha.com' }) ?? (await User.findOne());
  if (!author) { console.log('No user found.'); process.exit(1); }

  const post = await CommunityPost.create({
    title: 'Welcome to the Yaksha Community Board! 🎉',
    body: 'Hello everyone! Feel free to ask any internship-related questions here.',
    author: author._id,
    status: 'answered',
    answer: 'Thanks for stopping by! - Admin',
  });

  console.log('Created:', post.title);
  await mongoose.disconnect();
  process.exit(0);
}

addPost().catch((err) => { console.error(err); process.exit(1); });
