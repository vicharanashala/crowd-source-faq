/**
 * adminCategoryClusterController — admin-facing CRUD for the
 * Dynamic Categories tab.
 *
 * Endpoints (mounted at /api/admin/programs/:batchId/category-clusters):
 *   GET    /            — list clusters (sorted by faqCount desc)
 *   GET    /:id         — get one cluster
 *   PATCH  /:id         — rename canonicalName, edit aliases, toggle lock
 *   DELETE /:id         — delete a cluster (locked rows are protected)
 *   POST   /recompute   — force a refresh now (admin-only; runs the
 *                         same path as the 24h cron)
 *
 * Auth: all endpoints require protect + authorize('admin','moderator').
 * The per-program scope is enforced by the :batchId in the URL.
 */
import type { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import CategoryCluster, { type ICategoryCluster } from './category-cluster.model.js';
import { clusterCategoriesForBatch } from '../../utils/ai/categoryClusterer.js';
import { logger } from '../../utils/http/logger.js';

function isValidObjectId(s: string): boolean {
  return mongoose.Types.ObjectId.isValid(s) && String(new mongoose.Types.ObjectId(s)) === s;
}

function parseBatchId(raw: unknown): Types.ObjectId | null {
  if (typeof raw !== 'string' || !isValidObjectId(raw)) return null;
  return new Types.ObjectId(raw);
}

function shapeCluster(c: ICategoryCluster): Record<string, unknown> {
  return {
    id: String(c._id),
    batchId: String(c.batchId),
    canonicalName: c.canonicalName,
    aliases: c.aliases,
    faqCount: c.faqCount,
    locked: c.locked,
    editedByAdmin: c.editedByAdmin,
    lastRefreshedAt: c.lastRefreshedAt,
    updatedAt: c.updatedAt,
  };
}

export async function listClusters(req: Request, res: Response): Promise<void> {
  const batchId = parseBatchId(req.params.batchId);
  if (!batchId) {
    res.status(400).json({ message: 'Invalid batchId.' });
    return;
  }
  try {
    const clusters = await CategoryCluster.find({ batchId })
      .sort({ faqCount: -1, canonicalName: 1 })
      .lean<Array<ICategoryCluster & { _id: Types.ObjectId }>>();
    res.json({
      clusters: clusters.map((c) => ({
        ...c,
        id: String(c._id),
        batchId: String(c.batchId),
      })),
      total: clusters.length,
    });
  } catch (err) {
    logger.error(`[adminCategoryCluster] list failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load clusters.' });
  }
}

export async function getCluster(req: Request, res: Response): Promise<void> {
  const batchId = parseBatchId(req.params.batchId);
  const id = parseBatchId(req.params.id);
  if (!batchId || !id) {
    res.status(400).json({ message: 'Invalid batchId or cluster id.' });
    return;
  }
  try {
    const cluster = await CategoryCluster.findOne({ _id: id, batchId }).lean();
    if (!cluster) {
      res.status(404).json({ message: 'Cluster not found.' });
      return;
    }
    res.json({ ...cluster, id: String(cluster._id), batchId: String(cluster.batchId) });
  } catch (err) {
    logger.error(`[adminCategoryCluster] get failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load cluster.' });
  }
}

export async function updateCluster(req: Request, res: Response): Promise<void> {
  const batchId = parseBatchId(req.params.batchId);
  const id = parseBatchId(req.params.id);
  if (!batchId || !id) {
    res.status(400).json({ message: 'Invalid batchId or cluster id.' });
    return;
  }
  const { canonicalName, aliases, locked } = req.body as {
    canonicalName?: string;
    aliases?: string[];
    locked?: boolean;
  };
  const update: Record<string, unknown> = { editedByAdmin: true };
  if (typeof canonicalName === 'string' && canonicalName.trim().length > 0) {
    update.canonicalName = canonicalName.trim().slice(0, 120);
  }
  if (Array.isArray(aliases) && aliases.every((a) => typeof a === 'string') && aliases.length > 0) {
    update.aliases = Array.from(new Set(aliases.map((a) => a.trim()).filter(Boolean)));
  }
  if (typeof locked === 'boolean') {
    update.locked = locked;
  }
  if (Object.keys(update).length === 1 /* just editedByAdmin */) {
    res.status(400).json({ message: 'No editable fields provided.' });
    return;
  }
  try {
    const updated = await CategoryCluster.findOneAndUpdate(
      { _id: id, batchId },
      { $set: update },
      { new: true }
    ).lean();
    if (!updated) {
      res.status(404).json({ message: 'Cluster not found.' });
      return;
    }
    res.json(shapeCluster(updated as unknown as ICategoryCluster));
  } catch (err) {
    logger.error(`[adminCategoryCluster] update failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to update cluster.' });
  }
}

export async function deleteCluster(req: Request, res: Response): Promise<void> {
  const batchId = parseBatchId(req.params.batchId);
  const id = parseBatchId(req.params.id);
  if (!batchId || !id) {
    res.status(400).json({ message: 'Invalid batchId or cluster id.' });
    return;
  }
  try {
    // Refuse to delete a locked cluster. The admin must
    // explicitly unlock it first (PATCH locked:false) and then
    // delete. This is the safety net for "I edited this
    // canonical name and now it's gone."
    const existing = await CategoryCluster.findOne({ _id: id, batchId }).select('locked').lean();
    if (!existing) {
      res.status(404).json({ message: 'Cluster not found.' });
      return;
    }
    if (existing.locked) {
      res.status(409).json({ message: 'Cluster is locked. Unlock it before deleting.' });
      return;
    }
    await CategoryCluster.deleteOne({ _id: id, batchId });
    res.json({ ok: true, deleted: String(id) });
  } catch (err) {
    logger.error(`[adminCategoryCluster] delete failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to delete cluster.' });
  }
}

export async function recomputeClusters(req: Request, res: Response): Promise<void> {
  const batchId = parseBatchId(req.params.batchId);
  if (!batchId) {
    res.status(400).json({ message: 'Invalid batchId.' });
    return;
  }
  try {
    const result = await clusterCategoriesForBatch(String(batchId));
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error(`[adminCategoryCluster] recompute failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Recompute failed.' });
  }
}
