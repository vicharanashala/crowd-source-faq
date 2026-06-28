const express = require("express");
const request = require("supertest");

jest.mock("../services/aiService", () => ({
  generateChatbotAnswer: jest.fn(),
  generateEmbedding: jest.fn(),
  summarizeAnswers: jest.fn(),
}));

jest.mock("../services/groqService", () => ({
  groqChatWithHistory: jest.fn(),
  GROQ_CHAT_MODEL: "llama-3.3-70b-versatile",
}));

jest.mock("../models/Question", () => ({
  aggregate: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
}));

jest.mock("../models/Answer", () => ({
  find: jest.fn(),
}));

const Answer = require("../models/Answer");
const Question = require("../models/Question");
const {
  generateEmbedding,
} = require("../services/aiService");
const {
  groqChatWithHistory,
} = require("../services/groqService");
const aiRoutes = require("../routes/aiRoutes");
const { errorHandler } = require("../middleware/errorHandler");

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/ai", aiRoutes);
  app.use(errorHandler);
  return app;
};

const mockQuestionTextSearch = (matches = []) => {
  Question.find.mockReturnValue({
    select: jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(matches),
      }),
    }),
  });
};

const mockAnswerFind = (answers = []) => {
  const chain = {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(answers),
  };

  Answer.find.mockReturnValue(chain);
};

describe("AI API", () => {
  let app;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    jest.clearAllMocks();
    app = createTestApp();
  });

  it("returns a Gemini-generated FAQ assistant answer with vector context", async () => {
    generateEmbedding.mockResolvedValue(new Array(3072).fill(0.1));
    Question.aggregate.mockResolvedValue([
      {
        _id: "507f1f77bcf86cd799439014",
        title: "How do I reset my password?",
        body: "Password reset steps",
        answers: [{ body: "Use forgot password on the login page." }],
        vectorScore: 0.92,
      },
    ]);
    groqChatWithHistory.mockResolvedValue("Use the forgot password link on the login page.");

    const res = await request(app)
      .post("/api/v1/ai/chat")
      .send({ message: "I forgot my password" });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.answer).toBe("Use the forgot password link on the login page.");
    expect(res.body.data.matches).toHaveLength(1);
    expect(res.body.data.aiFallback).toBe(false);
    expect(groqChatWithHistory).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("How do I reset my password?"),
        }),
      ]),
      400
    );
  });

  it("falls back to text matches when Gemini is not configured", async () => {
    generateEmbedding.mockRejectedValue(new Error("GEMINI_API_KEY is required"));
    groqChatWithHistory.mockRejectedValue(new Error("Groq API error"));
    Question.aggregate.mockResolvedValue([]);
    mockQuestionTextSearch([
      {
        _id: "507f1f77bcf86cd799439014",
        title: "How do I reset my password?",
        body: "Password reset steps",
      },
    ]);
    mockAnswerFind([
      {
        question: "507f1f77bcf86cd799439014",
        body: "Use forgot password on the login page.",
      },
    ]);

    const res = await request(app)
      .post("/api/v1/ai/chat")
      .send({ message: "reset password" });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.aiFallback).toBe(true);
    expect(res.body.data.answer).toContain("Use forgot password");
    expect(Question.find).toHaveBeenCalled();
    expect(Answer.find).toHaveBeenCalled();
  });

  it("checks duplicate questions using the vector score thresholds", async () => {
    generateEmbedding.mockResolvedValue(new Array(3072).fill(0.2));
    Question.aggregate.mockResolvedValue([
      {
        _id: "507f1f77bcf86cd799439014",
        title: "How do I reset my password?",
        body: "Password reset steps",
        answers: [],
        score: 0.91,
      },
    ]);

    const res = await request(app)
      .post("/api/v1/ai/check-duplicates")
      .send({ title: "How can I reset password?" });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.action).toBe("hard_intercept");
    expect(res.body.data.matches).toHaveLength(1);
    expect(res.body.data.thresholds.duplicate).toBe(0.85);
  });
});
