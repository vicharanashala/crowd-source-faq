const cookieParser = require("cookie-parser");
const express = require("express");
const mongoose = require("mongoose");
const request = require("supertest");

const authorId = "507f1f77bcf86cd799439011";
const otherUserId = "507f1f77bcf86cd799439012";
const moderatorId = "507f1f77bcf86cd799439013";
const questionId = "507f1f77bcf86cd799439014";
const secondQuestionId = "507f1f77bcf86cd799439015";

jest.mock("../middleware/authMiddleware", () => ({
  protect: (req, res, next) => {
    req.user = {
      _id: req.headers["x-user-id"] || authorId,
      role: req.headers["x-user-role"] || "student",
    };
    next();
  },
  optionalProtect: (req, res, next) => {
    next();
  },
}));

jest.mock("../services/aiService", () => ({
  generateEmbedding: jest.fn().mockResolvedValue([]),
  generateProvisionalDraft: jest.fn().mockResolvedValue("Draft answer"),
}));

jest.mock("../models/Answer", () => ({
  create: jest.fn(),
}));

jest.mock("../models/Question", () => ({
  aggregate: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

const Question = require("../models/Question");
const questionRoutes = require("../routes/questionRoutes");
const { errorHandler } = require("../middleware/errorHandler");

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/v1/questions", questionRoutes);
  app.use(errorHandler);
  return app;
};

const buildQuestion = (overrides = {}) => ({
  _id: questionId,
  title: "How do I register for courses?",
  body: "I need help understanding the course registration flow.",
  author: authorId,
  tags: ["registration"],
  status: "pending",
  save: jest.fn().mockResolvedValue(undefined),
  toObject() {
    return {
      _id: this._id,
      title: this.title,
      body: this.body,
      author: this.author,
      tags: this.tags,
      status: this.status,
      embedding: [0.1],
    };
  },
  ...overrides,
});

describe("Question API", () => {
  let app;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    jest.clearAllMocks();
    app = createTestApp();
  });

  it("lists questions with filters, required sorting, and stable pagination metadata", async () => {
    const firstQuestion = {
      _id: new mongoose.Types.ObjectId(questionId),
      title: "Registration help",
      status: "answered",
      upvoteCount: 10,
      answerCount: 3,
    };
    const secondQuestion = {
      _id: new mongoose.Types.ObjectId(secondQuestionId),
      title: "Another registration question",
      status: "answered",
      upvoteCount: 4,
      answerCount: 1,
    };

    Question.aggregate.mockResolvedValue([firstQuestion, secondQuestion]);

    const res = await request(app).get("/api/v1/questions").query({
      status: "answered",
      search: "registration",
      sort: "popular",
      limit: 1,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.questions).toHaveLength(1);
    expect(res.body.data.pagination).toEqual({
      limit: 1,
      count: 1,
      sort: "popular",
      nextCursor: expect.any(String),
      hasMore: true,
    });

    const pipeline = Question.aggregate.mock.calls[0][0];
    expect(pipeline[0]).toEqual({
      $match: {
        status: "answered",
        $or: [
          { title: { $regex: "registration", $options: "i" } },
          { body: { $regex: "registration", $options: "i" } },
        ],
      },
    });
    expect(pipeline).toContainEqual({ $sort: { upvoteCount: -1, _id: -1 } });
    expect(pipeline).toContainEqual({ $limit: 2 });
  });

  it("counts answers in aggregation without loading every answer document", async () => {
    Question.aggregate.mockResolvedValue([]);

    const res = await request(app)
      .get("/api/v1/questions")
      .query({ sort: "answered" });

    expect(res.statusCode).toBe(200);

    const pipeline = Question.aggregate.mock.calls[0][0];
    const answerLookup = pipeline.find(
      (stage) => stage.$lookup && stage.$lookup.from === "answers"
    );

    expect(answerLookup.$lookup).toEqual({
      from: "answers",
      let: { questionId: "$_id" },
      pipeline: [
        { $match: { $expr: { $eq: ["$question", "$$questionId"] } } },
        { $count: "count" },
      ],
      as: "_answerStats",
    });
    expect(pipeline).toContainEqual({ $sort: { answerCount: -1, _id: -1 } });
  });

  it("applies an opaque cursor consistently for answer-count sorting", async () => {
    Question.aggregate
      .mockResolvedValueOnce([
        {
          _id: new mongoose.Types.ObjectId(questionId),
          answerCount: 2,
        },
        {
          _id: new mongoose.Types.ObjectId(secondQuestionId),
          answerCount: 0,
        },
      ])
      .mockResolvedValueOnce([]);

    const firstRes = await request(app)
      .get("/api/v1/questions")
      .query({ sort: "unanswered", limit: 1 });

    const secondRes = await request(app).get("/api/v1/questions").query({
      sort: "unanswered",
      limit: 1,
      cursor: firstRes.body.data.pagination.nextCursor,
    });

    expect(secondRes.statusCode).toBe(200);

    const secondPipeline = Question.aggregate.mock.calls[1][0];
    expect(secondPipeline).toContainEqual({
      $match: {
        $or: [
          { answerCount: { $gt: 2 } },
          {
            answerCount: 2,
            _id: { $lt: new mongoose.Types.ObjectId(questionId) },
          },
        ],
      },
    });
  });

  it("lets a moderator edit another user's question", async () => {
    const question = buildQuestion({ author: otherUserId });
    Question.findById.mockResolvedValue(question);

    const res = await request(app)
      .patch(`/api/v1/questions/${questionId}`)
      .set("x-user-id", moderatorId)
      .set("x-user-role", "moderator")
      .send({ tags: ["Admissions", "Help"] });

    expect(res.statusCode).toBe(200);
    expect(question.tags).toEqual(["admissions", "help"]);
    expect(question.save).toHaveBeenCalled();
    expect(res.body.data.question.embedding).toBeUndefined();
  });

  it("lets a moderator close another user's question using soft delete", async () => {
    const question = buildQuestion({ author: otherUserId });
    Question.findById.mockResolvedValue(question);

    const res = await request(app)
      .delete(`/api/v1/questions/${questionId}`)
      .set("x-user-id", moderatorId)
      .set("x-user-role", "moderator");

    expect(res.statusCode).toBe(200);
    expect(question.status).toBe("closed");
    expect(question.save).toHaveBeenCalled();
    expect(res.body.data.message).toBe("Question closed successfully");
  });

  it("rejects closing by users who are not the author or staff", async () => {
    const question = buildQuestion({ author: otherUserId });
    Question.findById.mockResolvedValue(question);

    const res = await request(app)
      .delete(`/api/v1/questions/${questionId}`)
      .set("x-user-id", authorId)
      .set("x-user-role", "student");

    expect(res.statusCode).toBe(403);
    expect(question.save).not.toHaveBeenCalled();
  });
});
