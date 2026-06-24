import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import authRoutes from "./src/backend/routes/authRoutes.js";
import ticketRoutes from "./src/backend/routes/ticketRoutes.js";
import faqRoutes from "./src/backend/routes/faqRoutes.js";
import chatRoutes from "./src/backend/routes/chatRoutes.js";
import communityAnswerRoutes from "./src/backend/routes/communityAnswerRoutes.js";
import notificationRoutes from "./src/backend/routes/notificationRoutes.js";
import { prisma } from "./src/backend/services/db.js";
import { authenticateToken, requireAdmin } from "./src/backend/middleware/authMiddleware.js";

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// Middleware
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === "production" ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://*"],
      connectSrc: ["'self'", "https://*"]
    }
  } : false
}));
app.use(cors());
app.use(express.json());

// Rate limiters for production security
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many authentication attempts. Please try again after 15 minutes." }
});

const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 15,
  message: { error: "Too many chat messages. Please try again in a minute." }
});

// API Routes
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/faqs", faqRoutes);
app.use("/api/chat", chatLimiter, chatRoutes);
app.use("/api/community-answers", communityAnswerRoutes);
app.use("/api/notifications", notificationRoutes);

app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Admin system logs endpoint (Placeholder logic)
app.get("/api/admin/logs", authenticateToken as any, requireAdmin as any, async (req, res) => {
  try {
    const userCounts = await prisma.user.count();
    const ticketCounts = await prisma.ticket.count();
    const faqCounts = await prisma.fAQ.count();
    const answerCounts = await prisma.communityAnswer.count();
    const usersList = await prisma.user.findMany({
      select: { name: true, email: true, studentId: true, college: true, role: true, isVerified: true, contributionScore: true }
    });
    
    res.json({
      success: true,
      mailLogs: [],
      userCounts,
      ticketCounts,
      faqCounts,
      answerCounts,
      usersList
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Vite Middleware & Static Serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Setting up Vite development middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Setting up production static file serving...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`IIT Ropar Vicharanashala Support Portal backend listening on port ${PORT}`);
  });
}

startServer();
