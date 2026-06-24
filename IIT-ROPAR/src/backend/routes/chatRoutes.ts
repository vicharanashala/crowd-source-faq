import { Router } from "express";
import { chatEndpoint } from "../controllers/chatController.js";

const router = Router();

router.post("/", chatEndpoint);

export default router;
