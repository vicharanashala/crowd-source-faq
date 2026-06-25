const DirectQuestion = require("../models/DirectQuestion");
const FAQ = require("../models/FAQ");
const { logAction } = require("../utils/auditLog");

/**
 * POST /api/direct-questions
 * Public — attach user info from optional JWT (same pattern as postController.getPosts).
 */
const createDirectQuestion = async (req, res) => {
    try {
        const { question, context, source, originalQuery, askedBy } = req.body;

        if (!question || !question.trim()) {
            return res.status(400).json({ message: "Question is required" });
        }

        // Optional auth — decode JWT if present, same pattern as getPosts/getPostById
        let userInfo = { id: "", name: "Anonymous", email: "" };
        const authHeader = req.headers["authorization"];
        const token = authHeader && authHeader.split(" ")[1];
        if (token) {
            try {
                const jwt = require("jsonwebtoken");
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                userInfo = { id: decoded.id || "", name: decoded.name || "Anonymous", email: decoded.email || "" };
            } catch (e) {}
        }

        // Allow askedBy from body (for anonymous users who supply name/email in form)
        const resolvedAskedBy = {
            id: userInfo.id || (askedBy?.id || ""),
            name: userInfo.name !== "Anonymous" ? userInfo.name : (askedBy?.name || "Anonymous"),
            email: userInfo.email || (askedBy?.email || ""),
        };

        const doc = await DirectQuestion.create({
            question: question.trim(),
            context: context || "",
            askedBy: resolvedAskedBy,
            source: source || "manual",
            originalQuery: originalQuery || "",
        });

        res.status(201).json(doc);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * GET /api/direct-questions
 * Admin-only. Supports ?status= filter.
 */
const getDirectQuestions = async (req, res) => {
    try {
        const filter = {};
        if (req.query.status) {
            filter.status = req.query.status;
        }
        const docs = await DirectQuestion.find(filter).sort({ createdAt: -1 });
        res.status(200).json(docs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * PUT /api/direct-questions/:id/answer
 * Admin-only. Body: { answer }
 */
const answerDirectQuestion = async (req, res) => {
    try {
        const { answer } = req.body;
        if (!answer || !answer.trim()) {
            return res.status(400).json({ message: "Answer is required" });
        }

        const doc = await DirectQuestion.findByIdAndUpdate(
            req.params.id,
            { status: "answered", answer: answer.trim(), answeredBy: req.user.id, answeredAt: new Date() },
            { new: true }
        );

        if (!doc) return res.status(404).json({ message: "Direct question not found" });

        // Non-blocking audit log
        logAction({
            action: "ANSWER_DIRECT_QUESTION",
            actorId: req.user.id,
            actorName: req.user.name || "",
            targetType: "DirectQuestion",
            targetId: doc._id.toString(),
            details: `Answered: "${doc.question.slice(0, 80)}"`,
        });

        res.status(200).json(doc);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * PUT /api/direct-questions/:id/dismiss
 * Admin-only.
 */
const dismissDirectQuestion = async (req, res) => {
    try {
        const doc = await DirectQuestion.findByIdAndUpdate(
            req.params.id,
            { status: "dismissed" },
            { new: true }
        );

        if (!doc) return res.status(404).json({ message: "Direct question not found" });

        logAction({
            action: "DISMISS_DIRECT_QUESTION",
            actorId: req.user.id,
            actorName: req.user.name || "",
            targetType: "DirectQuestion",
            targetId: doc._id.toString(),
            details: `Dismissed: "${doc.question.slice(0, 80)}"`,
        });

        res.status(200).json(doc);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * POST /api/direct-questions/:id/convert-to-faq
 * Admin-only. Body: { category?, tags?, source?, answer? }
 * Uses the question + answer already stored on the DirectQuestion
 * (or an answer passed in body if not yet answered).
 */
const convertToFaq = async (req, res) => {
    try {
        const dq = await DirectQuestion.findById(req.params.id);
        if (!dq) return res.status(404).json({ message: "Direct question not found" });

        const answerText = req.body.answer || dq.answer;
        if (!answerText || !answerText.trim()) {
            return res.status(400).json({ message: "An answer is required to convert to FAQ" });
        }

        const faq = await FAQ.create({
            question: dq.question,
            answer: answerText.trim(),
            category: req.body.category || "General",
            tags: req.body.tags || [],
            source: req.body.source || "Direct Question",
        });

        await DirectQuestion.findByIdAndUpdate(req.params.id, {
            status: "answered",
            answer: answerText.trim(),
            answeredBy: req.user.id,
            answeredAt: new Date(),
            convertedToFaqId: faq._id,
        });

        logAction({
            action: "CONVERT_TO_FAQ",
            actorId: req.user.id,
            actorName: req.user.name || "",
            targetType: "DirectQuestion",
            targetId: dq._id.toString(),
            details: `Converted to FAQ id=${faq._id}: "${dq.question.slice(0, 80)}"`,
        });

        res.status(201).json({ faq, message: "Converted to FAQ successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    createDirectQuestion,
    getDirectQuestions,
    answerDirectQuestion,
    dismissDirectQuestion,
    convertToFaq,
};
