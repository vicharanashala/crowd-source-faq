import { Request, Response } from "express";
import { prisma } from "../services/db.js";
import { AuthRequest } from "../middleware/authMiddleware.js";

export const getTickets = async (req: Request, res: Response): Promise<void> => {
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
        res.status(403).json({ error: "Access denied. Students can only retrieve their own tickets." });
        return;
      }
    }

    if (email) {
      const studentTickets = await prisma.ticket.findMany({
        where: { studentEmail: String(email).toLowerCase() },
        orderBy: { createdAt: "desc" }
      });
      res.json({ success: true, tickets: studentTickets });
      return;
    }
    const allTickets = await prisma.ticket.findMany({ orderBy: { createdAt: "desc" } });
    res.json({ success: true, tickets: allTickets });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createTicket = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, category, description, priority, studentEmail, studentName, attachmentName } = req.body;
    if (!title || !category || !description || !priority || !studentEmail || !studentName) {
      res.status(400).json({ error: "Title, Category, Description, and Priority are required." });
      return;
    }

    const authReq = req as AuthRequest;
    if (authReq.user && authReq.user.role !== "Admin" && authReq.user.email.toLowerCase() !== studentEmail.toLowerCase()) {
      res.status(403).json({ error: "Access denied. Cannot create a ticket on behalf of another user." });
      return;
    }

    const newTicket = await prisma.ticket.create({
      data: {
        title,
        category,
        description,
        priority,
        status: "Open",
        studentEmail: studentEmail.toLowerCase(),
        studentName,
        attachmentName
      }
    });

    await prisma.mailLog.create({
      data: {
        to: "support@iitr.ac.in",
        subject: `NEW VICHARANASHALA TICKET OUTSTANDING: ${newTicket.id}`,
        body: `A new support ticket has been raised!\n\nTicket ID: ${newTicket.id}\nStudent: ${studentName}\nTitle: ${title}`,
        status: "DELIVERED (Nodemailer Sim Dispatch)"
      }
    });

    await prisma.notification.create({
      data: {
        email: studentEmail.toLowerCase(),
        text: `Your ticket ${newTicket.id} has been successfully raised. Current status: 'Open'.`,
        type: "success"
      }
    });

    res.status(201).json({ success: true, ticket: newTicket });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const updateTicket = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) {
      res.status(400).json({ error: "Ticket status is required for moderation." });
      return;
    }

    const ticket = await prisma.ticket.update({
      where: { id },
      data: { status }
    });

    await prisma.notification.create({
      data: {
        email: ticket.studentEmail,
        text: `Your Support Ticket ${ticket.id} has been updated to: '${status}'.`,
        type: status === "Resolved" ? "success" : "info"
      }
    });

    res.json({ success: true, ticket });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
