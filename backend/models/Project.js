import mongoose, { Schema as MongooseSchema } from 'mongoose';
const projectSchema = new MongooseSchema({
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
}, { timestamps: true });
projectSchema.index({ status: 1, createdAt: 1 });
export default mongoose.model('Project', projectSchema, 'yaksha_faq_projects');
