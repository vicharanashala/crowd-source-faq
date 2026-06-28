const cookieParser = require("cookie-parser");
const express = require("express");
const request = require("supertest");

const adminId = "507f1f77bcf86cd799439011";
const moderatorId = "507f1f77bcf86cd799439012";
const studentId = "507f1f77bcf86cd799439013";
const userId = "507f1f77bcf86cd799439014";
const questionId = "507f1f77bcf86cd799439015";
const answerId = "507f1f77bcf86cd799439016";

jest.mock("../middleware/authMiddleware", () => ({
  protect: (req, res, next) => {
    req.user = {
      _id: req.headers["x-user-id"] || adminId,
      role: req.headers["x-user-role"] || "admin",
    };
    next();
  },
}));

jest.mock("../models/User", () => ({
  countDocuments: jest.fn(),
  aggregate: jest.fn(),
  find: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

jest.mock("../models/Question", () => ({
  countDocuments: jest.fn(),
  aggregate: jest.fn(),
  find: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findById: jest.fn(),
}));

jest.mock("../models/Answer", () => ({
  countDocuments: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  updateMany: jest.fn(),
  deleteMany: jest.fn(),
}));

jest.mock("../models/Report", () => ({
  countDocuments: jest.fn(),
  find: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findById: jest.fn(),
}));

const User = require("../models/User");
const Question = require("../models/Question");
const Answer = require("../models/Answer");
const Report = require("../models/Report");
const adminRoutes = require("../routes/adminRoutes");
const { errorHandler } = require("../middleware/errorHandler");

const createIoMock = () => {
  const roomEmit = jest.fn();
  const to = jest.fn(() => ({
    emit: roomEmit,
  }));
  return {
    io: {
      emit: jest.fn(),
      to,
    },
    roomEmit,
  };
};

const createTestApp = (ioWrapper) => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req, res, next) => {
    req.app.set("io", ioWrapper);
    next();
  });
  app.use("/api/v1/admin", adminRoutes);
  app.use(errorHandler);
  return app;
};

const buildQuestion = (overrides = {}) => ({
  _id: questionId,
  title: "Test question",
  status: "pending",
  author: userId,
  acceptedAnswerId: null,
  save: jest.fn().mockResolvedValue(undefined),
  deleteOne: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const buildAnswer = (overrides = {}) => ({
  _id: answerId,
  question: questionId,
  author: userId,
  isAccepted: false,
  isOfficial: false,
  save: jest.fn().mockResolvedValue(undefined),
  deleteOne: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe("Admin API", () => {
  let app;
  let ioMock;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    jest.resetAllMocks();
    ioMock = createIoMock();
    app = createTestApp(ioMock.io);
  });

  it("blocks non-admin/moderator users in admin middleware", async () => {
    const res = await request(app)
      .get("/api/v1/admin/stats")
      .set("x-user-id", studentId)
      .set("x-user-role", "student");

    expect(res.statusCode).toBe(403);
    expect(res.body.error.message).toContain("Moderator or admin");
  });

  it("returns dashboard stats", async () => {
    User.countDocuments.mockResolvedValueOnce(4);
    Question.countDocuments.mockResolvedValueOnce(9);
    Answer.countDocuments
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(2);
    Report.countDocuments.mockResolvedValueOnce(3);
    User.aggregate.mockResolvedValue([
      { _id: "student", count: 2 },
      { _id: "admin", count: 1 },
    ]);
    Question.aggregate.mockResolvedValue([
      { _id: "pending", count: 3 },
      { _id: "resolved", count: 6 },
    ]);

    const res = await request(app).get("/api/v1/admin/stats");

    expect(res.statusCode).toBe(200);
    expect(res.body.data.totals.users).toBe(4);
    expect(res.body.data.totals.pendingReports).toBe(3);
    expect(res.body.data.questionsByStatus.resolved).toBe(6);
  });

  it("lists users for admin management", async () => {
    const users = [{ _id: userId, displayName: "User", role: "student" }];
    User.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(users),
      }),
    });

    const res = await request(app).get("/api/v1/admin/users?search=user");

    expect(res.statusCode).toBe(200);
    expect(res.body.data.users).toHaveLength(1);
  });

  it("requires admin for role updates", async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/users/${userId}/role`)
      .set("x-user-id", moderatorId)
      .set("x-user-role", "moderator")
      .send({ role: "admin" });

    expect(res.statusCode).toBe(403);
    expect(res.body.error.message).toContain("Admin");
  });

  it("updates user role for admins", async () => {
    User.findByIdAndUpdate.mockResolvedValue({
      _id: userId,
      role: "moderator",
    });

    const res = await request(app)
      .patch(`/api/v1/admin/users/${userId}/role`)
      .send({ role: "moderator" });

    expect(res.statusCode).toBe(200);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      userId,
      { role: "moderator" },
      { new: true, runValidators: true }
    );
  });

  it("lists questions for moderation", async () => {
    const questions = [{ _id: questionId, title: "Q1", status: "pending" }];
    Question.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(questions),
          }),
        }),
      }),
    });

    const res = await request(app).get("/api/v1/admin/questions?status=pending");

    expect(res.statusCode).toBe(200);
    expect(res.body.data.questions).toHaveLength(1);
  });

  it("updates question status and emits a socket event", async () => {
    const question = buildQuestion({ status: "closed" });
    Question.findByIdAndUpdate.mockReturnValue({
      select: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(question),
      }),
    });

    const res = await request(app)
      .patch(`/api/v1/admin/questions/${questionId}/status`)
      .send({ status: "closed" });

    expect(res.statusCode).toBe(200);
    expect(ioMock.io.to).toHaveBeenCalledWith(`question_${questionId}`);
    expect(ioMock.roomEmit).toHaveBeenCalledWith("question_status_updated", {
      questionId,
      status: "closed",
    });
  });

  it("deletes a question and its answers", async () => {
    const question = buildQuestion();
    Question.findById.mockResolvedValue(question);
    Answer.deleteMany.mockResolvedValue({ deletedCount: 3 });

    const res = await request(app).delete(`/api/v1/admin/questions/${questionId}`);

    expect(res.statusCode).toBe(200);
    expect(Answer.deleteMany).toHaveBeenCalledWith({ question: questionId });
    expect(question.deleteOne).toHaveBeenCalled();
  });

  it("lists answers for moderation", async () => {
    const answers = [{ _id: answerId, body: "Answer", isOfficial: false }];
    Answer.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(answers),
          }),
        }),
      }),
    });

    const res = await request(app).get("/api/v1/admin/answers?official=false");

    expect(res.statusCode).toBe(200);
    expect(res.body.data.answers).toHaveLength(1);
  });

  it("marks an answer as official and updates question resolution", async () => {
    const answer = buildAnswer();
    const question = buildQuestion();
    Answer.findById
      .mockResolvedValueOnce(answer)
      .mockReturnValueOnce({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(answer),
        }),
      });
    Question.findById.mockResolvedValue(question);
    Answer.updateMany.mockResolvedValue({ modifiedCount: 1 });

    const res = await request(app)
      .patch(`/api/v1/admin/answers/${answerId}/official`)
      .send({ isOfficial: true });

    expect(res.statusCode).toBe(200);
    expect(answer.isOfficial).toBe(true);
    expect(answer.isAccepted).toBe(true);
    expect(question.status).toBe("resolved");
    expect(ioMock.roomEmit).toHaveBeenCalledWith(
      "official_answer_created",
      answer
    );
  });

  it("deletes an accepted answer and recalculates question status", async () => {
    const answer = buildAnswer({ isAccepted: true });
    const question = buildQuestion({ acceptedAnswerId: answerId, status: "resolved" });
    Answer.findById.mockResolvedValue(answer);
    Question.findById.mockResolvedValue(question);
    Answer.findOne.mockResolvedValue(null);
    Answer.countDocuments.mockResolvedValue(0);

    const res = await request(app).delete(`/api/v1/admin/answers/${answerId}`);

    expect(res.statusCode).toBe(200);
    expect(question.status).toBe("pending");
    expect(question.acceptedAnswerId).toBeNull();
    expect(question.save).toHaveBeenCalled();
  });

  it("lists reports for moderation", async () => {
    const mockReports = [
      {
        _id: "507f1f77bcf86cd799439017",
        reporter: "507f1f77bcf86cd799439014",
        type: "question",
        target: questionId,
        reason: "spam",
        status: "pending",
      },
    ];

    Report.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockReports),
    });

    Question.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ title: "Spam Question", body: "This is spam" }),
    });

    const res = await request(app).get("/api/v1/admin/reports?status=pending");

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.reports).toHaveLength(1);
    expect(res.body.data.reports[0].targetDetail.title).toBe("Spam Question");
  });

  it("updates report status", async () => {
    const mockReport = {
      _id: "507f1f77bcf86cd799439017",
      status: "resolved",
    };

    Report.findByIdAndUpdate.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockReport),
    });

    const res = await request(app)
      .patch("/api/v1/admin/reports/507f1f77bcf86cd799439017")
      .send({ status: "resolved" });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.report.status).toBe("resolved");
  });
});
