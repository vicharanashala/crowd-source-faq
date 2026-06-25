const mongoose = require("mongoose");

const commentReplySchema = new mongoose.Schema({
    id: { type: String, required: true },
    authorName: { type: String, required: true },
    authorTitle: { type: String, default: "" },
    authorAvatar: { type: String, default: "" },
    content: { type: String, required: true },
    timestamp: { type: String, default: "Just now" },
    likes: { type: Number, default: 0 },
    likedBy: [{ type: String }],
}, { _id: false });

const commentSchema = new mongoose.Schema({
    id: { type: String, required: true },
    authorName: { type: String, required: true },
    authorTitle: { type: String, default: "" },
    authorAvatar: { type: String, default: "" },
    content: { type: String, required: true },
    timestamp: { type: String, default: "Just now" },
    likes: { type: Number, default: 0 },
    likedBy: [{ type: String }],
    replies: [commentReplySchema],
}, { _id: false });

const bulletPointSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
}, { _id: false });

const structuredApproachSchema = new mongoose.Schema({
    title: { type: String, default: "The Structured Approach" },
    description: { type: String, default: "" },
    bullets: [bulletPointSchema],
    proTip: { type: String, default: "" },
}, { _id: false });

const postSchema = new mongoose.Schema(
    {
        id: {
            type: String,
            unique: true,
            sparse: true,
        },

        title: {
            type: String,
            required: true
        },

        // Original simple description field (backward compatible)
        description: {
            type: String,
            default: ""
        },

        // Rich content fields matching frontend
        intro: {
            type: String,
            default: ""
        },

        structuredApproach: {
            type: structuredApproachSchema,
            default: () => ({})
        },

        category: {
            type: String,
            required: true
        },

        author: {
            type: mongoose.Schema.Types.Mixed,
            required: true,
        },

        timestamp: {
            type: String,
            default: "Just now"
        },

        image: {
            type: String,
            default: ""
        },

        imageAlt: {
            type: String,
            default: ""
        },

        upvotes: {
            type: Number,
            default: 0
        },

        upvotedBy: [{
            type: String,
        }],

        downvotedBy: [{
            type: String,
        }],

        views: {
            type: String,
            default: "1"
        },

        commentsCount: {
            type: Number,
            default: 0
        },

        comments: [commentSchema],

        relatedQuestions: [{
            type: String,
        }],
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Post", postSchema);