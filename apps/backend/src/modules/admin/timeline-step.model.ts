import mongoose, { Document, Schema as MongooseSchema } from 'mongoose';

export type CompletionType = 'checklist' | 'manual' | 'automatic';

export interface IChecklistItem {
  label: string;
  order: number;
  isMandatory: boolean;
}

export interface IStepResource {
  title: string;
  url: string;
  type: 'link' | 'pdf' | 'video' | 'github' | 'doc' | 'discord';
}

export interface ITimelineStep extends Document {
  title: string;
  description: string;
  icon: string;
  order: number;
  isMandatory: boolean;
  isLocked: boolean;
  status: 'active' | 'inactive';
  dependencies: mongoose.Types.ObjectId[];
  completionType: CompletionType;
  estimatedTime?: string;
  rewards?: string;
  mentorNotes?: string;
  resources: IStepResource[];
  checklistItems: IChecklistItem[];
  // v1.69 — multi-program provisioning: every timeline step belongs
  // to exactly one program. `null` is allowed for legacy / pre-feature
  // data; new code paths always set a real ObjectId.
  batchId: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const checklistItemSchema = new MongooseSchema<IChecklistItem>(
  {
    label: { type: String, required: true },
    order: { type: Number, default: 0 },
    isMandatory: { type: Boolean, default: false },
  },
  { _id: true }
);

const stepResourceSchema = new MongooseSchema<IStepResource>(
  {
    title: { type: String, required: true },
    url: { type: String, required: true },
    type: { type: String, enum: ['link', 'pdf', 'video', 'github', 'doc', 'discord'], default: 'link' },
  },
  { _id: true }
);

const timelineStepSchema = new MongooseSchema<ITimelineStep>(
  {
    title: { type: String, required: true },
    description: { type: String, default: '' },
    icon: { type: String, default: 'document' },
    order: { type: Number, default: 0 },
    isMandatory: { type: Boolean, default: true },
    isLocked: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    dependencies: [{ type: MongooseSchema.Types.ObjectId, ref: 'TimelineStep' }],
    completionType: { type: String, enum: ['checklist', 'manual', 'automatic'], default: 'manual' },
    estimatedTime: { type: String },
    rewards: { type: String },
    mentorNotes: { type: String },
    resources: [stepResourceSchema],
    checklistItems: [checklistItemSchema],
    batchId: { type: MongooseSchema.Types.ObjectId, ref: 'Batch', default: null, index: true },
  },
  { timestamps: true }
);

timelineStepSchema.index({ status: 1, order: 1 });

export default mongoose.model<ITimelineStep>('TimelineStep', timelineStepSchema, 'yaksha_faq_timeline_steps');
