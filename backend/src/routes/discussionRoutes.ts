import { Router } from "express";
import {
  createDiscussion,
  getDiscussions,
  getDiscussionById,
} from "../controllers/discussionController";
import { addReply } from "../controllers/replyController";
import { validateDiscussionInput, validateReplyInput } from "../middleware/validate";

const router = Router();

// POST /api/discussions
router.post("/", validateDiscussionInput, createDiscussion);

// GET /api/discussions
router.get("/", getDiscussions);

// GET /api/discussions/:id
router.get("/:id", getDiscussionById);

// POST /api/discussions/:id/replies
router.post("/:id/replies", validateReplyInput, addReply);

export default router;
