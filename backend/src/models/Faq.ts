import mongoose, { Document, Schema } from "mongoose";

export interface IFaq extends Document {
  question: string;
  answer: string;
  category: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const faqSchema = new Schema(
  {
    question: {
      type: String,
      required: true,
      trim: true,
    },

    answer: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      default: "General",
    },

    tags: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
  
);
faqSchema.index({
  question: "text",
  answer: "text",
  category: "text",
});


export default mongoose.model<IFaq>("Faq", faqSchema);