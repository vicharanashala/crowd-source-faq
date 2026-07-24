import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

/**
 * CategoryAssignmentLog — singleton-per-batch audit record for the
 * `/recategorize` Discord admin command.
 *
 * Why a model and not just a config field: each batch has its own
 * cooldown, and we want to track WHO triggered the run + WHAT
 * changed (assignments made, FAQs touched). The doc is upserted
 * on every successful run.
 *
 * The 2-day cooldown is enforced in the trigger handler, not here.
 * This model just stores the data needed to compute "time since last run".
 */

export type RecategorizeSource = 'discord' | 'cli' | 'manual-script';

export interface ICategoryAssignmentLog extends Document {
  batchId: Types.ObjectId;
  lastRunAt: Date;
  triggeredBy: string;          // Discord user ID, CLI arg, etc.
  source: RecategorizeSource;
  faqsExamined: number;
  faqsReassigned: number;
  categoriesUsed: string[];     // final list of category names after assignment
  /** Any categories created mid-run (so the admin can audit what was added). */
  categoriesCreated: string[];
  /** Free-form notes — failure summary, partial success, etc. */
  notes?: string;
}

const categoryAssignmentLogSchema = new MongooseSchema<ICategoryAssignmentLog>(
  {
    batchId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'Batch',
      required: true,
      index: true,
    },
    lastRunAt: { type: Date, required: true, default: () => new Date() },
    triggeredBy: { type: String, required: true, maxlength: 100 },
    source: {
      type: String,
      enum: ['discord', 'cli', 'manual-script'],
      required: true,
    },
    faqsExamined: { type: Number, required: true, default: 0 },
    faqsReassigned: { type: Number, required: true, default: 0 },
    categoriesUsed: { type: [String], default: [] },
    categoriesCreated: { type: [String], default: [] },
    notes: { type: String, maxlength: 2000 },
  },
  { timestamps: true },
);

// One log doc per batch — upsert pattern in the trigger handler
categoryAssignmentLogSchema.index({ batchId: 1 }, { unique: true });

export default mongoose.model<ICategoryAssignmentLog>(
  'CategoryAssignmentLog',
  categoryAssignmentLogSchema,
  'yaksha_category_assignment_log',
);