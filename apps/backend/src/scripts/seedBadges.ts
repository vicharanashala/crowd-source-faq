import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Badge from '../modules/moderation/badge.model.js';

async function seed() {
  if (!process.env.MONGODB_URI) {
    console.error('ERROR: MONGODB_URI not set.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  if (typeof (Badge as any).seedDefaults === 'function') {
    await (Badge as any).seedDefaults();
    console.log('Badges seeded');
  } else {
    console.warn('Badge.seedDefaults() not found — skipping (Badge model may not have default seeding)');
  }

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => { console.error(err); process.exit(1); });
