const mongoose = require("mongoose");

const directQuestionSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true },
    context: { type: String, default: "" },
    askedBy: {
      id: { type: String, default: "" },
      name: { type: String, default: "Anonymous" },
      email: { type: String, default: "" },
    },
    source: {
      type: String,
      enum: ["faq_search", "ai_chat", "manual"],
      default: "manual",
    },
    originalQuery: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "answered", "dismissed"],
      default: "pending",
    },
    answer: { type: String, default: "" },
    answeredBy: { type: String, default: "" },
    answeredAt: { type: Date, default: null },
    convertedToFaqId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FAQ",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DirectQuestion", directQuestionSchema);
