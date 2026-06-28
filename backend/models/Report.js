const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    target: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["question", "answer"],
      index: true,
    },
    reason: {
      type: String,
      required: true,
      enum: ["Spam / promotional", "Misinformation", "Duplicate", "Off-topic", "Low quality"],
      index: true,
    },
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["pending", "approved", "rejected", "resolved"],
      default: "pending",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Report", reportSchema);
