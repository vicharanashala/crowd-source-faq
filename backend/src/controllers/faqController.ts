import { Request, Response, NextFunction } from "express";
import Faq from "../models/Faq";
import { ApiError } from "../middleware/errorHandler";

// POST /api/faq
export const createFaq = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { question, answer, category, tags } = req.body;

    const faq = await Faq.create({
      question,
      answer,
      category: category || "General",
      tags: tags || [],
    });

    res.status(201).json({
      success: true,
      data: faq,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/faq
export const getFaqs = async (
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

    const faqs = await Faq.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: faqs,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/faq/:id
export const getFaqById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const faq = await Faq.findById(req.params.id).lean();

    if (!faq) {
      throw new ApiError(404, "FAQ not found");
    }

    res.json({
      success: true,
      data: faq,
    });
  } catch (err) {
    next(err);
  }
};

// PUT /api/faq/:id
export const updateFaq = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const faq = await Faq.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    ).lean();

    if (!faq) {
      throw new ApiError(404, "FAQ not found");
    }

    res.json({
      success: true,
      data: faq,
    });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/faq/:id
export const deleteFaq = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const faq = await Faq.findByIdAndDelete(req.params.id).lean();

    if (!faq) {
      throw new ApiError(404, "FAQ not found");
    }

    res.json({
      success: true,
      message: "FAQ deleted successfully",
    });
  } catch (err) {
    next(err);
  }
};