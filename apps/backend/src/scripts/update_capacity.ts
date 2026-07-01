import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Project from '../modules/admin/project.model.js';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log('Connected to DB');

  const result = await Project.updateMany(
    { capacity: { $exists: false } },
    { $set: { capacity: 30 } }
  );

  console.log('Update result:', result);
  await mongoose.disconnect();
}

run().catch(console.error);
