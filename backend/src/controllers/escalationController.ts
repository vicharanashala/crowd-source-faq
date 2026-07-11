import { Request, Response } from "express";
import Escalation from "../models/Escalation";

// POST /api/escalations
export const createEscalation = async (req: Request, res: Response) => {
  try {
    const escalation = await Escalation.create({
      ...req.body,
      submittedBy: "Anonymous User",
      status: "Pending",
      assignedTo: null,
      attachments: [],
      notes: [],
      resolutionNotes: "",
    });

    res.status(201).json({
      success: true,
      data: escalation,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// GET /api/escalations
export const getEscalations = async (_req: Request, res: Response) => {
  try {
    const escalations = await Escalation.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      data: escalations,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET /api/escalations/my
// Temporary implementation until authentication exists.
export const getMyEscalations = async (_req: Request, res: Response) => {
  try {
    const escalations = await Escalation.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      data: escalations,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// PATCH /api/escalations/:id/assign
export const assignEscalation = async (req: Request, res: Response) => {
  try {
    const escalation = await Escalation.findByIdAndUpdate(
      req.params.id,
      {
        assignedTo: req.body.team,
      },
      { new: true }
    );

    if (!escalation) {
      return res.status(404).json({
        success: false,
        message: "Escalation not found",
      });
    }

    res.json({
      success: true,
      data: escalation,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// PATCH /api/escalations/:id/status
export const updateEscalationStatus = async (
  req: Request,
  res: Response
) => {
  try {
    const escalation = await Escalation.findByIdAndUpdate(
      req.params.id,
      {
        status: req.body.status,
        resolutionNotes: req.body.resolutionNotes ?? "",
      },
      { new: true }
    );

    if (!escalation) {
      return res.status(404).json({
        success: false,
        message: "Escalation not found",
      });
    }

    res.json({
      success: true,
      data: escalation,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// PATCH /api/escalations/:id/reopen
export const reopenEscalation = async (_req: Request, res: Response) => {
  try {
    const escalation = await Escalation.findByIdAndUpdate(
      _req.params.id,
      {
        status: "In Progress",
      },
      { new: true }
    );

    if (!escalation) {
      return res.status(404).json({
        success: false,
        message: "Escalation not found",
      });
    }

    res.json({
      success: true,
      data: escalation,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// POST /api/escalations/:id/notes
export const addInternalNote = async (req: Request, res: Response) => {
  try {
    const escalation = await Escalation.findById(req.params.id);

    if (!escalation) {
      return res.status(404).json({
        success: false,
        message: "Escalation not found",
      });
    }

    escalation.notes.push({
      text: req.body.text,
      createdAt: new Date(),
    });

    await escalation.save();

    res.json({
      success: true,
      data: escalation,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET /api/escalations/analytics
export const getAnalytics = async (_req: Request, res: Response) => {
  try {
    const total = await Escalation.countDocuments();

    const pending = await Escalation.countDocuments({
      status: "Pending",
    });

    const inProgress = await Escalation.countDocuments({
      status: "In Progress",
    });

    const resolved = await Escalation.countDocuments({
      status: "Resolved",
    });

    const closed = await Escalation.countDocuments({
      status: "Closed",
    });

    res.json({
      success: true,
      data: {
        total,
        pending,
        inProgress,
        resolved,
        closed,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};