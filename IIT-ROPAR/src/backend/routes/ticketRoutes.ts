import { Router } from "express";
import { getTickets, createTicket, updateTicket } from "../controllers/ticketController.js";
import { authenticateToken, requireAdmin } from "../middleware/authMiddleware.js";

const router = Router();

// Require auth for ticket routes
router.use(authenticateToken);

router.get("/", getTickets);
router.post("/", createTicket);
router.put("/:id", requireAdmin as any, updateTicket);

export default router;
