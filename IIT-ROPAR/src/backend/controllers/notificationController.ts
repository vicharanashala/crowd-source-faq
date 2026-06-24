import { Request, Response } from "express";
import { prisma } from "../services/db.js";
import { AuthRequest } from "../middleware/authMiddleware.js";

export const getNotifications = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const user = authReq.user;
    const { email } = req.query;

    if (!user) {
      res.status(401).json({ error: "Unauthorized access" });
      return;
    }

    if (user.role !== "Admin") {
      if (!email || String(email).toLowerCase() !== user.email.toLowerCase()) {
        res.status(403).json({ error: "Access denied. Students can only retrieve their own notifications." });
        return;
      }
    }

    const notifications = await prisma.notification.findMany({
      where: {
        OR: [
          { email: email ? String(email).toLowerCase() : "all" },
          { email: "all" }
        ],
        isRead: false
      }
    });
    res.json({ success: true, notifications });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const markAsRead = async (req: Request, res: Response) => {
  try {
    const { id } = req.body;
    if (!id) {
      res.status(400).json({ error: "Notification ID is required." });
      return;
    }

    const authReq = req as AuthRequest;
    const user = authReq.user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized access" });
      return;
    }

    const notif = await prisma.notification.findUnique({ where: { id } });
    if (!notif) {
      res.status(404).json({ error: "Notification not found." });
      return;
    }

    if (user.role !== "Admin" && notif.email.toLowerCase() !== user.email.toLowerCase() && notif.email.toLowerCase() !== "all") {
      res.status(403).json({ error: "Access denied. Cannot dismiss other users' notifications." });
      return;
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
    res.json({ success: true, notification: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
