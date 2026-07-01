import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ProjectStatus = 'active' | 'inactive' | 'archived';

export interface IProject extends Document {
  // v1.69 — multi-program provisioning: every project belongs to
  // exactly one program. `null` is allowed for legacy / pre-feature
  // data; new code paths always set a real ObjectId.
  batchId: Types.ObjectId | null;
  projectName: string;
  description: string;
  mentorName?: string;
  mentorEmail?: string;
  mentor?: Types.ObjectId | any; // ref to Mentor model
  order: number;
  status: ProjectStatus;
  resources: string[]; // URLs or links
  skills: string[]; // e.g. React, Node.js
  
  // Rich Discovery Fields
  problemStatement?: string;
  whyMatters?: string;
  outcomes?: string;
  difficulty?: 'Beginner Friendly' | 'Intermediate' | 'Advanced';
  weeklyCommitment?: string;
  techStack?: string[];
  deliverables?: string[];
  teamSize?: string;
  capacity: number;
  
  createdAt: Date;
  updatedAt: Date;
}

const projectSchema = new MongooseSchema<IProject>(
  {
    batchId: { type: MongooseSchema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    projectName: { type: String, required: true },
    description: { type: String, required: true },
    mentorName: { type: String },
    mentorEmail: { type: String },
    mentor: { type: MongooseSchema.Types.ObjectId, ref: 'Mentor' },
    order: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'inactive', 'archived'], default: 'active' },
    resources: [{ type: String }],
    skills: [{ type: String }],
    
    // Rich Discovery Fields
    problemStatement: { type: String },
    whyMatters: { type: String },
    outcomes: { type: String },
    difficulty: { type: String, enum: ['Beginner Friendly', 'Intermediate', 'Advanced'] },
    weeklyCommitment: { type: String },
    techStack: [{ type: String }],
    deliverables: [{ type: String }],
    teamSize: { type: String },
    capacity: { type: Number, default: 30 }
  },
  { timestamps: true }
);

projectSchema.index({ status: 1, createdAt: 1 });

export default mongoose.model<IProject>('Project', projectSchema, 'yaksha_faq_projects');
