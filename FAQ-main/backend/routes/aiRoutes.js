const express = require("express");
const router = express.Router();

const {
    askAI,
    chatProxy,
    uploadFAQProxy,
    uploadPDFProxy,
    getUnansweredProxy,
    getRepetitionClustersProxy,
    promoteRepetitionClusterProxy,
    dismissRepetitionClusterProxy,
    healthCheck
} = require("../controllers/aiController");

// Original ask endpoint (FAQ lookup + AI-agents fallback)
router.post("/ask", askAI);

// Direct chat proxy to AI-agents /chat
router.post("/chat", chatProxy);

// File upload proxies (these require multer or similar for file handling)
router.post("/upload-faq", uploadFAQProxy);
router.post("/upload-pdf", uploadPDFProxy);

// Unanswered questions from AI-agents
router.get("/unanswered", getUnansweredProxy);

// Repetition clusters (Feature 2)
router.get("/repetition-clusters", getRepetitionClustersProxy);
router.post("/repetition-clusters/:id/promote", promoteRepetitionClusterProxy);
router.post("/repetition-clusters/:id/dismiss", dismissRepetitionClusterProxy);

// Health check for AI service connectivity
router.get("/health", healthCheck);

module.exports = router;