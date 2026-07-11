import { Schema, model, Document, Types } from "mongoose";

export interface IInternalNote {
  text: string;
  createdAt: Date;
}

export interface IEscalation extends Document {
  title: string;
  description: string;
  category: string;
  priority: "Low" | "Medium" | "High";
  status: "Pending" | "In Progress" | "Resolved" | "Closed";
  submittedBy: Types.ObjectId | string;
  assignedTo?: Types.ObjectId | string | null;
  attachments: string[];
  notes: IInternalNote[];
  resolutionNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const InternalNoteSchema = new Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const EscalationSchema = new Schema<IEscalation>(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: 200,
    },

    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
    },

    category: {
      type: String,
      required: true,
      default: "General",
    },

    priority: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "Medium",
    },

    status: {
      type: String,
      enum: ["Pending", "In Progress", "Resolved", "Closed"],
      default: "Pending",
    },

    submittedBy: {
      type: Schema.Types.Mixed,
      required: true,
    },

    assignedTo: {
      type: Schema.Types.Mixed,
      default: null,
    },

    attachments: {
      type: [String],
      default: [],
    },

    notes: {
      type: [InternalNoteSchema],
      default: [],
    },

    resolutionNotes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

export default model<IEscalation>("Escalation", EscalationSchema);