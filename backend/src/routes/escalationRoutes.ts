import { Router } from "express";

import {
  createEscalation,
  getEscalations,
  getMyEscalations,
  assignEscalation,
  updateEscalationStatus,
  reopenEscalation,
  addInternalNote,
  getAnalytics,
} from "../controllers/escalationController";

const router = Router();

// Create escalation
router.post("/", createEscalation);

// Get all escalations
router.get("/", getEscalations);

// Get current user's escalations
router.get("/my", getMyEscalations);

// Analytics
router.get("/analytics", getAnalytics);

// Assign escalation
router.patch("/:id/assign", assignEscalation);

// Update status
router.patch("/:id/status", updateEscalationStatus);

// Reopen escalation
router.patch("/:id/reopen", reopenEscalation);

// Add internal note
router.post("/:id/notes", addInternalNote);

export default router;