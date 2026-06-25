const FAQ = require("../models/FAQ");

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

/**
 * POST /api/ai/ask
 * Smart AI answer: first checks local FAQ DB, then proxies to AI-agents service.
 */
const askAI = async (req, res) => {
    try {
        const { question } = req.body;

        if (!question || !question.trim()) {
            return res.status(400).json({ message: "Question is required" });
        }

        // Step 1: Check local MongoDB FAQ collection first
        const faq = await FAQ.findOne({
            question: {
                $regex: question,
                $options: "i"
            }
        });

        if (faq) {
            return res.json({
                source: "faq",
                answer: faq.answer,
                confidence: 1.0,
                route: "FAQ"
            });
        }

        // Step 2: Forward to AI-agents service for RAG-based answer
        try {
            const response = await fetch(`${AI_SERVICE_URL}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: question })
            });

            if (response.ok) {
                const data = await response.json();
                return res.json({
                    source: "ai_agent",
                    answer: data.answer || "No answer generated.",
                    confidence: data.confidence || 0.0,
                    route: data.route || "BOTH",
                    sources: data.sources || [],
                    is_unanswered: data.is_unanswered || false
                });
            } else {
                const errData = await response.json().catch(() => ({}));
                console.error("AI-agents service error:", errData);
                return res.json({
                    source: "fallback",
                    answer: "The AI service is currently unavailable. Please try again later.",
                    confidence: 0.0,
                    route: "NONE"
                });
            }
        } catch (fetchErr) {
            console.error("Cannot reach AI-agents service:", fetchErr.message);
            return res.json({
                source: "fallback",
                answer: "The AI agents service is not running. Start it with: cd AI-agents && python main.py",
                confidence: 0.0,
                route: "NONE"
            });
        }

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * POST /api/ai/chat
 * Direct proxy to AI-agents /chat endpoint (used by frontend AI drawer).
 */
const chatProxy = async (req, res) => {
    try {
        const { query, prompt } = req.body;
        const question = query || prompt;

        if (!question || !question.trim()) {
            return res.status(400).json({ message: "Query is required" });
        }

        const response = await fetch(`${AI_SERVICE_URL}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: question })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            return res.status(response.status).json({
                error: errData.detail || "AI service error",
                source: "ai_agent"
            });
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error("Chat proxy error:", error.message);
        res.status(502).json({
            error: "Cannot reach AI agents service. Ensure it is running on " + AI_SERVICE_URL,
            source: "proxy_error"
        });
    }
};

/**
 * POST /api/ai/upload-faq
 * Proxy CSV file upload to AI-agents /upload-faq endpoint.
 */
const uploadFAQProxy = async (req, res) => {
    try {
        // Forward the raw body/file to AI-agents
        // For multipart, we need to reconstruct the form data
        const formData = new FormData();

        if (req.file) {
            const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
            formData.append("file", blob, req.file.originalname);
        } else {
            return res.status(400).json({ message: "No file uploaded" });
        }

        const response = await fetch(`${AI_SERVICE_URL}/upload-faq`, {
            method: "POST",
            body: formData
        });

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error("Upload FAQ proxy error:", error.message);
        res.status(502).json({ error: "Cannot reach AI agents service" });
    }
};

/**
 * POST /api/ai/upload-pdf
 * Proxy PDF file upload to AI-agents /upload-pdf endpoint.
 */
const uploadPDFProxy = async (req, res) => {
    try {
        const formData = new FormData();

        if (req.file) {
            const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
            formData.append("file", blob, req.file.originalname);
        } else {
            return res.status(400).json({ message: "No file uploaded" });
        }

        const response = await fetch(`${AI_SERVICE_URL}/upload-pdf`, {
            method: "POST",
            body: formData
        });

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error("Upload PDF proxy error:", error.message);
        res.status(502).json({ error: "Cannot reach AI agents service" });
    }
};

/**
 * GET /api/ai/unanswered
 * Proxy to AI-agents /unanswered-questions endpoint.
 */
const getUnansweredProxy = async (req, res) => {
    try {
        const limit = req.query.limit || 50;
        const skip = req.query.skip || 0;

        const response = await fetch(
            `${AI_SERVICE_URL}/unanswered-questions?limit=${limit}&skip=${skip}`
        );

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error("Unanswered proxy error:", error.message);
        res.status(502).json({ error: "Cannot reach AI agents service" });
    }
};

/**
 * GET /api/ai/repetition-clusters
 * Proxy to AI-agents /repetition-clusters endpoint.
 */
const getRepetitionClustersProxy = async (req, res) => {
    try {
        const response = await fetch(`${AI_SERVICE_URL}/repetition-clusters`);
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error("Repetition clusters proxy error:", error.message);
        res.status(502).json({ error: "Cannot reach AI agents service" });
    }
};

/**
 * POST /api/ai/repetition-clusters/:id/promote
 */
const promoteRepetitionClusterProxy = async (req, res) => {
    try {
        const response = await fetch(
            `${AI_SERVICE_URL}/repetition-clusters/${req.params.id}/promote`,
            { method: "POST", headers: { "Content-Type": "application/json" } }
        );
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error("Promote cluster proxy error:", error.message);
        res.status(502).json({ error: "Cannot reach AI agents service" });
    }
};

/**
 * POST /api/ai/repetition-clusters/:id/dismiss
 */
const dismissRepetitionClusterProxy = async (req, res) => {
    try {
        const response = await fetch(
            `${AI_SERVICE_URL}/repetition-clusters/${req.params.id}/dismiss`,
            { method: "POST", headers: { "Content-Type": "application/json" } }
        );
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error("Dismiss cluster proxy error:", error.message);
        res.status(502).json({ error: "Cannot reach AI agents service" });
    }
};

/**
 * GET /api/ai/health
 * Check AI-agents service health.
 */
const healthCheck = async (req, res) => {
    try {
        const response = await fetch(`${AI_SERVICE_URL}/health`);
        const data = await response.json();
        res.json({
            backend: "healthy",
            ai_service: data,
            ai_service_url: AI_SERVICE_URL
        });
    } catch (error) {
        res.json({
            backend: "healthy",
            ai_service: { status: "unreachable", error: error.message },
            ai_service_url: AI_SERVICE_URL
        });
    }
};

module.exports = {
    askAI,
    chatProxy,
    uploadFAQProxy,
    uploadPDFProxy,
    getUnansweredProxy,
    getRepetitionClustersProxy,
    promoteRepetitionClusterProxy,
    dismissRepetitionClusterProxy,
    healthCheck
};