const express = require("express");
const request = require("supertest");

const userId = "507f1f77bcf86cd799439014";
const notificationId = "507f1f77bcf86cd799439017";

jest.mock("../middleware/authMiddleware", () => ({
  protect: (req, res, next) => {
    req.user = {
      _id: userId,
      role: "student",
    };
    next();
  },
}));

jest.mock("../models/Notification", () => ({
  find: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateMany: jest.fn(),
}));

const Notification = require("../models/Notification");
const notificationRoutes = require("../routes/notificationRoutes");
const { errorHandler } = require("../middleware/errorHandler");

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/notifications", notificationRoutes);
  app.use(errorHandler);
  return app;
};

describe("Notification API", () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createTestApp();
  });

  it("lists all notifications for the authenticated user", async () => {
    const mockNotifications = [
      {
        _id: notificationId,
        user: userId,
        type: "answer",
        text: "Someone answered your question.",
        read: false,
      },
    ];

    Notification.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockNotifications),
    });

    const res = await request(app).get("/api/v1/notifications");

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.notifications).toHaveLength(1);
    expect(res.body.data.notifications[0].text).toBe("Someone answered your question.");
    expect(Notification.find).toHaveBeenCalledWith({ user: userId });
  });

  it("marks a specific notification as read", async () => {
    const mockNotification = {
      _id: notificationId,
      user: userId,
      read: true,
      text: "Someone answered your question.",
    };

    Notification.findOneAndUpdate.mockResolvedValue(mockNotification);

    const res = await request(app).patch(`/api/v1/notifications/${notificationId}/read`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.notification.read).toBe(true);
    expect(Notification.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: notificationId, user: userId },
      { read: true },
      { new: true }
    );
  });

  it("marks all notifications as read", async () => {
    Notification.updateMany.mockResolvedValue({ modifiedCount: 5 });

    const res = await request(app).patch("/api/v1/notifications/mark-all-read");

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toBe("All notifications marked as read");
    expect(Notification.updateMany).toHaveBeenCalledWith(
      { user: userId, read: false },
      { read: true }
    );
  });
});
