const express = require("express");
const request = require("supertest");

const userId = "507f1f77bcf86cd799439014";
const questionId = "507f1f77bcf86cd799439015";
const reportId = "507f1f77bcf86cd799439019";

jest.mock("../middleware/authMiddleware", () => ({
  protect: (req, res, next) => {
    req.user = {
      _id: userId,
      role: "student",
    };
    next();
  },
}));

jest.mock("../models/Question", () => ({
  exists: jest.fn(),
}));

jest.mock("../models/Report", () => ({
  create: jest.fn(),
}));

const Question = require("../models/Question");
const Report = require("../models/Report");
const reportRoutes = require("../routes/reportRoutes");
const { errorHandler } = require("../middleware/errorHandler");

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/reports", reportRoutes);
  app.use(errorHandler);
  return app;
};

describe("Report API", () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createTestApp();
  });

  it("submits a new flag report successfully", async () => {
    Question.exists.mockResolvedValue(true);
    Report.create.mockResolvedValue({
      _id: reportId,
      target: questionId,
      type: "question",
      reason: "Spam / promotional",
      reporter: userId,
      status: "pending",
    });

    const res = await request(app)
      .post("/api/v1/reports")
      .send({ target: questionId, type: "question", reason: "Spam / promotional" });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.report.reason).toBe("Spam / promotional");
    expect(Question.exists).toHaveBeenCalledWith({ _id: questionId });
  });

  it("fails to submit a report with an invalid reason", async () => {
    const res = await request(app)
      .post("/api/v1/reports")
      .send({ target: questionId, type: "question", reason: "Invalid Reason" });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain("Invalid report reason");
  });
});
