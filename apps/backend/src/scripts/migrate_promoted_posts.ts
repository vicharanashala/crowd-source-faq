import mongoose from 'mongoose';
import User from '../modules/auth/user.model.js';

async function run() {
  await mongoose.connect('mongodb://localhost:2884/test');
  console.log('Connected to MongoDB');
  const users = await User.find();
  console.log(`Found ${users.length} users:`);
  for (const u of users) {
    console.log(`- Email: "${u.email}", Role: "${u.role}", Name: "${u.name}"`);
  }
  await mongoose.disconnect();
}

run().catch(console.error);
