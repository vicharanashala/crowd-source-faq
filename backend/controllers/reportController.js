const Report = require("../models/Report");
const Question = require("../models/Question");
const Answer = require("../models/Answer");

const createReport = async (req, res, next) => {
  try {
    const { target, type, reason } = req.body;
    const reporter = req.user._id;

    if (!target || !type || !reason) {
      return res.status(400).json({
        success: false,
        error: { message: "target, type, and reason are required" },
      });
    }

    if (!["question", "answer"].includes(type)) {
      return res.status(400).json({
        success: false,
        error: { message: "Type must be either 'question' or 'answer'" },
      });
    }

    const validReasons = ["Spam / promotional", "Misinformation", "Duplicate", "Off-topic", "Low quality"];
    if (!validReasons.includes(reason)) {
      return res.status(400).json({
        success: false,
        error: { message: "Invalid report reason" },
      });
    }

    let targetExists = false;
    if (type === "question") {
      targetExists = await Question.exists({ _id: target });
    } else {
      targetExists = await Answer.exists({ _id: target });
    }

    if (!targetExists) {
      return res.status(404).json({
        success: false,
        error: { message: `Report target ${type} not found` },
      });
    }

    const report = await Report.create({
      target,
      type,
      reason,
      reporter,
      status: "pending",
    });

    return res.status(201).json({
      success: true,
      data: { report },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { createReport };
