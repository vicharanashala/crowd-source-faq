import path from "path";
import express, { Application, Request, Response } from "express";
import cors from "cors";

import discussionRoutes from "./routes/discussionRoutes";
import replyRoutes from "./routes/replyRoutes";
import faqRoutes from "./routes/faqRoutes";
import adminRoutes from "./routes/adminRoutes";
import escalationRoutes from "./routes/escalationRoutes";
import queryResolutionRoutes from "./routes/queryResolutionRoutes";
import voiceAgentRoutes from "./routes/voiceAgentRoutes";

import { notFound, errorHandler } from "./middleware/errorHandler";

const app: Application = express();

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  })
);
app.use(express.json());

app.get("/api/health", (req: Request, res: Response) => {
  res.json({ success: true, message: "CSFAQ API is running" });
});

// Discussion Forum module — fully implemented per PRODUCT.md
app.use("/api/discussions", discussionRoutes);
app.use("/api/replies", replyRoutes);

// Sibling modules — placeholders only, built out in their own workstreams
app.use("/api/faqs", faqRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/escalations", escalationRoutes);
app.use("/api/query-resolution", queryResolutionRoutes);

// FAQ Voice Agent — previously ran as its own standalone Node server on
// port 3100. It now runs inside this same Express app/port: its own API
// (local FAQ seed, kept separate from the MongoDB-backed /api/faqs above)
// is namespaced under /voice-agent/api, and its static frontend is served
// from /voice-agent.
app.use("/voice-agent", voiceAgentRoutes);
app.use("/voice-agent", express.static(path.join(__dirname, "../voice-agent/src")));

app.use(notFound);
app.use(errorHandler);

export default app;
