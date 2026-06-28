const mongoose = require("mongoose");

const Answer = require("../models/Answer");
const Question = require("../models/Question");
const User = require("../models/User");

const ACCEPTED_ANSWER_REPUTATION = 25;
const UPVOTE_REPUTATION = 1;

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const idsEqual = (left, right) => {
  if (!left || !right) {
    return false;
  }

  return String(left) === String(right);
};

const isModeratorOrAdmin = (user) =>
  user?.role === "moderator" || user?.role === "admin";

const canManageAnswer = (user, answer) =>
  idsEqual(user?._id, answer.author) || isModeratorOrAdmin(user);

const canAcceptAnswer = (user, question) =>
  idsEqual(user?._id, question.author) || isModeratorOrAdmin(user);

const emitAnswerEvent = (req, questionId, event, payload) => {
  const io = req.app.get("io");
  if (io) {
    io.to(`question_${questionId}`).emit(event, payload);
  }
};

const getAnswerById = async (id, options = {}) => {
  if (!isValidObjectId(id)) {
    const error = new Error("Answer id must be a valid MongoDB ObjectId");
    error.statusCode = 400;
    throw error;
  }

  const answer = options.includeVotes
    ? await Answer.findById(id).select("+upvotedBy +downvotedBy")
    : await Answer.findById(id);
  if (!answer) {
    const error = new Error("Answer not found");
    error.statusCode = 404;
    throw error;
  }

  return answer;
};

const getQuestionById = async (id) => {
  if (!isValidObjectId(id)) {
    const error = new Error("questionId must be a valid MongoDB ObjectId");
    error.statusCode = 400;
    throw error;
  }

  const question = await Question.findById(id);
  if (!question) {
    const error = new Error("Question not found");
    error.statusCode = 404;
    throw error;
  }

  return question;
};

const populateAnswer = (id) =>
  Answer.findById(id).populate("author", "displayName role reputationScore");

const createAnswer = async (req, res, next) => {
  try {
    const { questionId, body } = req.body;
    const trimmedBody = String(body || "").trim();

    if (!questionId || !trimmedBody) {
      return res.status(400).json({
        success: false,
        error: {
          message: "questionId and body are required",
        },
      });
    }

    const question = await getQuestionById(questionId);
    if (question.status === "closed") {
      return res.status(400).json({
        success: false,
        error: {
          message: "Cannot answer a closed question",
        },
      });
    }

    const answer = await Answer.create({
      question: questionId,
      author: req.user._id,
      body: trimmedBody,
      aiGenerated: false,
    });

    if (question.status === "pending") {
      question.status = "answered";
      await question.save();
    }

    const populatedAnswer = await populateAnswer(answer._id);
    emitAnswerEvent(req, questionId, "answer:created", populatedAnswer);

    return res.status(201).json({
      success: true,
      data: {
        answer: populatedAnswer,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const editAnswer = async (req, res, next) => {
  try {
    const answer = await getAnswerById(req.params.id);

    if (!canManageAnswer(req.user, answer)) {
      return res.status(403).json({
        success: false,
        error: {
          message: "Not authorized to edit this answer",
        },
      });
    }

    const trimmedBody = String(req.body.body || "").trim();
    if (!trimmedBody) {
      return res.status(400).json({
        success: false,
        error: {
          message: "body is required",
        },
      });
    }

    answer.body = trimmedBody;
    await answer.save();

    const populatedAnswer = await populateAnswer(answer._id);
    emitAnswerEvent(req, answer.question, "answer:updated", populatedAnswer);

    return res.status(200).json({
      success: true,
      data: {
        answer: populatedAnswer,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const deleteAnswer = async (req, res, next) => {
  try {
    const answer = await getAnswerById(req.params.id);

    if (!canManageAnswer(req.user, answer)) {
      return res.status(403).json({
        success: false,
        error: {
          message: "Not authorized to delete this answer",
        },
      });
    }

    const wasAccepted = answer.isAccepted;
    const questionId = answer.question;
    await answer.deleteOne();

    if (wasAccepted) {
      const remainingAnswerCount = await Answer.countDocuments({
        question: questionId,
      });

      await Question.findByIdAndUpdate(
        questionId,
        {
          $set: {
            acceptedAnswerId: null,
            status: remainingAnswerCount > 0 ? "answered" : "pending",
          },
        },
        { runValidators: true }
      );
    }

    emitAnswerEvent(req, questionId, "answer:deleted", {
      answerId: req.params.id,
      questionId,
    });

    return res.status(200).json({
      success: true,
      data: {
        answerId: req.params.id,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const acceptAnswer = async (req, res, next) => {
  try {
    const answer = await getAnswerById(req.params.id);
    const question = await getQuestionById(answer.question);

    if (!canAcceptAnswer(req.user, question)) {
      return res.status(403).json({
        success: false,
        error: {
          message: "Not authorized to accept an answer for this question",
        },
      });
    }

    if (question.status === "closed") {
      return res.status(400).json({
        success: false,
        error: {
          message: "Cannot accept an answer for a closed question",
        },
      });
    }

    const wasAccepted = answer.isAccepted;
    await Answer.updateMany(
      { question: answer.question, _id: { $ne: answer._id } },
      { $set: { isAccepted: false } }
    );

    answer.isAccepted = true;
    await answer.save();

    question.status = "resolved";
    question.acceptedAnswerId = answer._id;
    await question.save();

    if (!wasAccepted && answer.author) {
      await User.findByIdAndUpdate(answer.author, {
        $inc: { reputationScore: ACCEPTED_ANSWER_REPUTATION },
      });
    }

    emitAnswerEvent(req, answer.question, "answer:accepted", answer);

    return res.status(200).json({
      success: true,
      data: {
        answer,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const hasUserVoted = (votes = [], userId) =>
  votes.some((voteUserId) => idsEqual(voteUserId, userId));

const ensureVoteArray = (answer, field) => {
  if (!Array.isArray(answer[field])) {
    answer[field] = [];
  }

  return answer[field];
};

const addVote = (answer, field, userId) => {
  const votes = ensureVoteArray(answer, field);
  if (typeof votes.addToSet === "function") {
    votes.addToSet(userId);
    return;
  }

  if (!hasUserVoted(votes, userId)) {
    votes.push(userId);
  }
};

const pullVote = (answer, field, userId) => {
  const votes = ensureVoteArray(answer, field);
  if (typeof votes.pull === "function") {
    votes.pull(userId);
    return;
  }

  answer[field] = votes.filter((voteUserId) => !idsEqual(voteUserId, userId));
};

const voteAnswer = async (req, res, next) => {
  try {
    const { type } = req.body;
    const voterId = req.user._id;

    if (!["up", "down"].includes(type)) {
      return res.status(400).json({
        success: false,
        error: {
          message: "Vote type must be either 'up' or 'down'",
        },
      });
    }

    const answer = await getAnswerById(req.params.id, { includeVotes: true });
    const hasUpvoted = hasUserVoted(ensureVoteArray(answer, "upvotedBy"), voterId);
    const hasDownvoted = hasUserVoted(
      ensureVoteArray(answer, "downvotedBy"),
      voterId
    );

    if ((type === "up" && hasUpvoted) || (type === "down" && hasDownvoted)) {
      return res.status(400).json({
        success: false,
        error: {
          message: "User has already cast this vote",
        },
      });
    }

    let reputationDelta = 0;
    if (type === "up") {
      addVote(answer, "upvotedBy", voterId);
      answer.upvoteCount += 1;

      if (hasDownvoted) {
        pullVote(answer, "downvotedBy", voterId);
        answer.downvoteCount = Math.max(answer.downvoteCount - 1, 0);
      }

      reputationDelta = UPVOTE_REPUTATION;
    } else {
      addVote(answer, "downvotedBy", voterId);
      answer.downvoteCount += 1;

      if (hasUpvoted) {
        pullVote(answer, "upvotedBy", voterId);
        answer.upvoteCount = Math.max(answer.upvoteCount - 1, 0);
        reputationDelta = -UPVOTE_REPUTATION;
      }
    }

    await answer.save();

    if (reputationDelta !== 0 && answer.author) {
      await User.findByIdAndUpdate(answer.author, {
        $inc: { reputationScore: reputationDelta },
      });
    }

    emitAnswerEvent(req, answer.question, "answer:voted", answer);

    return res.status(200).json({
      success: true,
      data: {
        answer,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const createOfficialAnswer = async (req, res, next) => {
  try {
    if (!isModeratorOrAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        error: {
          message: "Official answers require moderator or admin access",
        },
      });
    }

    const { questionId, body } = req.body;
    const trimmedBody = String(body || "").trim();

    if (!questionId || !trimmedBody) {
      return res.status(400).json({
        success: false,
        error: {
          message: "questionId and body are required",
        },
      });
    }

    const question = await getQuestionById(questionId);
    if (question.status === "closed") {
      return res.status(400).json({
        success: false,
        error: {
          message: "Cannot create an official answer for a closed question",
        },
      });
    }

    await Answer.updateMany(
      { question: questionId },
      { $set: { isAccepted: false } }
    );

    const answer = await Answer.create({
      question: questionId,
      author: req.user._id,
      body: trimmedBody,
      aiGenerated: false,
      isAccepted: true,
      isOfficial: true,
    });

    question.status = "resolved";
    question.acceptedAnswerId = answer._id;
    await question.save();

    const populatedAnswer = await populateAnswer(answer._id);
    emitAnswerEvent(req, questionId, "answer:official_created", populatedAnswer);

    return res.status(201).json({
      success: true,
      data: {
        answer: populatedAnswer,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createAnswer,
  editAnswer,
  deleteAnswer,
  acceptAnswer,
  voteAnswer,
  createOfficialAnswer,
};
