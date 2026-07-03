import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type MentorStatus = 'active' | 'archived';

export interface IMentor extends Document {
  // v1.69 — multi-program provisioning: every mentor belongs to
  // exactly one program. `null` is allowed for legacy / pre-feature
  // data; new code paths always set a real ObjectId.
  batchId: Types.ObjectId | null;
  name: string;
  email: string;
  designation?: string;
  bio?: string;
  profilePicture?: string;
  officeHours?: string;
  meetingLink?: string;
  status: MentorStatus;
  createdAt: Date;
  updatedAt: Date;
}

const mentorSchema = new MongooseSchema<IMentor>(
  {
    batchId: { type: MongooseSchema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    designation: { type: String },
    bio: { type: String },
    profilePicture: { type: String },
    officeHours: { type: String },
    meetingLink: { type: String },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
  },
  { timestamps: true }
);

mentorSchema.index({ status: 1 });

export default mongoose.model<IMentor>('Mentor', mentorSchema, 'yaksha_faq_mentors');
