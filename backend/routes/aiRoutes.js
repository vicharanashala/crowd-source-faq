const express = require("express");

const {
  askChatbot,
  checkDuplicates,
  summarizeQuestionAnswers,
} = require("../controllers/aiController");

const router = express.Router();

router.post("/chat", askChatbot);
router.post("/check-duplicates", checkDuplicates);
router.get("/summarize/:questionId", summarizeQuestionAnswers);

module.exports = router;
