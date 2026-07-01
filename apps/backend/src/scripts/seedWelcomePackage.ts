import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Project from '../modules/admin/project.model.js';
import Orientation from '../modules/program/orientation.model.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is required');
  process.exit(1);
}

const initialProjects = [
  {
    name: 'MARK Attendance',
    description: 'Attendance management system project successfully completed.',
    status: 'completed',
    progress: 100,
    problemStatement: 'Tracking attendance was manual, error-prone, and slow.',
    solution: 'Automated biometric and geo-fenced attendance tracking system.',
    metrics: 'Reduced tracking time by 85%. 100% adoption rate across 5 departments.',
    lessonsLearned: 'Hardware integration requires significant testing buffers. Geo-fencing is battery intensive on iOS.',
    techStack: ['React Native', 'Node.js', 'PostgreSQL', 'Redis'],
    milestones: [
      { name: 'Requirements Gathering', completed: true },
      { name: 'Core Backend API', completed: true },
      { name: 'Mobile App Beta', completed: true },
      { name: 'Production Launch', completed: true }
    ],
    teamInsights: {
      size: 6,
      contributors: 12,
      lead: 'Jane Doe',
      lastUpdate: new Date('2025-11-01')
    }
  },
  {
    name: 'CSFAQ',
    description: 'AI-powered FAQ platform currently being developed by the team.',
    status: 'current',
    progress: 75,
    problemStatement: 'Students repeatedly asked the same questions. Information was scattered. Response times were slow.',
    solution: 'AI-powered FAQ platform with semantic search and intelligent retrieval.',
    techStack: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'OpenAI', 'Vector DB'],
    milestones: [
      { name: 'Requirements complete', completed: true },
      { name: 'Design complete', completed: true },
      { name: 'Core backend complete', completed: true },
      { name: 'User testing', completed: false },
      { name: 'Production deployment', completed: false }
    ],
    teamInsights: {
      size: 4,
      contributors: 8,
      lead: 'John Smith',
      lastUpdate: new Date()
    }
  },
  {
    name: 'AjraSakha',
    description: 'Future project planned after CSFAQ completion.',
    status: 'upcoming',
    progress: 0,
    vision: 'A unified platform for all departmental resources and scheduling.',
    problemStatement: 'Resource scheduling is currently managed across 5 disjointed systems.',
    plannedFeatures: [
      'Universal search',
      'AI scheduling assistant',
      'Resource utilization analytics',
      'Integration with existing LMS'
    ],
    techStack: ['Next.js', 'GraphQL', 'Prisma', 'MongoDB'],
    milestones: [
      { name: 'Project Kickoff', completed: false },
      { name: 'Architecture Design', completed: false },
      { name: 'MVP Development', completed: false }
    ]
  }
];

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI as string);
    console.log('Connected to MongoDB.');

    await Project.deleteMany({});
    console.log('Cleared existing projects.');

    await Project.insertMany(initialProjects);
    console.log('Seeded initial projects.');

    // Optionally add a dummy orientation if none exists
    const orientationCount = await Orientation.countDocuments();
    if (orientationCount === 0) {
      await Orientation.create({
        title: 'Welcome to the Organization',
        description: 'An overview of our culture, workflow, and expectations.',
        videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4', // sample video URL
        transcript: `[00:00] Welcome to the organization! This is the orientation video.
[00:05] Here is how the contribution process works:
[00:08] First, you find an issue to work on.
[00:12] Then, you fork the repository and make your changes.
[00:16] After that, you submit a pull request.
[00:20] Pull requests are reviewed by the core maintainers.
[00:25] During onboarding, you are expected to read the guidelines and complete your first task.
[00:30] If you need help, please ask in the #help channel on our community platform.`
      });
      console.log('Seeded dummy orientation.');
    }

    console.log('Seeding complete.');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

seed();
