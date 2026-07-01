/**
 * v1.69 — Enrollment controller.
 *
 * Manages the join between Users and Programs (Batches). Every
 * route in this file is gated by:
 *   - `protect` middleware (user must be signed in)
 *   - the `programScope` middleware on the route (when the URL
 *     carries a batchId)
 *   - an `admin` / `programRole` check at the handler level when
 *     the action is privileged
 *
 * The model is `ProgramEnrollment` — unique on `(userId, batchId)`
 * with `isActive` for soft-remove. Re-enrolling after a
 * soft-delete just flips `isActive` back to true and updates
 * `programRole` / `enrolledAt`.
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import ProgramEnrollment, { IProgramEnrollment, ProgramRole } from './program-enrollment.model.js';
import Batch from './batch.model.js';
import { httpLog } from '../../utils/http/logger.js';
import { z } from 'zod';

const objectId = z.string().refine((s) => Types.ObjectId.isValid(s), 'Invalid ObjectId');

const enrollBody = z.object({
  userId: objectId,
  programRole: z.enum(['student', 'ta', 'moderator', 'mentor', 'program_admin']).default('student'),
});

const roleBody = z.object({
  programRole: z.enum(['student', 'ta', 'moderator', 'mentor', 'program_admin']),
});

// ── User-self routes ─────────────────────────────────────────────────────

/**
 * GET /api/me/programs — list the programs the current user is
 * enrolled in (active enrollments only).
 */
export async function getMyPrograms(req: Request, res: Response): Promise<void> {
  const userId = (req as Request & { user?: { _id?: string } }).user?._id;
  if (!userId) {
    res.status(401).json({ message: 'Authentication required.' });
    return;
  }
  try {
    const enrollments = await ProgramEnrollment.find({ userId, isActive: true })
      .populate('batchId', 'name isActive isDefault startDate endDate')
      .sort({ enrolledAt: -1 })
      .lean();
    res.json({
      enrollments: enrollments.map((e) => ({
        _id: e._id,
        program: e.batchId,
        programRole: e.programRole,
        enrolledAt: e.enrolledAt,
      })),
    });
  } catch (err) {
    httpLog.error(`[enrollment] getMyPrograms failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load your programs.' });
  }
}

/**
 * POST /api/programs/:batchId/self-enroll — current user joins
 * a program themselves. Only allowed if the Batch is in
 * `enrollmentMode: 'open'`. Closed / invite-only programs return
 * 403 with a hint about the invite flow.
 */
export async function selfEnroll(req: Request, res: Response): Promise<void> {
  const userId = (req as Request & { user?: { _id?: string } }).user?._id;
  if (!userId) {
    res.status(401).json({ message: 'Authentication required.' });
    return;
  }
  const programContext = req.programContext;
  if (!programContext) {
    res.status(400).json({ message: 'batchId is required.' });
    return;
  }
  try {
    const batch = await Batch.findById(programContext.batchId).select('enrollmentMode').lean();
    if (!batch) {
      res.status(404).json({ message: 'Program not found.' });
      return;
    }
    if (batch.enrollmentMode && batch.enrollmentMode !== 'open') {
      res.status(403).json({
        message: 'This program is invite-only. Ask an admin for an invite link.',
        enrollmentMode: batch.enrollmentMode,
      });
      return;
    }
    // Idempotent: if a soft-deleted enrollment exists, reactivate.
    // Otherwise create a new one.
    const existing = await ProgramEnrollment.findOne({ userId, batchId: programContext.batchId });
    if (existing) {
      if (existing.isActive) {
        res.status(409).json({ message: 'Already enrolled in this program.' });
        return;
      }
      existing.isActive = true;
      existing.enrolledAt = new Date();
      existing.enrolledBy = null;
      await existing.save();
      res.json({ reactivated: true, enrollment: existing });
      return;
    }
    const created = await ProgramEnrollment.create({
      userId,
      batchId: programContext.batchId,
      programRole: 'student',
      enrolledBy: null,
      isActive: true,
    });
    res.status(201).json({ enrollment: created });
  } catch (err) {
    httpLog.error(`[enrollment] selfEnroll failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to self-enroll.' });
  }
}

// ── Admin routes ──────────────────────────────────────────────────────────

/**
 * GET /api/programs/:batchId/members — admin lists everyone
 * enrolled in a program. Supports an optional ?role= filter.
 */
export async function getProgramMembers(req: Request, res: Response): Promise<void> {
  const programContext = req.programContext;
  if (!programContext) {
    res.status(400).json({ message: 'batchId is required.' });
    return;
  }
  try {
    const filter: Record<string, unknown> = { batchId: programContext.batchId };
    const roleQuery = req.query.role;
    if (typeof roleQuery === 'string' && roleQuery.length > 0) {
      filter.programRole = roleQuery;
    }
    const members = await ProgramEnrollment.find(filter)
      .populate('userId', 'name email role avatar')
      .sort({ enrolledAt: -1 })
      .lean();
    res.json({ members });
  } catch (err) {
    httpLog.error(`[enrollment] getProgramMembers failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load program members.' });
  }
}

/**
 * POST /api/programs/:batchId/members — admin enrolls a user.
 * Idempotent: re-enrolling an inactive row reactivates it.
 */
export async function enrollUser(req: Request, res: Response): Promise<void> {
  const programContext = req.programContext;
  if (!programContext) {
    res.status(400).json({ message: 'batchId is required.' });
    return;
  }
  const parsed = enrollBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid input.', issues: parsed.error.issues });
    return;
  }
  const adminId = (req as Request & { user?: { _id?: string } }).user?._id ?? null;
  try {
    const existing = await ProgramEnrollment.findOne({
      userId: parsed.data.userId,
      batchId: programContext.batchId,
    });
    if (existing) {
      if (existing.isActive) {
        res.status(409).json({ message: 'User is already enrolled in this program.' });
        return;
      }
      existing.isActive = true;
      existing.programRole = parsed.data.programRole;
      existing.enrolledAt = new Date();
      existing.enrolledBy = adminId ? new Types.ObjectId(adminId) : null;
      await existing.save();
      res.json({ reactivated: true, enrollment: existing });
      return;
    }
    const created = await ProgramEnrollment.create({
      userId: new Types.ObjectId(parsed.data.userId),
      batchId: new Types.ObjectId(programContext.batchId),
      programRole: parsed.data.programRole,
      enrolledBy: adminId ? new Types.ObjectId(adminId) : null,
      isActive: true,
    });
    res.status(201).json({ enrollment: created });
  } catch (err) {
    httpLog.error(`[enrollment] enrollUser failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to enroll user.' });
  }
}

/**
 * PATCH /api/programs/:batchId/members/:userId — admin changes
 * a member's program role (student → moderator, etc.).
 */
export async function updateProgramRole(req: Request, res: Response): Promise<void> {
  const programContext = req.programContext;
  const rawUserId = req.params.userId;
  const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
  if (!programContext) {
    res.status(400).json({ message: 'batchId is required.' });
    return;
  }
  if (!userId || !Types.ObjectId.isValid(userId)) {
    res.status(400).json({ message: 'Invalid userId.' });
    return;
  }
  const parsed = roleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid input.', issues: parsed.error.issues });
    return;
  }
  try {
    const enr = await ProgramEnrollment.findOneAndUpdate(
      { userId, batchId: programContext.batchId },
      { $set: { programRole: parsed.data.programRole } },
      { new: true }
    );
    if (!enr) {
      res.status(404).json({ message: 'Enrollment not found.' });
      return;
    }
    res.json(enr);
  } catch (err) {
    httpLog.error(`[enrollment] updateProgramRole failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to update role.' });
  }
}

/**
 * DELETE /api/programs/:batchId/members/:userId — admin removes
 * a member. Soft-delete: flips `isActive` to false; the row stays
 * for audit. Pass ?hard=true to actually delete.
 */
export async function removeEnrollment(req: Request, res: Response): Promise<void> {
  const programContext = req.programContext;
  const rawUserId = req.params.userId;
  const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
  if (!programContext) {
    res.status(400).json({ message: 'batchId is required.' });
    return;
  }
  if (!userId || !Types.ObjectId.isValid(userId)) {
    res.status(400).json({ message: 'Invalid userId.' });
    return;
  }
  const hard = req.query.hard === 'true' || req.query.hard === '1';
  try {
    if (hard) {
      const result = await ProgramEnrollment.findOneAndDelete({
        userId,
        batchId: programContext.batchId,
      });
      if (!result) {
        res.status(404).json({ message: 'Enrollment not found.' });
        return;
      }
      res.json({ deleted: true, hard: true });
      return;
    }
    const result = await ProgramEnrollment.findOneAndUpdate(
      { userId, batchId: programContext.batchId, isActive: true },
      { $set: { isActive: false } },
      { new: true }
    );
    if (!result) {
      res.status(404).json({ message: 'Active enrollment not found.' });
      return;
    }
    res.json({ removed: true, hard: false, enrollment: result });
  } catch (err) {
    httpLog.error(`[enrollment] removeEnrollment failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to remove enrollment.' });
  }
}
