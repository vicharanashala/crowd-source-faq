// Imports Express to create the API application.
const express = require("express");
// Imports CORS middleware so the frontend can call the backend.
const cors = require("cors");
// Imports cookie parsing middleware for JWT/session cookies.
const cookieParser = require("cookie-parser");


// Shared CORS settings used by Express.
const { corsOptions } = require("./config/cors");

// Final middleware for 404 and error responses.
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");

// Routes for admin moderation, dashboard stats, and content management.
const adminRoutes = require("./routes/adminRoutes");

// Routes for Gemini-backed duplicate checks, summaries, and FAQ assistant chat.
const aiRoutes = require("./routes/aiRoutes");

// Routes for answer creation, voting, accepting, and official answers.
const answerRoutes = require("./routes/answerRoutes");

// Routes for registration/logout and future auth endpoints.
const authRoutes = require("./routes/authRoutes");

// Routes for root API info and health checks.
const healthRoutes = require("./routes/healthRoutes");

// Routes for creating and reading questions.
const questionRoutes = require("./routes/questionRoutes");

// Routes for search and duplicate-question triage.
const searchRoutes = require("./routes/searchRoutes");

// Routes for user profiles and user-owned content.
const userRoutes = require("./routes/userRoutes");

// Routes for real-time notifications.
const notificationRoutes = require("./routes/notificationRoutes");

// Routes for public-facing flagging/reporting.
const reportRoutes = require("./routes/reportRoutes");


// Creates the Express app instance.
const app = express();

// Ensures database connection is established in serverless/Vercel environments (skipped in test)
if (process.env.NODE_ENV !== "test") {
  const mongoose = require("mongoose");
  const { connectToDatabase } = require("./config/db");
  app.use(async (req, res, next) => {
    if (mongoose.connection.readyState !== 1) {
      try {
        await connectToDatabase();
      } catch (err) {
        console.error("Database connection failed in serverless middleware:", err.message);
      }
    }
    next();
  });
}


// Enables cross-origin frontend requests using the shared CORS rules.
app.use(cors(corsOptions));

// Parses incoming JSON request bodies up to 1 MB.
app.use(express.json({ limit: "1mb" }));

// Parses cookies so auth middleware can read token cookies.
app.use(cookieParser());


// Mounts root and health endpoints.
app.use("/", healthRoutes);

// Mounts Gemini-backed AI endpoints under /api/v1/ai.
app.use("/api/v1/ai", aiRoutes);

// Mounts search endpoints under /api/v1/search.
app.use("/api/v1/search", searchRoutes);

// Mounts question endpoints under /api/v1/questions.
app.use("/api/v1/questions", questionRoutes);

// Mounts answer endpoints under /api/v1/answers.
app.use("/api/v1/answers", answerRoutes);

// Mounts authentication endpoints under /api/v1/auth.
app.use("/api/v1/auth", authRoutes);

// Mounts user profile endpoints under /api/v1/users.
app.use("/api/v1/users", userRoutes);

// Mounts notification endpoints under /api/v1/notifications.
app.use("/api/v1/notifications", notificationRoutes);

// Mounts public-facing report endpoints under /api/v1/reports.
app.use("/api/v1/reports", reportRoutes);

// Mounts admin moderation endpoints under /api/v1/admin.
app.use("/api/v1/admin", adminRoutes);


// Handles requests that did not match any route above.
app.use(notFoundHandler);

// Converts thrown errors into consistent JSON error responses.
app.use(errorHandler);


// Exports the app without starting a server, which keeps tests clean.
module.exports = app;
