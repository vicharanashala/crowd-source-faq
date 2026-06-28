const Comment = require("../models/Comment");
const Question = require("../models/Question");
const Answer = require("../models/Answer");

const createComment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { body, parentType } = req.body;
    const author = req.user._id;

    if (!body || body.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: { message: "Comment body must be at least 2 characters long" },
      });
    }

    if (!["Question", "Answer"].includes(parentType)) {
      return res.status(400).json({
        success: false,
        error: { message: "Invalid parent type" },
      });
    }

    let parentExists = false;
    if (parentType === "Question") {
      parentExists = await Question.exists({ _id: id });
    } else {
      parentExists = await Answer.exists({ _id: id });
    }

    if (!parentExists) {
      return res.status(404).json({
        success: false,
        error: { message: `${parentType} not found` },
      });
    }

    const comment = await Comment.create({
      author,
      body: body.trim(),
      parentType,
      parentId: id,
    });

    const populatedComment = await Comment.findById(comment._id).populate(
      "author",
      "displayName role reputationScore avatar title handle"
    );

    return res.status(201).json({
      success: true,
      data: { comment: populatedComment },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { createComment };
