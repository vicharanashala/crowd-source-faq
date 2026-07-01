import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Project from '../modules/admin/project.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const PROJECTS = [
  { projectName: 'AjraSakha', mentorName: 'Dr. Aaloo', description: 'AjraSakha project' },
  { projectName: 'PyBe', mentorName: 'Dr. Chicken', description: 'PyBe project' },
  { projectName: 'ViBe', mentorName: 'Dr. Pyaaz', description: 'ViBe project' },
  { projectName: 'Tenali', mentorName: 'Dr. Biryani', description: 'Tenali project' },
  { projectName: 'Spandan', mentorName: 'Dr. Elaichi', description: 'Spandan project' },
  { projectName: 'Spurthi', mentorName: 'Dr. Pepper', description: 'Spurthi project' },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log('Connected to DB');

    // Wipe existing
    await Project.deleteMany({});
    console.log('Cleared existing projects');

    // Insert new
    for (const p of PROJECTS) {
      await Project.create({
        ...p,
        status: 'active',
        resources: []
      });
    }

    console.log('Projects seeded successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding projects', error);
    process.exit(1);
  }
}

seed();
