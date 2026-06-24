import { Router } from "express";
import { getNotifications, markAsRead } from "../controllers/notificationController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = Router();

router.use(authenticateToken);

router.get("/", getNotifications);
router.post("/read", markAsRead);

export default router;
