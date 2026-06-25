const express = require("express");
const router = express.Router();

const {
    createAnswer,
    getAnswers,
    upvoteAnswer,
    acceptAnswer
} = require("../controllers/answerController");

const protect = require("../middleware/authMiddleware");
const adminOnly = require("../middleware/adminMiddleware");

router.post("/posts/:id/answers", protect, createAnswer);
router.get("/posts/:id/answers", getAnswers);
router.post("/answers/:id/upvote", protect, upvoteAnswer);
router.post("/answers/:id/accept", protect, adminOnly, acceptAnswer);

module.exports = router;