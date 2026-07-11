import { Request, Response, NextFunction } from "express";
import Discussion from "../models/Discussion";
import Reply from "../models/Reply";
import { ApiError } from "../middleware/errorHandler";

// POST /api/discussions
export const createDiscussion = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { title, description, category, tags, authorId } = req.body;

    const discussion = await Discussion.create({
      title,
      description,
      category: category || "General",
      tags: tags || [],
      authorId: authorId || "anonymous",
    });

    res.status(201).json({ success: true, data: discussion });
  } catch (err) {
    next(err);
  }
};

// GET /api/discussions?search=&category=&tag=
export const getDiscussions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { search, category, tag } = req.query;

    const filter: Record<string, unknown> = {};

    if (search && typeof search === "string") {
      filter.$text = { $search: search };
    }

    if (category && typeof category === "string") {
      filter.category = category;
    }

    if (tag && typeof tag === "string") {
      filter.tags = tag;
    }

    const discussions = await Discussion.find(filter).sort({ createdAt: -1 }).lean();

    // Attach reply count + upvote total for the feed cards, since the feed
    // needs "Number of replies" and an accepted-answer indicator.
    const discussionIds = discussions.map((d) => d._id);
    const replyStats = await Reply.aggregate([
      { $match: { discussionId: { $in: discussionIds } } },
      {
        $group: {
          _id: "$discussionId",
          replyCount: { $sum: 1 },
          upvoteTotal: { $sum: "$upvoteCount" },
        },
      },
    ]);

    const statsMap = new Map(
      replyStats.map((s) => [s._id.toString(), s])
    );

    const enriched = discussions.map((d) => {
      const stats = statsMap.get(d._id.toString());
      return {
        ...d,
        replyCount: stats?.replyCount || 0,
        upvoteTotal: stats?.upvoteTotal || 0,
        hasAcceptedAnswer: Boolean(d.acceptedReplyId),
      };
    });

    res.json({ success: true, data: enriched });
  } catch (err) {
    next(err);
  }
};

// GET /api/discussions/:id
export const getDiscussionById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const discussion = await Discussion.findById(req.params.id).lean();

    if (!discussion) {
      throw new ApiError(404, "Discussion not found");
    }

    const replies = await Reply.find({ discussionId: discussion._id })
      .sort({ createdAt: 1 })
      .lean();

    res.json({ success: true, data: { ...discussion, replies } });
  } catch (err) {
    next(err);
  }
};
