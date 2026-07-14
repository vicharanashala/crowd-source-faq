/**
 * adminWebPages.controller — Phase 5.
 *
 * Admin endpoints for managing the WebPage collection that the
 * `webTextSource` retrieval fan-out queries.
 *
 *  - POST   /admin/web-pages    — fetch a URL, extract text, upsert row
 *  - GET    /admin/web-pages    — paginated list (newest fetched first)
 *  - DELETE /admin/web-pages/:id — remove a row
 *
 * All routes are mounted via admin-web-pages.routes.ts with
 * protect + authorize('admin', 'ai_moderator', 'moderator') so only
 * privileged users can mutate the global web index.
 *
 * Errors:
 *   400 — invalid URL or invalid id
 *   404 — id not found
 *   422 — page fetched but has no extractable text
 *   502 — upstream fetch failed (HTTP 4xx/5xx, oversized, non-HTML)
 */
import { Request, Response } from 'express';
import { Types } from 'mongoose';
import WebPage from '../../models/WebPage.js';
import { fetchAndExtract } from '../../services/webFetcher.js';
import { adminLog } from '../../utils/http/logger.js';

function validateUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  try {
    const u = new URL(trimmed);
    if (!/^https?:$/.test(u.protocol)) return null;
    if (!u.hostname) return null;
    return trimmed;
  } catch {
    return null;
  }
}

export const addWebPage = async (req: Request, res: Response): Promise<void> => {
  const url = validateUrl(req.body?.url);
  if (!url) { res.status(400).json({ message: 'valid http(s) url required' }); return; }
  let domain: string;
  try { domain = new URL(url).hostname; } catch { res.status(400).json({ message: 'invalid url' }); return; }

  try {
    const { title, text, statusCode } = await fetchAndExtract(url);
    if (!text || text.length < 20) {
      res.status(422).json({ message: 'page has no extractable text content' });
      return;
    }
    const reviewerId = (() => {
      const id = (req as Request & { user?: { _id?: string | Types.ObjectId } }).user?._id;
      if (!id) return null;
      try { return new Types.ObjectId(String(id)); } catch { return null; }
    })();

    const row = await WebPage.findOneAndUpdate(
      { url },
      {
        $set: {
          url, domain, title: title ?? '', text, statusCode, fetchedAt: new Date(),
          lastFetchError: null,
          // Admin-pasted URLs are pre-approved — the admin already
          // reviewed the URL when pasting it. Auto-discovered rows
          // (source='auto_discovered') default to approved=false and
          // need an explicit PATCH /:id/approve before they surface
          // in the retrieval fan-out.
          approved: true,
        },
        $setOnInsert: { source: 'admin_pasted' as const, createdBy: reviewerId },
      },
      { upsert: true, new: true },
    ).lean();
    adminLog.info(`[webPages] admin added/updated ${url} (${text.length} chars)`);
    res.json({ ok: true, page: row });
  } catch (err) {
    adminLog.warn(`[webPages] fetch failed for ${url}: ${(err as Error).message}`);
    res.status(502).json({ message: 'fetch failed', error: (err as Error).message });
  }
};

export const listWebPages = async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, 100));
  try {
    const [items, total] = await Promise.all([
      WebPage.find().sort({ fetchedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      WebPage.countDocuments(),
    ]);
    res.json({ items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    adminLog.warn(`[webPages] list failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'list failed' });
  }
};

export const deleteWebPage = async (req: Request, res: Response): Promise<void> => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'invalid id' }); return;
  }
  const result = await WebPage.deleteOne({ _id: new Types.ObjectId(id) });
  if (result.deletedCount === 0) {
    res.status(404).json({ message: 'not found' }); return;
  }
  res.json({ ok: true });
};

/**
 * PATCH /admin/web-pages/:id/approve — flip `approved` to true on a row.
 *
 * Phase 8: used to manually promote auto-discovered pages into the
 * retrieval fan-out. Admin-pasted pages are already `approved: true`
 * at insertion time (see addWebPage above), but admin can re-approve
 * after a prior unapprove too.
 *
 * Errors:
 *   400 — id is not a valid Mongo ObjectId
 *   404 — no WebPage row with that id
 */
export const approveWebPage = async (req: Request, res: Response): Promise<void> => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'invalid id' }); return;
  }
  const updated = await WebPage.findByIdAndUpdate(
    id,
    { $set: { approved: true } },
    { new: true },
  ).lean();
  if (!updated) { res.status(404).json({ message: 'not found' }); return; }
  res.json({ ok: true, page: updated });
};

/**
 * PATCH /admin/web-pages/:id/unapprove — flip `approved` to false.
 *
 * Phase 8: de-publishes a row (admin or auto-discovered) from the
 * retrieval fan-out without deleting it. Useful when an approved
 * page later turns out to be low-quality or stale.
 *
 * Errors: same shape as approveWebPage (400 invalid id, 404 missing).
 */
export const unapproveWebPage = async (req: Request, res: Response): Promise<void> => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'invalid id' }); return;
  }
  const updated = await WebPage.findByIdAndUpdate(
    id,
    { $set: { approved: false } },
    { new: true },
  ).lean();
  if (!updated) { res.status(404).json({ message: 'not found' }); return; }
  res.json({ ok: true, page: updated });
};