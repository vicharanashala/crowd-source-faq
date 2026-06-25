const express = require("express");
const router = express.Router();

const {
    createPost,
    getPosts,
    getPostById,
    votePost,
    addComment,
    addReply,
    likeComment,
    bookmarkPost,
    deletePost
} = require("../controllers/postController");

const protect = require("../middleware/authMiddleware");

// Public routes
router.get("/", getPosts);
router.get("/:id", getPostById);

// Protected routes (require auth)
router.post("/", protect, createPost);
router.post("/:id/vote", protect, votePost);
router.post("/:id/comments", protect, addComment);
router.post("/:id/comments/:commentId/replies", protect, addReply);
router.post("/:id/comments/:commentId/like", protect, likeComment);
router.post("/:id/bookmark", protect, bookmarkPost);
router.delete("/:id", protect, deletePost);

module.exports = router;