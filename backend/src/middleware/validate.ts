import { NextFunction, Request, Response } from "express";
import { ApiError } from "./errorHandler";

// Server-side validation mirrors the client-side rules from PRODUCT.md:
// - Title is required
// - Description is required
// - Empty submissions are not allowed
export const validateDiscussionInput = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { title, description } = req.body;

  if (!title || typeof title !== "string" || !title.trim()) {
    return next(new ApiError(400, "Title is required"));
  }

  if (!description || typeof description !== "string" || !description.trim()) {
    return next(new ApiError(400, "Description is required"));
  }

  next();
};

export const validateReplyInput = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { content, authorId } = req.body;

  if (!content || typeof content !== "string" || !content.trim()) {
    return next(new ApiError(400, "Reply content is required"));
  }

  if (!authorId) {
    return next(new ApiError(400, "authorId is required"));
  }

  next();
};
