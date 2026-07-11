import { Request, Response, NextFunction } from "express";
import Discussion from "../models/Discussion";
import Reply from "../models/Reply";
import { ApiError } from "../middleware/errorHandler";

// POST /api/discussions/:id/replies
export const addReply = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const discussion = await Discussion.findById(req.params.id);

    if (!discussion) {
      throw new ApiError(404, "Discussion not found");
    }

    const { content, authorId } = req.body;

    const reply = await Reply.create({
      discussionId: discussion._id,
      authorId,
      content,
    });

    res.status(201).json({ success: true, data: reply });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/replies/:replyId/upvote
export const upvoteReply = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { replyId } = req.params;
    // In absence of an auth system, the caller identifies itself via body
    // so we can guard against double-upvoting the same reply.
    const userId = (req.body?.userId as string) || (req.query?.userId as string) || "anonymous";

    const reply = await Reply.findById(replyId);

    if (!reply) {
      throw new ApiError(404, "Reply not found");
    }

    if (reply.upvotedBy.includes(userId)) {
      throw new ApiError(400, "User has already upvoted this reply");
    }

    reply.upvoteCount += 1;
    reply.upvotedBy.push(userId);
    await reply.save();

    res.json({ success: true, data: reply });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/replies/:replyId/accept
// Only the discussion creator may perform this action.
export const acceptReply = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { replyId } = req.params;
    const { userId } = req.body;

    const reply = await Reply.findById(replyId);
    if (!reply) {
      throw new ApiError(404, "Reply not found");
    }

    const discussion = await Discussion.findById(reply.discussionId);
    if (!discussion) {
      throw new ApiError(404, "Discussion not found");
    }

    if (String(discussion.authorId) !== String(userId)) {
      throw new ApiError(403, "Only the discussion creator can accept an answer");
    }

    // Only one accepted answer is allowed per discussion, so unset any
    // previously accepted reply first.
    if (discussion.acceptedReplyId) {
      await Reply.findByIdAndUpdate(discussion.acceptedReplyId, {
        accepted: false,
      });
    }

    reply.accepted = true;
    await reply.save();

    discussion.acceptedReplyId = reply._id as any;
    await discussion.save();

    res.json({ success: true, data: reply });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/replies/:replyId/approve (Admin)
export const approveReply = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { replyId } = req.params;

    const reply = await Reply.findByIdAndUpdate(
      replyId,
      { approved: true },
      { new: true }
    );

    if (!reply) {
      throw new ApiError(404, "Reply not found");
    }

    res.json({ success: true, data: reply });
  } catch (err) {
    next(err);
  }
};
