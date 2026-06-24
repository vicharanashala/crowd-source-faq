import { Request, Response } from "express";
import { prisma } from "../services/db.js";
import { AuthRequest } from "../middleware/authMiddleware.js";

export const getAnswers = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const user = authReq.user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized access" });
      return;
    }

    let answers;
    if (user.role === "Admin") {
      answers = await prisma.communityAnswer.findMany();
    } else {
      // Students should only retrieve their own answers or approved answers
      answers = await prisma.communityAnswer.findMany({
        where: {
          OR: [
            { studentEmail: user.email.toLowerCase() },
            { status: "Approved" }
          ]
        }
      });
    }

    res.json({ success: true, communityAnswers: answers });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createAnswer = async (req: Request, res: Response) => {
  try {
    const { faqId, studentEmail, studentName, answer } = req.body;
    if (!faqId || !studentEmail || !studentName || !answer) {
      res.status(400).json({ error: "FAQ ID, student email, student name, and answer text are required." });
      return;
    }

    const authReq = req as AuthRequest;
    if (authReq.user && authReq.user.role !== "Admin" && authReq.user.email.toLowerCase() !== studentEmail.toLowerCase()) {
      res.status(403).json({ error: "Access denied. Cannot submit community answers on behalf of another user." });
      return;
    }

    const newAnswer = await prisma.communityAnswer.create({
      data: { 
        faqId, 
        studentEmail: studentEmail.toLowerCase(), 
        studentName, 
        answer 
      },
    });
    res.json({ success: true, answer: newAnswer });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const updateAnswerStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const updated = await prisma.communityAnswer.update({
      where: { id },
      data: { status },
    });
    res.json({ success: true, answer: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
