const mongoose = require("mongoose");

const EMBEDDING_DIMENSIONS = 3072;

const questionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 8,
      maxlength: 180,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 5000,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tags: {
      type: [String],
      default: [],
      index: true,
    },
    embedding: {
      type: [Number],
      default: [],
      validate: {
        validator(value) {
          return value.length === 0 || value.length === EMBEDDING_DIMENSIONS;
        },
        message: `Question embedding must contain ${EMBEDDING_DIMENSIONS} dimensions`,
      },
    },
    duplicateOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Question",
      default: null,
      index: true,
    },
    acceptedAnswerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Answer",
      default: null,
      index: true,
    },
    upvoteCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    downvoteCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    views: {
      type: Number,
      default: 0,
      min: 0,
    },
    slug: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    excerpt: {
      type: String,
      trim: true,
    },
    duplicateScore: {
      type: Number,
      default: null,
      min: 0,
      max: 1,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "answered",
        "verified",
        "resolved",
        "duplicate",
        "closed",
      ],
      default: "pending",
      index: true,
    },
    category: {
      type: String,
      trim: true,
      index: true,
    },
    upvotedBy: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
      select: false,
    },
    downvotedBy: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound index for the default feed sort (newest first) + status filtering
questionSchema.index({ status: 1, _id: -1 });

// Compound index for tag filtering + newest sort
questionSchema.index({ tags: 1, _id: -1 });

// Kept from original for cursor-based pagination
questionSchema.index({ createdAt: -1, _id: -1 });

// Vote-based sorting support
questionSchema.index({ upvoteCount: -1, _id: -1 });

questionSchema.virtual("answers", {
  ref:          "Answer",
  localField:   "_id",
  foreignField: "question",
});

questionSchema.virtual("comments", {
  ref:          "Comment",
  localField:   "_id",
  foreignField: "parentId",
  match:        { parentType: "Question" },
});

module.exports = mongoose.model("Question", questionSchema);
