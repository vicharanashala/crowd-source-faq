import { Router } from "express";
import { getAnswers, createAnswer, updateAnswerStatus } from "../controllers/communityAnswerController.js";
import { authenticateToken, requireAdmin } from "../middleware/authMiddleware.js";

const router = Router();

router.use(authenticateToken);

router.get("/", getAnswers);
router.post("/", createAnswer);
router.put("/:id/status", requireAdmin as any, updateAnswerStatus);

export default router;
