import { Router } from "express";
import { upvoteReply, acceptReply, approveReply } from "../controllers/replyController";

const router = Router();

// PATCH /api/replies/:replyId/upvote
router.patch("/:replyId/upvote", upvoteReply);

// PATCH /api/replies/:replyId/accept
router.patch("/:replyId/accept", acceptReply);

// PATCH /api/replies/:replyId/approve (Admin)
router.patch("/:replyId/approve", approveReply);

export default router;
