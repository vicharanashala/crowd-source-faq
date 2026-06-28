const express = require("express");
const request = require("supertest");

jest.mock("../services/aiService", () => ({
  generateEmbedding: jest.fn(),
  generateProvisionalDraft: jest.fn(),
}));

jest.mock("../models/Question", () => ({
  aggregate: jest.fn(),
  find: jest.fn(),
}));

const Question = require("../models/Question");
const { generateEmbedding } = require("../services/aiService");
const searchRoutes = require("../routes/searchRoutes");
const { errorHandler } = require("../middleware/errorHandler");

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/search", searchRoutes);
  app.use(errorHandler);
  return app;
};

const mockTextSearch = (matches = []) => {
  Question.find.mockReturnValue({
    limit: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(matches),
    }),
  });
};

describe("Triage API", () => {
  let app;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    jest.clearAllMocks();
    app = createTestApp();
  });

  it("returns allow_post when no matches are found", async () => {
    const mockVector = new Array(768).fill(0);
    mockVector[0] = 0.1;
    generateEmbedding.mockResolvedValue(mockVector);
    Question.aggregate.mockResolvedValue([]);
    mockTextSearch([]);

    const res = await request(app)
      .get("/api/v1/search")
      .query({ q: "how to install node" });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.action).toBe("allow_post");
    expect(res.body.data.matches).toEqual([]);
    expect(Question.aggregate).toHaveBeenCalled();
    expect(Question.find).toHaveBeenCalled();
  });

  it("returns 400 if query is missing", async () => {
    const res = await request(app).get("/api/v1/search");

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(generateEmbedding).not.toHaveBeenCalled();
  });
});
