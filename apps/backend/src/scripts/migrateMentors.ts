import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import Project from '../modules/admin/project.model.js';
import Mentor from '../modules/admin/mentor.model.js';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/yaksha_faq';

async function migrateMentors() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const projects = await Project.find();
    console.log(`Found ${projects.length} projects to check.`);

    let updatedCount = 0;
    let createdMentors = 0;

    for (const project of projects) {
      if (project.mentor) {
        continue;
      }

      if ((project as any).mentorName) {
        let mentor = await Mentor.findOne({ name: (project as any).mentorName });
        
        if (!mentor) {
          mentor = new Mentor({
            name: (project as any).mentorName,
            email: (project as any).mentorEmail || `${(project as any).mentorName.toLowerCase().replace(/[^a-z0-9]/g, '')}@example.com`,
            status: 'active'
          });
          await mentor.save();
          createdMentors++;
          console.log(`Created new mentor: ${mentor.name}`);
        }

        project.mentor = mentor._id;
        await project.save();
        updatedCount++;
        console.log(`Updated project ${project.projectName} with mentor ${mentor.name}`);
      }
    }

    console.log(`Migration complete. Created ${createdMentors} mentors. Updated ${updatedCount} projects.`);
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

migrateMentors();
