const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./config/db");

dotenv.config();
connectDB();

const app = express();

// ── Middleware ──────────────────────────────────────────────────
app.use(cors({
    origin: ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "10mb" }));

// ── Health check ───────────────────────────────────────────────
app.get("/", (req, res) => {
    res.json({
        status: "ok",
        service: "vicharanashala-backend",
        time: new Date().toISOString()
    });
});

// ── Routes ─────────────────────────────────────────────────────

// Auth routes
const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);

// Post routes
const postRoutes = require("./routes/postRoutes");
app.use("/api/posts", postRoutes);

// Answer routes
const answerRoutes = require("./routes/answerRoutes");
app.use("/api", answerRoutes);

// FAQ routes
const faqRoutes = require("./routes/faqRoutes");
app.use("/api/faqs", faqRoutes);

// AI routes (proxy to AI-agents service)
const aiRoutes = require("./routes/aiRoutes");
app.use("/api/ai", aiRoutes);

// Direct Questions routes (Feature 1)
const directQuestionRoutes = require("./routes/directQuestionRoutes");
app.use("/api/direct-questions", directQuestionRoutes);

// User management routes (Feature 3)
const userRoutes = require("./routes/userRoutes");
app.use("/api/users", userRoutes);

// Audit log routes (Feature 3)
const auditLogRoutes = require("./routes/auditLogRoutes");
app.use("/api/audit-logs", auditLogRoutes);

// Protected route example
const protect = require("./middleware/authMiddleware");
app.get("/api/protected", protect, (req, res) => {
    res.json({
        message: "Protected route accessed",
        user: req.user
    });
});

// ── Start Server ───────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Vicharanashala Backend running on port ${PORT}`);
});
