const express = require("express");

const {
  createQuestion,
  getQuestions,
  getQuestionById,
  editQuestion,
  deleteQuestion,
  voteQuestion,
  followQuestion,
  bookmarkQuestion,
} = require("../controllers/questionController");
const { createComment } = require("../controllers/commentController");
const { protect, optionalProtect } = require("../middleware/authMiddleware");

const router = express.Router();

// GET  /api/v1/questions          – list with filters, sort, pagination
// POST /api/v1/questions          – create a new question (auth required)
router.get("/", getQuestions);
router.post("/", protect, createQuestion);

// GET    /api/v1/questions/:id    – fetch single question + answers
// PATCH  /api/v1/questions/:id    – edit question (auth required)
// DELETE /api/v1/questions/:id    – close/delete question (auth required)
// POST   /api/v1/questions/:id/vote – upvote/downvote a question (auth required)
router.get("/:id", optionalProtect, getQuestionById);
router.patch("/:id", protect, editQuestion);
router.delete("/:id", protect, deleteQuestion);
router.post("/:id/vote", protect, voteQuestion);

// POST   /api/v1/questions/:id/follow – follow/unfollow question (auth required)
router.post("/:id/follow", protect, followQuestion);

// POST   /api/v1/questions/:id/bookmark – bookmark/unbookmark question (auth required)
router.post("/:id/bookmark", protect, bookmarkQuestion);

// POST   /api/v1/questions/:id/comments – add comment to question (auth required)
router.post("/:id/comments", protect, createComment);

module.exports = router;
