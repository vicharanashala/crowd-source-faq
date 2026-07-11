import { Router, Request, Response } from "express";

// PLACEHOLDER MODULE
// The Admin Dashboard is a separate module in the CSFAQ project. The
// Discussion Forum already exposes its own admin actions directly
// (approve reply / flag discussion) under /api/replies and /api/discussions.
// This router is a stand-in for the broader dashboard (overview stats,
// content moderation queue, user management, etc.) that will live here.

const router = Router();

router.get("/overview", (req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    message: "Admin Dashboard module not implemented yet. Placeholder endpoint.",
  });
});

router.get("/flagged-discussions", (req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    message: "Admin Dashboard module not implemented yet. Placeholder endpoint.",
  });
});

export default router;
