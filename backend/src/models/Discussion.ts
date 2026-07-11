import { Schema, model, Document, Types } from "mongoose";

export interface IDiscussion extends Document {
  title: string;
  description: string;
  category: string;
  tags: string[];
  authorId: Types.ObjectId | string;
  acceptedReplyId?: Types.ObjectId | null;
  flagged: boolean;
  promotedToFaq: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DiscussionSchema = new Schema<IDiscussion>(
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
      enum: ["General", "Technical", "Account", "Billing", "Other"],
      default: "General",
    },
    tags: {
      type: [String],
      default: [],
    },
    // Kept as a loose string/ObjectId reference since a dedicated User module
    // is outside the scope of this Discussion Forum build.
    authorId: {
      type: Schema.Types.Mixed,
      required: true,
    },
    acceptedReplyId: {
      type: Schema.Types.ObjectId,
      ref: "Reply",
      default: null,
    },
    flagged: {
      type: Boolean,
      default: false,
    },
    promotedToFaq: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

DiscussionSchema.index({ title: "text", description: "text", tags: "text" });

export default model<IDiscussion>("Discussion", DiscussionSchema);
