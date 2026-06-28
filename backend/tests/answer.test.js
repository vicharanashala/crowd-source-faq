const cookieParser = require("cookie-parser");
const express = require("express");
const request = require("supertest");

const userId = "507f1f77bcf86cd799439011";
const otherUserId = "507f1f77bcf86cd799439012";
const adminId = "507f1f77bcf86cd799439013";
const questionId = "507f1f77bcf86cd799439014";
const answerId = "507f1f77bcf86cd799439015";

jest.mock("../middleware/authMiddleware", () => ({
  protect: (req, res, next) => {
    req.user = {
      _id: req.headers["x-user-id"] || userId,
      role: req.headers["x-user-role"] || "student",
    };
    next();
  },
}));

jest.mock("../models/Answer", () => ({
  create: jest.fn(),
  findById: jest.fn(),
  updateMany: jest.fn(),
  countDocuments: jest.fn(),
}));

jest.mock("../models/Question", () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

jest.mock("../models/User", () => ({
  findByIdAndUpdate: jest.fn(),
}));

const Answer = require("../models/Answer");
const Question = require("../models/Question");
const User = require("../models/User");
const answerRoutes = require("../routes/answerRoutes");
const { errorHandler } = require("../middleware/errorHandler");

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req, res, next) => {
    req.app.set("io", {
      to: jest.fn().mockReturnValue({
        emit: jest.fn(),
      }),
    });
    next();
  });
  app.use("/api/v1/answers", answerRoutes);
  app.use(errorHandler);
  return app;
};

const buildVoteArray = (items = []) => {
  const votes = [...items];
  votes.addToSet = (value) => {
    if (!votes.some((item) => String(item) === String(value))) {
      votes.push(value);
    }
  };
  votes.pull = (value) => {
    const index = votes.findIndex((item) => String(item) === String(value));
    if (index !== -1) {
      votes.splice(index, 1);
    }
  };
  return votes;
};

const buildAnswer = (overrides = {}) => ({
  _id: answerId,
  question: questionId,
  author: otherUserId,
  body: "Existing answer",
  isAccepted: false,
  isOfficial: false,
  upvoteCount: 0,
  downvoteCount: 0,
  upvotedBy: buildVoteArray(),
  downvotedBy: buildVoteArray(),
  save: jest.fn().mockResolvedValue(undefined),
  deleteOne: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const buildQuestion = (overrides = {}) => ({
  _id: questionId,
  author: userId,
  status: "answered",
  acceptedAnswerId: null,
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe("Answer API", () => {
  let app;

  beforeEach(() => {
    process.env.NODE_ENV = "development";
    jest.resetAllMocks();
    app = createTestApp();
  });

  it("returns 400 for an invalid vote type", async () => {
    const res = await request(app)
      .post(`/api/v1/answers/${answerId}/vote`)
      .send({ type: "sideways" });

    expect(res.statusCode).toBe(400);
    expect(res.body.error.message).toContain("Vote type");
  });

  it("prevents duplicate votes", async () => {
    const answer = buildAnswer({
      upvotedBy: buildVoteArray([userId]),
    });
    Answer.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(answer),
    });

    const res = await request(app)
      .post(`/api/v1/answers/${answerId}/vote`)
      .send({ type: "up" });

    expect(res.statusCode).toBe(400);
    expect(res.body.error.message).toContain("already");
  });

  it("upvotes an answer and increments author reputation", async () => {
    const answer = buildAnswer();
    Answer.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(answer),
    });

    const res = await request(app)
      .post(`/api/v1/answers/${answerId}/vote`)
      .send({ type: "up" });

    expect(res.statusCode).toBe(200);
    expect(answer.upvoteCount).toBe(1);
    expect(answer.save).toHaveBeenCalled();
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(otherUserId, {
      $inc: { reputationScore: 1 },
    });
  });

  it("requires moderator or admin role for official answers", async () => {
    const res = await request(app)
      .post("/api/v1/answers/official/create")
      .send({ questionId, body: "Official answer" });

    expect(res.statusCode).toBe(403);
    expect(Answer.create).not.toHaveBeenCalled();
  });

  it("creates an official answer and unsets older accepted answers", async () => {
    const question = buildQuestion();
    const answer = buildAnswer({
      author: adminId,
      isAccepted: true,
      isOfficial: true,
    });
    Question.findById.mockResolvedValue(question);
    Answer.updateMany.mockResolvedValue({ modifiedCount: 1 });
    Answer.create.mockResolvedValue(answer);
    Answer.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(answer),
    });

    const res = await request(app)
      .post("/api/v1/answers/official/create")
      .set("x-user-id", adminId)
      .set("x-user-role", "admin")
      .send({ questionId, body: "Official answer" });

    expect(res.statusCode).toBe(201);
    expect(Answer.updateMany).toHaveBeenCalledWith(
      { question: questionId },
      { $set: { isAccepted: false } }
    );
    expect(Answer.create).toHaveBeenCalledWith({
      question: questionId,
      author: adminId,
      body: "Official answer",
      aiGenerated: false,
      isAccepted: true,
      isOfficial: true,
    });
    expect(question.status).toBe("resolved");
    expect(question.acceptedAnswerId).toBe(answerId);
  });

  it("only lets the question author, moderator, or admin accept an answer", async () => {
    const answer = buildAnswer();
    const question = buildQuestion({ author: otherUserId });
    Answer.findById.mockResolvedValue(answer);
    Question.findById.mockResolvedValue(question);

    const res = await request(app).patch(`/api/v1/answers/${answerId}/accept`);

    expect(res.statusCode).toBe(403);
    expect(Answer.updateMany).not.toHaveBeenCalled();
  });

  it("accepts one answer and updates question status and reputation", async () => {
    const answer = buildAnswer();
    const question = buildQuestion({ author: userId });
    Answer.findById.mockResolvedValue(answer);
    Question.findById.mockResolvedValue(question);
    Answer.updateMany.mockResolvedValue({ modifiedCount: 1 });

    const res = await request(app).patch(`/api/v1/answers/${answerId}/accept`);

    expect(res.statusCode).toBe(200);
    expect(Answer.updateMany).toHaveBeenCalledWith(
      { question: questionId, _id: { $ne: answerId } },
      { $set: { isAccepted: false } }
    );
    expect(answer.isAccepted).toBe(true);
    expect(question.status).toBe("resolved");
    expect(question.acceptedAnswerId).toBe(answerId);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(otherUserId, {
      $inc: { reputationScore: 25 },
    });
  });

  it("lets answer author edit and delete their answer", async () => {
    const answer = buildAnswer({ author: userId });
    Answer.findById
      .mockResolvedValueOnce(answer)
      .mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue(answer),
      })
      .mockResolvedValueOnce(answer);

    const editRes = await request(app)
      .patch(`/api/v1/answers/${answerId}`)
      .send({ body: "Updated answer" });

    expect(editRes.statusCode).toBe(200);
    expect(answer.body).toBe("Updated answer");
    expect(answer.save).toHaveBeenCalled();

    const deleteRes = await request(app).delete(`/api/v1/answers/${answerId}`);

    expect(deleteRes.statusCode).toBe(200);
    expect(answer.deleteOne).toHaveBeenCalled();
  });
});
