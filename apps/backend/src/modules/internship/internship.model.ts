import mongoose, { Schema, Document, Types } from "mongoose";

export type InternshipPhase =
  | "GENERAL"
  | "PHASE_1"
  | "PHASE_2"
  | "PHASE_3"
  | "COMPLETED";

export interface IInternshipProgress extends Document {
  userId: Types.ObjectId;
  currentPhase: InternshipPhase;
  createdAt: Date;
  updatedAt: Date;
}

const InternshipProgressSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    currentPhase: {
      type: String,
      enum: [
        "GENERAL",
        "PHASE_1",
        "PHASE_2",
        "PHASE_3",
        "COMPLETED",
      ],
      default: "GENERAL",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IInternshipProgress>(
  "InternshipProgress",
  InternshipProgressSchema
);
