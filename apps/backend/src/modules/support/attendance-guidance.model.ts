import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

/**
 * AttendanceGuidance — DEPRECATED as of v1.68. Replaced by
 * `SupportCategory` (see models/SupportCategory.ts). Kept in
 * the codebase for one release so existing reads don't break;
 * no new code should write to it.
 *
 * The migration path: if any controllers / scripts still
 * reference this model, redirect them to SupportCategory and
 * delete this file on the next major version.
 *
 * @deprecated since v1.68 — use `SupportCategory` instead.
 */
export interface IAttendanceGuidance extends Document {
  issueType: string;
  steps: string[];
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const attendanceGuidanceSchema = new MongooseSchema<IAttendanceGuidance>(
  {
    issueType: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 60,
    },
    steps:     { type: [String], default: [] },
    updatedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

export default mongoose.model<IAttendanceGuidance>(
  'AttendanceGuidance',
  attendanceGuidanceSchema,
  'yaksha_faq_attendance_guidance',
);
