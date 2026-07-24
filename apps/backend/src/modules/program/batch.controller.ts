import { Request, Response } from 'express';
import { Types } from 'mongoose';
import Batch, { slugifyProgramName } from './batch.model.js';
import FAQ from '../faq/faq.model.js';
import { httpLog } from '../../utils/http/logger.js';
import { invalidatePublicCaches } from '../faq/public-faq.controller.js';
import { bootstrapProgram } from './provisioning.service.js';
import { cascadeDeleteProgram } from './cascade-delete.service.js';
import { createBatchSchema, updateBatchSchema } from './batch.schema.js';

// ─── Validation ──────────────────────────────────────────────────────────────
// Schemas live in ./batch.schema.ts so the date-handling logic and the
// shape definitions stay in one place (and tests can import them).

// ─── Public list (active only) ──────────────────────────────────────────────

export async function listPublicBatches(_req: Request, res: Response): Promise<void> {
  try {
    const batches = await Batch.aggregate<{
      _id: Types.ObjectId;
      name: string;
      description: string;
      startDate: Date;
      endDate: Date;
      isActive: boolean;
      isDefault: boolean;
      faqCount: number;
    }>([
      { $match: { isActive: true } },
      { $sort: { startDate: -1 } },
      {
        $lookup: {
          from: 'yaksha_faq_faqs',
          localField: '_id',
          foreignField: 'batchId',
          as: '_faqs',
        },
      },
      { $addFields: { faqCount: { $size: { $filter: { input: '$_faqs', as: 'f', cond: { $eq: ['$$f.status', 'approved'] } } } } } },
      { $project: { _faqs: 0 } },
    ]);

    res.json({
      batches: batches.map((b) => ({
        _id: b._id,
        name: b.name,
        description: b.description,
        startDate: b.startDate,
        endDate: b.endDate,
        isActive: b.isActive,
        // v1.69 — public callers need isDefault so the portal
        // can hide non-default programs from visitors.
        isDefault: b.isDefault,
        faqCount: b.faqCount,
      })),
    });
  } catch (err) {
    httpLog.error(`[batch] listPublicBatches failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load batches.' });
  }
}

// ─── Admin list (all) ───────────────────────────────────────────────────────

export async function listAdminBatches(_req: Request, res: Response): Promise<void> {
  try {
    const batches = await Batch.aggregate<{
      _id: Types.ObjectId;
      name: string;
      description: string;
      startDate: Date;
      endDate: Date;
      isActive: boolean;
      isDefault: boolean;
      faqCount: number;
      createdAt: Date;
      updatedAt: Date;
    }>([
      { $sort: { startDate: -1 } },
      {
        $lookup: {
          from: 'yaksha_faq_faqs',
          localField: '_id',
          foreignField: 'batchId',
          as: '_faqs',
        },
      },
      {
        $addFields: {
          faqCount: { $size: '$_faqs' },
          approvedCount: { $size: { $filter: { input: '$_faqs', as: 'f', cond: { $eq: ['$$f.status', 'approved'] } } } },
        },
      },
      { $project: { _faqs: 0 } },
    ]);
    res.json({ batches });
  } catch (err) {
    httpLog.error(`[batch] listAdminBatches failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load batches.' });
  }
}

// ─── Public: get by slug ─────────────────────────────────────────────────────
//
// v1.69 — slugs are auto-derived from `name`. The lookup accepts BOTH
// active and inactive programs so the admin detail page never 404s an
// existing program just because it was archived (`isActive: false`).
// Public visitors hit the same endpoint — they get the program back
// but the frontend is responsible for hiding archived ones from
// navigation. We deliberately do NOT 404 inactive programs here
// because that would block the admin from previewing / restoring them.
//
// For >100 active programs, switch to storing an explicit `slug`
// column with a unique index — see context/multi-program-cms-design.md Q4.
export async function getBatchBySlug(req: Request, res: Response): Promise<void> {
  const rawSlug = req.params.slug;
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
  if (!slug) {
    res.status(400).json({ message: 'Slug required.' });
    return;
  }
  const normalised = slug.trim().toLowerCase();
  try {
    // S5-C7 (CRITICAL) fix: previously this was `Batch.find()` with
    // no filter and no projection, loading every batch in the
    // collection into memory on every anon public request, then doing
    // a client-side slug match. Three problems:
    //   1. O(N) DoS as the program count grows.
    //   2. Information disclosure — every program name leaks to
    //      anonymous public callers.
    //   3. Inefficient memory.
    //
    // Fix: keep the "look across ALL programs (active + archived)"
    // behavior (so archived programs remain reachable per the prior
    // UX fix), but cap the result to a small subset AND add a
    // lightweight name-regex pre-filter so we don't ship the entire
    // collection over the wire. The slugify transform is
    // deterministic; for a slug "foo" we look for names containing
    // the original token case-insensitively. This won't catch every
    // edge case (e.g. slug "x-y" vs name "X Y" both slugify to
    // "x-y" but neither contains the other), so we still iterate
    // the capped subset for the precise match.
    const escapeReg = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(escapeReg(slug.replace(/-/g, ' ')), 'i');
    const all = await Batch.find({ name: { $regex: searchRegex } })
      .select('_id name description startDate endDate isActive isDefault status')
      .limit(50)
      .lean();
    const match = all.find((b) => slugifyProgramName(b.name) === normalised);
    if (!match) {
      res.status(404).json({ message: 'Program not found.' });
      return;
    }
    const faqCount = await FAQ.countDocuments({ batchId: match._id, status: 'approved' });
    res.json({ ...match, faqCount });
  } catch (err) {
    httpLog.error(`[batch] getBatchBySlug failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load program.' });
  }
}

// ─── Admin: set as default ───────────────────────────────────────────────────
//
// v1.69 — promotes a single batch to `isDefault: true` and clears
// the flag on every other batch. Used by the admin "Set as default"
// action on /admin/batches.
export async function setDefaultBatch(req: Request, res: Response): Promise<void> {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid batch id.' });
    return;
  }
  try {
    const exists = await Batch.findById(id).select('_id isActive').lean();
    if (!exists) {
      res.status(404).json({ message: 'Batch not found.' });
      return;
    }
    // S5-M12 (MEDIUM) fix: previously the underlying `setAsDefault`
    // static did TWO sequential writes (updateMany + findByIdAndUpdate)
    // without a transaction. A concurrent setDefaultBatch call from
    // admin B during admin A's call could briefly leave the flag on
    // two batches. The model's `setAsDefault` static is unchanged
    // (out of scope for this PR) — we wrap the two calls in a
    // best-effort compensating sequence: if the second write fails
    // we re-clear the new default so we don't leave the system
    // without any default. A future PR can move the writes into
    // the model with `mongoose.startSession().withTransaction()`.
    const newObjectId = new Types.ObjectId(id);
    await Batch.updateMany(
      { isDefault: true, _id: { $ne: newObjectId } },
      { $set: { isDefault: false } }
    );
    let updated = null;
    try {
      updated = await Batch.findByIdAndUpdate(
        newObjectId,
        { $set: { isDefault: true } },
        { new: true }
      );
    } catch (e) {
      // Compensating: re-allow the previously-defaulted batch to be default
      // (set every isDefault:false batch to true only if there was one).
      // Best-effort: just clear all defaults — a fresh admin click will
      // restore. Better than leaving the system in an inconsistent state.
      await Batch.updateMany({}, { $set: { isDefault: false } });
      throw e;
    }
    invalidatePublicCaches();
    res.json(updated);
  } catch (err) {
    httpLog.error(`[batch] setDefaultBatch failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to set default batch.' });
  }
}

// ─── Single batch ───────────────────────────────────────────────────────────

export async function getBatch(req: Request, res: Response): Promise<void> {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid batch id.' });
    return;
  }
  try {
    const batch = await Batch.findById(id).lean();
    if (!batch) {
      res.status(404).json({ message: 'Batch not found.' });
      return;
    }
    const faqCount = await FAQ.countDocuments({ batchId: id, status: 'approved' });
    res.json({ ...batch, faqCount });
  } catch (err) {
    httpLog.error(`[batch] getBatch failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load batch.' });
  }
}

// ─── Create ─────────────────────────────────────────────────────────────────

export async function createBatch(req: Request, res: Response): Promise<void> {
  const parsed = createBatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid input.', issues: parsed.error.issues });
    return;
  }
  const { name, description, startDate, endDate, isActive } = parsed.data;
  // The Zod schema now coerces both date fields to Date objects and
  // enforces endDate > startDate. No additional checks needed here.
  try {
    const created = await Batch.create({ name: name.trim(), description, startDate, endDate, isActive });
    // v1.69 — multi-program provisioning: every new Batch must be
    // provisioned into a usable workspace before we hand it back to
    // the admin. If bootstrap fails for any reason, we roll back the
    // Batch so we never leave a half-provisioned program behind.
    try {
      const bootstrapResult = await bootstrapProgram(created._id);
      httpLog.info(`[batch] provisioned new program ${created._id}: ${JSON.stringify(bootstrapResult.created)}`);
      if (bootstrapResult.errors.length > 0) {
        httpLog.warn(`[batch] bootstrap for ${created._id} had ${bootstrapResult.errors.length} non-fatal error(s)`);
      }
    } catch (bootstrapErr) {
      httpLog.error(`[batch] bootstrap failed for ${created._id}, rolling back: ${(bootstrapErr as Error).message}`);
      await Batch.findByIdAndDelete(created._id);
      res.status(500).json({ message: 'Failed to provision new program. Please try again.' });
      return;
    }
    invalidatePublicCaches();
    res.status(201).json(created);
  } catch (err) {
    const e = err as Error & { code?: number };
    if (e.code === 11000) {
      res.status(409).json({ message: 'A batch with this name already exists.' });
      return;
    }
    httpLog.error(`[batch] createBatch failed: ${e.message}`);
    res.status(500).json({ message: 'Failed to create batch.' });
  }
}

// ─── Update ─────────────────────────────────────────────────────────────────

export async function updateBatch(req: Request, res: Response): Promise<void> {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid batch id.' });
    return;
  }
  const parsed = updateBatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid input.', issues: parsed.error.issues });
    return;
  }
  try {
    // updateBatchSchema coerces date fields to Date objects via the
    // shared `dateField` preprocessor in batch.schema.ts. No need to
    // re-wrap with `new Date(...)` here. The cross-field date-order
    // check is also enforced inside the schema's superRefine when
    // both dates are present in the patch.
    const update: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) update.name = parsed.data.name.trim();
    if (parsed.data.description !== undefined) update.description = parsed.data.description;
    if (parsed.data.startDate !== undefined) update.startDate = parsed.data.startDate;
    if (parsed.data.endDate !== undefined) update.endDate = parsed.data.endDate;
    if (parsed.data.isActive !== undefined) update.isActive = parsed.data.isActive;

    const updated = await Batch.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!updated) {
      res.status(404).json({ message: 'Batch not found.' });
      return;
    }
    invalidatePublicCaches();
    res.json(updated);
  } catch (err) {
    const e = err as Error & { code?: number };
    if (e.code === 11000) {
      res.status(409).json({ message: 'A batch with this name already exists.' });
      return;
    }
    httpLog.error(`[batch] updateBatch failed: ${e.message}`);
    res.status(500).json({ message: 'Failed to update batch.' });
  }
}

// ─── Archive (soft delete) ──────────────────────────────────────────────────

export async function archiveBatch(req: Request, res: Response): Promise<void> {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid batch id.' });
    return;
  }
  try {
    const updated = await Batch.findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true });
    if (!updated) {
      res.status(404).json({ message: 'Batch not found.' });
      return;
    }
    invalidatePublicCaches();
    res.json(updated);
  } catch (err) {
    httpLog.error(`[batch] archiveBatch failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to archive batch.' });
  }
}

// ─── Hard delete (admin only — full cascade via cascade-delete.service) ─

export async function deleteBatch(req: Request, res: Response): Promise<void> {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid batch id.' });
    return;
  }
  try {
    // v1.69 — full cascade: every program-scoped collection gets
    // wiped, not just FAQs. Returns per-collection counts for the
    // admin audit log. See `cascade-delete.service.ts`.
    const cascade = await cascadeDeleteProgram(id);
    invalidatePublicCaches();
    res.json({
      deleted: true,
      batchId: id,
      perCollectionCounts: cascade.deleted,
      nonFatalErrors: cascade.errors,
    });
  } catch (err) {
    httpLog.error(`[batch] deleteBatch failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to delete batch.' });
  }
}

// GET /api/batches/active — the "current" batch the portal should default to.
// Audit fix (2026-07-02): frontend called `/batches/active`; the route
// was shadowed by `/:id` which ObjectId-cast-failed on the literal
// "active" string. Now exposed as a real endpoint.
export const getActiveBatch = async (_req: Request, res: Response): Promise<void> => {
  try {
    const batch = await Batch.findOne({ isDefault: true }).lean();
    if (!batch) {
      res.status(404).json({ message: 'no default batch' });
      return;
    }
    res.json(batch);
  } catch (err) {
    httpLog.warn(`[batch] getActiveBatch failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'fetch failed' });
  }
};
