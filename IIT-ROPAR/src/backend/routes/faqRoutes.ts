import { Router } from "express";
import { getFaqs, translateFaq, createFaq, deleteFaq } from "../controllers/faqController.js";
import { authenticateToken, requireAdmin } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/", getFaqs);
router.post("/translate", translateFaq);
router.post("/", authenticateToken as any, requireAdmin as any, createFaq);
router.delete("/:id", authenticateToken as any, requireAdmin as any, deleteFaq);

export default router;
