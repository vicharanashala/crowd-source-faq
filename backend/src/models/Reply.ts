import { Schema, model, Document, Types } from "mongoose";

export interface IReply extends Document {
  discussionId: Types.ObjectId;
  authorId: Types.ObjectId | string;
  content: string;
  upvoteCount: number;
  upvotedBy: string[];
  approved: boolean;
  accepted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ReplySchema = new Schema<IReply>(
  {
    discussionId: {
      type: Schema.Types.ObjectId,
      ref: "Discussion",
      required: true,
      index: true,
    },
    authorId: {
      type: Schema.Types.Mixed,
      required: true,
    },
    content: {
      type: String,
      required: [true, "Reply content is required"],
      trim: true,
    },
    upvoteCount: {
      type: Number,
      default: 0,
    },
    // Tracks which users already upvoted, to prevent double-upvoting.
    upvotedBy: {
      type: [String],
      default: [],
    },
    approved: {
      type: Boolean,
      default: false,
    },
    accepted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export default model<IReply>("Reply", ReplySchema);
