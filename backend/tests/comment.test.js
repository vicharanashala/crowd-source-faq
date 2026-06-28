const express = require("express");
const request = require("supertest");

const userId = "507f1f77bcf86cd799439014";
const questionId = "507f1f77bcf86cd799439015";
const answerId = "507f1f77bcf86cd799439016";
const commentId = "507f1f77bcf86cd799439018";

jest.mock("../middleware/authMiddleware", () => ({
  protect: (req, res, next) => {
    req.user = {
      _id: userId,
      role: "student",
    };
    next();
  },
  optionalProtect: (req, res, next) => {
    next();
  },
}));

jest.mock("../models/Question", () => ({
  exists: jest.fn(),
  findOne: jest.fn(),
}));

jest.mock("../models/Answer", () => ({
  exists: jest.fn(),
}));

jest.mock("../models/Comment", () => ({
  create: jest.fn(),
  findById: jest.fn(),
}));

const Question = require("../models/Question");
const Answer = require("../models/Answer");
const Comment = require("../models/Comment");
const questionRoutes = require("../routes/questionRoutes");
const answerRoutes = require("../routes/answerRoutes");
const { errorHandler } = require("../middleware/errorHandler");

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/questions", questionRoutes);
  app.use("/api/v1/answers", answerRoutes);
  app.use(errorHandler);
  return app;
};

describe("Comment API", () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createTestApp();
  });

  it("adds a comment to a question", async () => {
    Question.exists.mockResolvedValue(true);
    Comment.create.mockResolvedValue({
      _id: commentId,
      body: "Test question comment",
      parentType: "Question",
      parentId: questionId,
      author: userId,
    });
    Comment.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue({
        _id: commentId,
        body: "Test question comment",
        parentType: "Question",
        parentId: questionId,
        author: { _id: userId, displayName: "Test User" },
      }),
    });

    const res = await request(app)
      .post(`/api/v1/questions/${questionId}/comments`)
      .send({ body: "Test question comment", parentType: "Question" });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.comment.body).toBe("Test question comment");
    expect(Question.exists).toHaveBeenCalledWith({ _id: questionId });
  });

  it("adds a comment to an answer", async () => {
    Answer.exists.mockResolvedValue(true);
    Comment.create.mockResolvedValue({
      _id: commentId,
      body: "Test answer comment",
      parentType: "Answer",
      parentId: answerId,
      author: userId,
    });
    Comment.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue({
        _id: commentId,
        body: "Test answer comment",
        parentType: "Answer",
        parentId: answerId,
        author: { _id: userId, displayName: "Test User" },
      }),
    });

    const res = await request(app)
      .post(`/api/v1/answers/${answerId}/comments`)
      .send({ body: "Test answer comment", parentType: "Answer" });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.comment.body).toBe("Test answer comment");
    expect(Answer.exists).toHaveBeenCalledWith({ _id: answerId });
  });

  it("fails if parent does not exist", async () => {
    Question.exists.mockResolvedValue(false);

    const res = await request(app)
      .post(`/api/v1/questions/${questionId}/comments`)
      .send({ body: "Test question comment", parentType: "Question" });

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain("Question not found");
  });
});
