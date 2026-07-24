import { Request, Response } from 'express';
import { Types } from 'mongoose';
import Mentor from './mentor.model.js';
import Project from './project.model.js';
import OnboardingAuditLog from '../program/onboarding-audit-log.model.js';

/**
 * Extract a valid program ObjectId from the request — accepts both
 * body (for write endpoints) and query (for read endpoints). Mirrors
 * the helper used by faq.controller.ts so every program-scoped admin
 * route uses one consistent resolver.
 */
function batchIdFromInput(req: { query: any; body?: any }): string | null {
  const raw = req.body?.batchId ?? req.query?.batchId;
  if (typeof raw !== 'string') return null;
  return Types.ObjectId.isValid(raw) ? raw : null;
}

// GET /admin/mentors
export const getMentors = async (req: Request, res: Response): Promise<void> => {
  try {
    // v1.69 — multi-program scoping: filter mentors by active program
    // unless the caller explicitly passes batchId=all (admins managing
    // across programs). Without this filter, mentors from every
    // program leak into the listing.
    const batchId = batchIdFromInput(req);
    const filter: Record<string, unknown> = { status: { $ne: 'archived' } };
    if (batchId) filter.batchId = new Types.ObjectId(batchId);
    const mentors = await Mentor.find(filter).lean().sort({ name: 1 });

    const mentorsWithCounts = await Promise.all(mentors.map(async (m) => {
      const projectsAssigned = await Project.countDocuments({ mentor: m._id });
      return { ...m, projectsAssigned };
    }));

    res.status(200).json(mentorsWithCounts);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching mentors', error });
  }
};

// GET /admin/mentors/all (includes archived)
export const getAllMentors = async (req: Request, res: Response): Promise<void> => {
  try {
    const batchId = batchIdFromInput(req);
    const filter: Record<string, unknown> = {};
    if (batchId) filter.batchId = new Types.ObjectId(batchId);
    const mentors = await Mentor.find(filter).lean().sort({ status: 1, name: 1 });

    const mentorsWithCounts = await Promise.all(mentors.map(async (m) => {
      const projectsAssigned = await Project.countDocuments({ mentor: m._id });
      return { ...m, projectsAssigned };
    }));

    res.status(200).json(mentorsWithCounts);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching mentors', error });
  }
};

// POST /admin/mentors
export const createMentor = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, designation, bio, profilePicture, officeHours, meetingLink } = req.body;

    if (!name || !email) {
      res.status(400).json({ message: 'name and email are required' });
      return;
    }

    // v1.69 — multi-program scoping: every mentor write requires a
    // valid batchId so mentors live inside a single program.
    const rawBatchId = batchIdFromInput(req);
    if (!rawBatchId) {
      res.status(400).json({ message: 'A valid batchId is required to create a mentor.' });
      return;
    }

    const mentor = new Mentor({
      name, email, designation, bio, profilePicture, officeHours, meetingLink,
      batchId: new Types.ObjectId(rawBatchId),
    });
    await mentor.save();

    // Audit log
    const adminId = (req as any).user?._id;
    if (adminId) {
      await OnboardingAuditLog.create({
        changedBy: adminId,
        entityType: 'mentor',
        entityId: mentor._id,
        action: 'create',
        newValue: { name, email, designation },
      });
    }

    res.status(201).json(mentor);
  } catch (error) {
    // S5-M11 (MEDIUM) fix: previously this returned the raw Mongoose
    // error object — including E11000 duplicate-key paths, validation
    // field-by-field messages, and connection strings. Sanitize the
    // response: log full details server-side, return a generic
    // message to the admin client. Detect duplicate-key specifically
    // and return 409 with a clean message.
    if ((error as any)?.code === 11000) {
      console.warn('[admin-mentor] duplicate email on create:', { email: req.body?.email });
      res.status(409).json({ message: 'A mentor with this email already exists.' });
      return;
    }
    console.error('[admin-mentor] create failed:', (error as Error).message);
    res.status(500).json({ message: 'Server error creating mentor' });
  }
};

// PUT /admin/mentors/:id
export const updateMentor = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, email, designation, bio, profilePicture, officeHours, meetingLink, status } = req.body;

    const mentor = await Mentor.findById(id);
    if (!mentor) {
      res.status(404).json({ message: 'Mentor not found' });
      return;
    }

    const previousValue = { name: mentor.name, email: mentor.email, designation: mentor.designation };

    if (name !== undefined) mentor.name = name;
    if (email !== undefined) mentor.email = email;
    if (designation !== undefined) mentor.designation = designation;
    if (bio !== undefined) mentor.bio = bio;
    if (profilePicture !== undefined) mentor.profilePicture = profilePicture;
    if (officeHours !== undefined) mentor.officeHours = officeHours;
    if (meetingLink !== undefined) mentor.meetingLink = meetingLink;
    if (status !== undefined) mentor.status = status;

    await mentor.save();

    // Audit log
    const adminId = (req as any).user?._id;
    if (adminId) {
      await OnboardingAuditLog.create({
        changedBy: adminId,
        entityType: 'mentor',
        entityId: mentor._id,
        action: 'update',
        previousValue,
        newValue: { name: mentor.name, email: mentor.email, designation: mentor.designation },
      });
    }

    res.status(200).json(mentor);
  } catch (error) {
    res.status(500).json({ message: 'Error updating mentor', error });
  }
};

// PUT /admin/mentors/:id/archive
export const archiveMentor = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const mentor = await Mentor.findById(id);
    if (!mentor) {
      res.status(404).json({ message: 'Mentor not found' });
      return;
    }

    mentor.status = 'archived';
    await mentor.save();

    // Audit log
    const adminId = (req as any).user?._id;
    if (adminId) {
      await OnboardingAuditLog.create({
        changedBy: adminId,
        entityType: 'mentor',
        entityId: mentor._id,
        action: 'archive',
        previousValue: { status: 'active' },
        newValue: { status: 'archived' },
      });
    }

    res.status(200).json({ message: 'Mentor archived', mentor });
  } catch (error) {
    res.status(500).json({ message: 'Error archiving mentor', error });
  }
};
