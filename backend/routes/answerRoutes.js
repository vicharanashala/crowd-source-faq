const express = require("express");

const {
  createAnswer,
  editAnswer,
  deleteAnswer,
  acceptAnswer,
  voteAnswer,
  createOfficialAnswer,
} = require("../controllers/answerController");
const { createComment } = require("../controllers/commentController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, createAnswer);
router.post("/official/create", protect, createOfficialAnswer);
router.patch("/:id", protect, editAnswer);
router.delete("/:id", protect, deleteAnswer);
router.patch("/:id/accept", protect, acceptAnswer);
router.post("/:id/vote", protect, voteAnswer);

// POST   /api/v1/answers/:id/comments – add comment to answer (auth required)
router.post("/:id/comments", protect, createComment);

module.exports = router;
