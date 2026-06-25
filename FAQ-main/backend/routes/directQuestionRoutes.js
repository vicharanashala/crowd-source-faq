const express = require("express");
const router = express.Router();

const protect = require("../middleware/authMiddleware");
const adminOnly = require("../middleware/adminMiddleware");

const {
    createDirectQuestion,
    getDirectQuestions,
    answerDirectQuestion,
    dismissDirectQuestion,
    convertToFaq,
} = require("../controllers/directQuestionController");

router.post("/", createDirectQuestion);                          // public
router.get("/", protect, adminOnly, getDirectQuestions);
router.put("/:id/answer", protect, adminOnly, answerDirectQuestion);
router.put("/:id/dismiss", protect, adminOnly, dismissDirectQuestion);
router.post("/:id/convert-to-faq", protect, adminOnly, convertToFaq);

module.exports = router;
