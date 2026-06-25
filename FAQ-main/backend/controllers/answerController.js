const Answer = require("../models/Answer");

// Create a new answer for a post
const createAnswer = async (req, res) => {
    try {
        const answer = await Answer.create({
            postId: req.params.id,
            author: req.user.id,
            content: req.body.content
        });

        res.status(201).json(answer);

    } catch (error) {
        res.status(500).json({
            message: error.message
        });
    }
};

const getAnswers = async (req, res) => {
    try {
        const answers = await Answer.find({
            postId: req.params.id
        })
        .populate("author", "name email")
        .sort({ upvotes: -1 });

        res.status(200).json(answers);

    } catch (error) {
        res.status(500).json({
            message: error.message
        });
    }
};

// Upvote an answer
const upvoteAnswer = async (req, res) => {
    try {
        const answer = await Answer.findById(req.params.id);

        if (!answer) {
            return res.status(404).json({
                message: "Answer not found"
            });
        }

        answer.upvotes += 1;

        await answer.save();

        res.status(200).json(answer);

    } catch (error) {
        res.status(500).json({
            message: error.message
        });
    }
};

// Accept an answer
const acceptAnswer = async (req, res) => {
    try {

        const answer = await Answer.findById(req.params.id);

        if (!answer) {
            return res.status(404).json({
                message: "Answer not found"
            });
        }

        answer.isAccepted = true;

        await answer.save();

        res.status(200).json({
            message: "Answer accepted",
            answer
        });

    } catch (error) {
        res.status(500).json({
            message: error.message
        });
    }
};
module.exports = {
    createAnswer,
    getAnswers,
    upvoteAnswer,
    acceptAnswer
};