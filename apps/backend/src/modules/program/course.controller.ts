/**
 * v1.69 — Course CRUD.
 *
 * Public list: returns courses in a program (filterable by batchId)
 * with a `faqCount` for each. Admin endpoints mirror the Batch
 * shape (list-all, create, update, archive, delete) so the admin
 * UI can reuse the same patterns.
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import Course from './course.model.js';
import FAQ from '../faq/faq.model.js';
import { httpLog } from '../../utils/http/logger.js';
import { invalidatePublicCaches } from '../faq/public-faq.controller.js';
import { z } from 'zod';

const createCourseSchema = z.object({
  batchId: z.string().min(1).max(100),
  name: z.string().min(2).max(120),
  description: z.string().max(1000).optional().default(''),
  order: z.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
  icon: z.string().max(16).nullable().optional().default(null),
});

const updateCourseSchema = createCourseSchema.partial().omit({ batchId: true });

// ─── Public list (active only, scoped to a program) ─────────────────────────

export async function listPublicCourses(req: Request, res: Response): Promise<void> {
  try {
    const rawBatch = req.query.batchId;
    const raw = Array.isArray(rawBatch) ? rawBatch[0] : rawBatch;
    const batchId = typeof raw === 'string' ? raw : undefined;
    const filter: Record<string, unknown> = { isActive: true };
    if (batchId && Types.ObjectId.isValid(batchId)) {
      filter.batchId = batchId;
    }
    const courses = await Course.aggregate<{
      _id: Types.ObjectId;
      batchId: Types.ObjectId;
      name: string;
      slug: string;
      description: string;
      order: number;
      icon: string | null;
      faqCount: number;
    }>([
      { $match: filter },
      { $sort: { order: 1, name: 1 } },
      {
        $lookup: {
          from: 'yaksha_faq_faqs',
          localField: '_id',
          foreignField: 'courseId',
          as: '_faqs',
        },
      },
      {
        $addFields: {
          faqCount: {
            $size: { $filter: { input: '$_faqs', as: 'f', cond: { $eq: ['$$f.status', 'approved'] } } },
          },
        },
      },
      { $project: { _faqs: 0 } },
    ]);

    res.json({
      courses: courses.map((c) => ({
        _id: c._id,
        batchId: c.batchId,
        name: c.name,
        slug: c.slug,
        description: c.description,
        order: c.order,
        icon: c.icon,
        faqCount: c.faqCount,
      })),
    });
  } catch (err) {
    httpLog.error(`[course] listPublicCourses failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load courses.' });
  }
}

// ─── Admin list (all, with full timestamps) ──────────────────────────────────

export async function listAdminCourses(req: Request, res: Response): Promise<void> {
  try {
    const courses = await Course.find().sort({ batchId: 1, order: 1, name: 1 }).lean();
    res.json({ courses });
  } catch (err) {
    httpLog.error(`[course] listAdminCourses failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load courses.' });
  }
}

// ─── Create ─────────────────────────────────────────────────────────────────

export async function createCourse(req: Request, res: Response): Promise<void> {
  const parsed = createCourseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid input.', issues: parsed.error.issues });
    return;
  }
  const { batchId, name, description, order, isActive, icon } = parsed.data;
  if (!Types.ObjectId.isValid(batchId)) {
    res.status(400).json({ message: 'Invalid batchId.' });
    return;
  }
  try {
    const created = await Course.create({ batchId, name: name.trim(), description, order, isActive, icon });
    invalidatePublicCaches();
    res.status(201).json(created);
  } catch (err) {
    const e = err as Error & { code?: number };
    if (e.code === 11000) {
      res.status(409).json({ message: 'A course with this name already exists in this program.' });
      return;
    }
    httpLog.error(`[course] createCourse failed: ${e.message}`);
    res.status(500).json({ message: 'Failed to create course.' });
  }
}

// ─── Update ─────────────────────────────────────────────────────────────────

export async function updateCourse(req: Request, res: Response): Promise<void> {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid course id.' });
    return;
  }
  const parsed = updateCourseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid input.', issues: parsed.error.issues });
    return;
  }
  try {
    const update: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) update.name = parsed.data.name.trim();
    if (parsed.data.description !== undefined) update.description = parsed.data.description;
    if (parsed.data.order !== undefined) update.order = parsed.data.order;
    if (parsed.data.isActive !== undefined) update.isActive = parsed.data.isActive;
    if (parsed.data.icon !== undefined) update.icon = parsed.data.icon;

    const updated = await Course.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!updated) {
      res.status(404).json({ message: 'Course not found.' });
      return;
    }
    invalidatePublicCaches();
    res.json(updated);
  } catch (err) {
    const e = err as Error & { code?: number };
    if (e.code === 11000) {
      res.status(409).json({ message: 'A course with this name already exists in this program.' });
      return;
    }
    httpLog.error(`[course] updateCourse failed: ${e.message}`);
    res.status(500).json({ message: 'Failed to update course.' });
  }
}

// ─── Archive (soft delete) ──────────────────────────────────────────────────

export async function archiveCourse(req: Request, res: Response): Promise<void> {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid course id.' });
    return;
  }
  try {
    const updated = await Course.findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true });
    if (!updated) {
      res.status(404).json({ message: 'Course not found.' });
      return;
    }
    invalidatePublicCaches();
    res.json(updated);
  } catch (err) {
    httpLog.error(`[course] archiveCourse failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to archive course.' });
  }
}

// ─── Hard delete (cascades FAQs to courseId: null) ──────────────────────────

export async function deleteCourse(req: Request, res: Response): Promise<void> {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid course id.' });
    return;
  }
  try {
    const faqCount = await FAQ.countDocuments({ courseId: id });
    await FAQ.updateMany({ courseId: id }, { $set: { courseId: null } });
    await Course.findByIdAndDelete(id);
    invalidatePublicCaches();
    res.json({ deleted: true, cascadedFaqs: faqCount });
  } catch (err) {
    httpLog.error(`[course] deleteCourse failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to delete course.' });
  }
}
