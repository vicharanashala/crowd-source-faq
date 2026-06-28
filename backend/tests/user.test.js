const cookieParser = require("cookie-parser");
const express = require("express");
const jwt = require("jsonwebtoken");
const request = require("supertest");

jest.mock("../models/User", () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

jest.mock("../models/Question", () => ({
  find: jest.fn(),
}));

jest.mock("../models/Answer", () => ({
  find: jest.fn(),
}));

const Answer = require("../models/Answer");
const Question = require("../models/Question");
const User = require("../models/User");
const userRoutes = require("../routes/userRoutes");
const { errorHandler } = require("../middleware/errorHandler");

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/v1/users", userRoutes);
  app.use(errorHandler);
  return app;
};

const userId = "507f1f77bcf86cd799439011";
const user = {
  _id: userId,
  displayName: "Test User",
  email: "test@example.com",
  role: "student",
};

describe("User API", () => {
  let app;
  let token;

  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret";
    process.env.NODE_ENV = "test";
    jest.clearAllMocks();
    app = createTestApp();
    token = jwt.sign({ id: userId }, process.env.JWT_SECRET);
  });

  it("updates the current user's profile", async () => {
    User.findById.mockResolvedValue(user);
    User.findByIdAndUpdate.mockResolvedValue({
      ...user,
      displayName: "Updated User",
    });

    const res = await request(app)
      .patch("/api/v1/users/me")
      .set("Cookie", [`token=${token}`])
      .send({ displayName: "Updated User" });

    expect(res.statusCode).toBe(200);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      userId,
      { displayName: "Updated User" },
      { new: true, runValidators: true }
    );
    expect(res.body.data.user.displayName).toBe("Updated User");
  });

  it("returns a public user profile", async () => {
    User.findById.mockResolvedValue(user);

    const res = await request(app).get(`/api/v1/users/${userId}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.user.email).toBe("test@example.com");
  });

  it("returns questions asked by a user", async () => {
    User.findById.mockResolvedValue(user);
    const questions = [{ _id: "507f1f77bcf86cd799439012", title: "A question" }];
    Question.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(questions),
    });

    const res = await request(app).get(`/api/v1/users/${userId}/questions`);

    expect(res.statusCode).toBe(200);
    expect(Question.find).toHaveBeenCalledWith({ author: userId });
    expect(res.body.data.questions).toHaveLength(1);
  });

  it("returns answers written by a user", async () => {
    User.findById.mockResolvedValue(user);
    const answers = [{ _id: "507f1f77bcf86cd799439013", body: "An answer" }];
    Answer.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(answers),
    });

    const res = await request(app).get(`/api/v1/users/${userId}/answers`);

    expect(res.statusCode).toBe(200);
    expect(Answer.find).toHaveBeenCalledWith({ author: userId });
    expect(res.body.data.answers).toHaveLength(1);
  });
});
