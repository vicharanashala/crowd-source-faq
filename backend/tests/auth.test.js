const cookieParser = require("cookie-parser");
const express = require("express");
const jwt = require("jsonwebtoken");
const request = require("supertest");

jest.mock("../models/User", () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  hashPassword: jest.fn(),
}));

const User = require("../models/User");
const authRoutes = require("../routes/authRoutes");
const { errorHandler } = require("../middleware/errorHandler");

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/v1/auth", authRoutes);
  app.use(errorHandler);
  return app;
};

const buildUser = (overrides = {}) => ({
  _id: "507f1f77bcf86cd799439011",
  displayName: "Test User",
  email: "test@example.com",
  role: "student",
  verifyPassword: jest.fn(),
  toObject() {
    return {
      _id: this._id,
      displayName: this.displayName,
      email: this.email,
      role: this.role,
      passwordHash: "should-not-leak",
      ...overrides,
    };
  },
  ...overrides,
});

describe("Auth API", () => {
  let app;

  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret";
    process.env.NODE_ENV = "test";
    jest.clearAllMocks();
    app = createTestApp();
  });

  it("register stores passwordHash and returns a safe user", async () => {
    const user = buildUser();
    User.findOne.mockResolvedValue(null);
    User.hashPassword.mockResolvedValue("hashed-password");
    User.create.mockResolvedValue(user);

    const res = await request(app).post("/api/v1/auth/register").send({
      displayName: "Test User",
      email: "test@example.com",
      password: "Secret123",
    });

    expect(res.statusCode).toBe(201);
    expect(User.create).toHaveBeenCalledWith({
      displayName: "Test User",
      email: "test@example.com",
      passwordHash: "hashed-password",
    });
    expect(res.headers["set-cookie"].join(";")).toContain("token=");
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it("login verifies password and sets a JWT cookie", async () => {
    const user = buildUser();
    user.verifyPassword.mockResolvedValue(true);
    User.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(user),
    });

    const res = await request(app).post("/api/v1/auth/login").send({
      email: "test@example.com",
      password: "Secret123",
    });

    expect(res.statusCode).toBe(200);
    expect(user.verifyPassword).toHaveBeenCalledWith("Secret123");
    expect(res.headers["set-cookie"].join(";")).toContain("token=");
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it("rejects login when password verification fails", async () => {
    const user = buildUser();
    user.verifyPassword.mockResolvedValue(false);
    User.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(user),
    });

    const res = await request(app).post("/api/v1/auth/login").send({
      email: "test@example.com",
      password: "wrong-password",
    });

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("returns current user with a valid JWT cookie", async () => {
    const user = buildUser();
    User.findById.mockResolvedValue(user);
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", [`token=${token}`]);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.user.email).toBe("test@example.com");
  });

  it("logout clears the JWT cookie", async () => {
    const res = await request(app).post("/api/v1/auth/logout");

    expect(res.statusCode).toBe(200);
    expect(res.headers["set-cookie"].join(";")).toContain("token=;");
  });
});
