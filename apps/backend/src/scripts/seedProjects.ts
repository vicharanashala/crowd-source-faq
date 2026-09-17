import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import MatchProject from '../modules/project/project.model.js';
import { projectSeedData } from '../data/projects.seed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// src/scripts → apps/backend
const backendRoot = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(backendRoot, '.env') });
dotenv.config({ path: path.join(backendRoot, '.env.local') });

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri || typeof uri !== 'string') {
    console.error(
      `MONGODB_URI is missing. Looked in:\n  ${path.join(backendRoot, '.env')}\n  ${path.join(backendRoot, '.env.local')}`,
    );
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log('Connected to DB');

    await MatchProject.deleteMany({});
    console.log('Cleared intern_match_projects');

    await MatchProject.insertMany(projectSeedData);
    console.log(`Seeded ${projectSeedData.length} match projects`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error seeding projects', error);
    process.exit(1);
  }
}

seed();
