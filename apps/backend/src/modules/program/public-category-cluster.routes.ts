/**
 * Public-facing endpoint to read a program's category clusters.
 *
 * Mounted at /api/public/category-clusters (no auth). Returns the
 * top clusters for the given batch, sorted by faqCount desc, with
 * `limit` (default 10, max 50) capping the response. The search
 * overlay uses this to render the suggestion pills; the admin tab
 * uses /api/admin/programs/:batchId/category-clusters (which returns
 * the full set with locked/editedByAdmin metadata).
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import mongoose, { Types } from 'mongoose';
import CategoryCluster from './category-cluster.model.js';

const router = Router();

const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down.' },
});

function parseBatchId(raw: unknown): Types.ObjectId | null {
  if (typeof raw !== 'string' || !mongoose.Types.ObjectId.isValid(raw)) return null;
  return new Types.ObjectId(raw);
}

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

router.get('/', readLimiter, async (req, res) => {
  const batchId = parseBatchId(req.query.batchId);
  if (req.query.batchId !== undefined && !batchId) {
    res.status(400).json({ message: 'Invalid batchId.' });
    return;
  }
  const limit = clampInt(req.query.limit, 1, 50, 10);
  if (!batchId) {
    // No batchId: an empty result is correct (the public
    // homepage always has a batch context — this case only
    // happens if a client forgot to pass one, which is a
    // misconfiguration on their end).
    res.json({ clusters: [], total: 0, limit });
    return;
  }
  try {
    const clusters = await CategoryCluster.find({ batchId })
      .select({ canonicalName: 1, aliases: 1, faqCount: 1, lastRefreshedAt: 1 })
      .sort({ faqCount: -1, canonicalName: 1 })
      .limit(limit)
      .lean();
    res.json({
      clusters: clusters.map((c) => ({
        canonicalName: c.canonicalName,
        aliases: c.aliases,
        faqCount: c.faqCount,
        lastRefreshedAt: c.lastRefreshedAt,
      })),
      total: clusters.length,
      limit,
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load clusters.' });
  }
});

export default router;
