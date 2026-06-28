const mongoose = require("mongoose");

const Answer = require("../models/Answer");
const Question = require("../models/Question");
const User = require("../models/User");
const Report = require("../models/Report");

const VALID_QUESTION_STATUSES = [
  "pending",
  "answered",
  "verified",
  "resolved",
  "duplicate",
  "closed",
];
const VALID_USER_ROLES = ["student", "moderator", "admin"];

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);
const idsEqual = (left, right) =>
  left !== null &&
  left !== undefined &&
  right !== null &&
  right !== undefined &&
  String(left) === String(right);

const emitAdminEvent = (req, event, payload, room) => {
  const io = req.app.get("io");
  if (!io) {
    return;
  }

  if (room) {
    io.to(room).emit(event, payload);
    return;
  }

  io.emit(event, payload);
};

const getQuestionLifecycleStatus = async (questionId) => {
  const acceptedAnswer = await Answer.findOne({ question: questionId, isAccepted: true });
  if (acceptedAnswer) {
    return {
      status: "resolved",
      acceptedAnswerId: acceptedAnswer._id,
    };
  }

  const answerCount = await Answer.countDocuments({ question: questionId });
  return {
    status: answerCount > 0 ? "answered" : "pending",
    acceptedAnswerId: null,
  };
};

const buildRegexSearch = (value) => ({
  $regex: String(value).trim(),
  $options: "i",
});

const getAdminStats = async (req, res, next) => {
  try {
    const [
      totalUsers,
      totalQuestions,
      totalAnswers,
      totalOfficialAnswers,
      totalPendingReports,
      userRoleBreakdown,
      questionStatusBreakdown,
    ] = await Promise.all([
      User.countDocuments({}),
      Question.countDocuments({}),
      Answer.countDocuments({}),
      Answer.countDocuments({ isOfficial: true }),
      Report.countDocuments({ status: "pending" }),
      User.aggregate([
        { $group: { _id: "$role", count: { $sum: 1 } } },
      ]),
      Question.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totals: {
          users: totalUsers,
          questions: totalQuestions,
          answers: totalAnswers,
          officialAnswers: totalOfficialAnswers,
          pendingReports: totalPendingReports,
        },
        usersByRole: userRoleBreakdown.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        questionsByStatus: questionStatusBreakdown.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    return next(error);
  }
};

const getAdminUsers = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.role && VALID_USER_ROLES.includes(req.query.role)) {
      filter.role = req.query.role;
    }

    if (req.query.search) {
      filter.$or = [
        { displayName: buildRegexSearch(req.query.search) },
        { email: buildRegexSearch(req.query.search) },
      ];
    }

    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        users,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const updateUserRole = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: {
          message: "User id must be a valid MongoDB ObjectId",
        },
      });
    }

    if (!VALID_USER_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        error: {
          message: "Role must be one of: student, moderator, admin",
        },
      });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { role },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          message: "User not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        user,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const getAdminQuestions = async (req, res, next) => {
  try {
    const filter = {};

    if (req.query.status && VALID_QUESTION_STATUSES.includes(req.query.status)) {
      filter.status = req.query.status;
    }

    if (req.query.tag) {
      filter.tags = String(req.query.tag).trim().toLowerCase();
    }

    if (req.query.search) {
      filter.$or = [
        { title: buildRegexSearch(req.query.search) },
        { body: buildRegexSearch(req.query.search) },
      ];
    }

    const questions = await Question.find(filter)
      .select("-embedding")
      .sort({ createdAt: -1 })
      .populate("author", "displayName email role reputationScore")
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        questions,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const updateQuestionStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: {
          message: "Question id must be a valid MongoDB ObjectId",
        },
      });
    }

    if (!VALID_QUESTION_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: {
          message:
            "Status must be one of: pending, answered, verified, resolved, duplicate, closed",
        },
      });
    }

    const question = await Question.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    )
      .select("-embedding")
      .populate("author", "displayName email role reputationScore");

    if (!question) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Question not found",
        },
      });
    }

    emitAdminEvent(
      req,
      "question_status_updated",
      {
        questionId: question._id,
        status: question.status,
      },
      `question_${question._id}`
    );

    return res.status(200).json({
      success: true,
      data: {
        question,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const deleteQuestion = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: {
          message: "Question id must be a valid MongoDB ObjectId",
        },
      });
    }

    const question = await Question.findById(id);
    if (!question) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Question not found",
        },
      });
    }

    await Answer.deleteMany({ question: id });
    await question.deleteOne();

    emitAdminEvent(
      req,
      "question_status_updated",
      {
        questionId: id,
        status: "deleted",
      },
      `question_${id}`
    );

    return res.status(200).json({
      success: true,
      data: {
        questionId: id,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const getAdminAnswers = async (req, res, next) => {
  try {
    const filter = {};

    if (req.query.official === "true") {
      filter.isOfficial = true;
    } else if (req.query.official === "false") {
      filter.isOfficial = false;
    }

    if (req.query.accepted === "true") {
      filter.isAccepted = true;
    } else if (req.query.accepted === "false") {
      filter.isAccepted = false;
    }

    if (req.query.questionId && isValidObjectId(req.query.questionId)) {
      filter.question = req.query.questionId;
    }

    if (req.query.search) {
      filter.body = buildRegexSearch(req.query.search);
    }

    const answers = await Answer.find(filter)
      .sort({ createdAt: -1 })
      .populate("author", "displayName email role reputationScore")
      .populate("question", "title status")
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        answers,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const updateAnswerOfficialStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const shouldBeOfficial =
      req.body.isOfficial === undefined ? true : Boolean(req.body.isOfficial);

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: {
          message: "Answer id must be a valid MongoDB ObjectId",
        },
      });
    }

    const answer = await Answer.findById(id);
    if (!answer) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Answer not found",
        },
      });
    }

    const question = await Question.findById(answer.question);
    if (!question) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Question not found",
        },
      });
    }

    answer.isOfficial = shouldBeOfficial;

    if (shouldBeOfficial) {
      await Answer.updateMany(
        { question: answer.question, _id: { $ne: answer._id } },
        { $set: { isAccepted: false } }
      );
      answer.isAccepted = true;
      question.status = "resolved";
      question.acceptedAnswerId = answer._id;
    } else if (answer.isAccepted && idsEqual(question.acceptedAnswerId, answer._id)) {
      const lifecycle = await getQuestionLifecycleStatus(question._id);
      answer.isAccepted = false;
      question.status = lifecycle.status;
      question.acceptedAnswerId = lifecycle.acceptedAnswerId;
    }

    await answer.save();
    await question.save();

    const populatedAnswer = await Answer.findById(answer._id)
      .populate("author", "displayName email role reputationScore")
      .populate("question", "title status");

    if (shouldBeOfficial) {
      emitAdminEvent(
        req,
        "official_answer_created",
        populatedAnswer,
        `question_${question._id}`
      );
    }

    emitAdminEvent(
      req,
      "question_status_updated",
      {
        questionId: question._id,
        status: question.status,
      },
      `question_${question._id}`
    );

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
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: {
          message: "Answer id must be a valid MongoDB ObjectId",
        },
      });
    }

    const answer = await Answer.findById(id);
    if (!answer) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Answer not found",
        },
      });
    }

    const question = await Question.findById(answer.question);
    await answer.deleteOne();

    if (question && idsEqual(question.acceptedAnswerId, answer._id)) {
      const lifecycle = await getQuestionLifecycleStatus(question._id);
      question.status = lifecycle.status;
      question.acceptedAnswerId = lifecycle.acceptedAnswerId;
      await question.save();

      emitAdminEvent(
        req,
        "question_status_updated",
        {
          questionId: question._id,
          status: question.status,
        },
        `question_${question._id}`
      );
    }

    return res.status(200).json({
      success: true,
      data: {
        answerId: id,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const getAdminReports = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const reports = await Report.find(filter)
      .populate("reporter", "displayName email role avatar")
      .sort({ createdAt: -1 })
      .lean();

    const populatedReports = await Promise.all(
      reports.map(async (report) => {
        let targetDoc = null;
        if (report.type === "question") {
          targetDoc = await Question.findById(report.target)
            .select("title slug body")
            .lean();
        } else if (report.type === "answer") {
          targetDoc = await Answer.findById(report.target)
            .select("body question")
            .populate("question", "title slug")
            .lean();
        }
        return {
          ...report,
          targetDetail: targetDoc,
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: {
        reports: populatedReports,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const updateReportStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: {
          message: "Report id must be a valid MongoDB ObjectId",
        },
      });
    }

    const validStatuses = ["pending", "approved", "rejected", "resolved"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: {
          message: "Status must be one of: pending, approved, rejected, resolved",
        },
      });
    }

    const report = await Report.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    ).populate("reporter", "displayName email role avatar");

    if (!report) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Report not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        report,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAdminStats,
  getAdminUsers,
  updateUserRole,
  getAdminQuestions,
  updateQuestionStatus,
  deleteQuestion,
  getAdminAnswers,
  updateAnswerOfficialStatus,
  deleteAnswer,
  getAdminReports,
  updateReportStatus,
};
