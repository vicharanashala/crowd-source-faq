const mongoose = require("mongoose");

const answerSchema = new mongoose.Schema(
{
    postId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Post",
        required: true
    },

    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },

    content: {
        type: String,
        required: true
    },

    isAI: {
        type: Boolean,
        default: false
    },

    isAccepted: {
    type: Boolean,
    default: false
    },
    
    upvotes: {
        type: Number,
        default: 0
    }
},
{
    timestamps: true
}
);

module.exports = mongoose.model("Answer", answerSchema);