const mongoose = require("mongoose");

const faqSchema = new mongoose.Schema(
{
    question: {
        type: String,
        required: true
    },

    answer: {
        type: String,
        required: true
    },

    category: {
        type: String,
        default: "General"
    },

    tags: [{
        type: String
    }],

    source: {
        type: String,
        default: "IIT Ropar FAQ"
    }
},
{
    timestamps: true
});

module.exports = mongoose.model("FAQ", faqSchema);