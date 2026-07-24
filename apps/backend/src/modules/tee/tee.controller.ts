/**
 * tee.controller.ts — Sign My Tee (v2)
 *
 * Endpoints:
 *   GET    /api/tee/me                       → my tee or null
 *   POST   /api/tee/me                       → upsert config
 *   GET    /api/tee/me/eligibility            → navbar pill check
 *   GET    /api/tee/me/signed-by-me          → tees this user has signed
 *   GET    /api/tee/share/:shareId           → public share lookup
 *   POST   /api/tee/share/:shareId/sign      → add a signature
 *   PATCH  /api/tee/share/:shareId/sign/:sigId → move/resize a signature (owner only)
 *   DELETE /api/tee/share/:shareId/sign/:sigId → remove a signature (owner only)
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import Tee from './tee.model.js';
import User from '../auth/user.model.js';
import { logger } from '../../utils/http/logger.js';
import {
  teeConfigSchema,
  teeSignatureSchema,
  teeSignaturePositionSchema,
} from './tee.validation.js';
import { isEligibleForTee } from './eligibility.js';
import { publicBasePath, publicAssetUrl } from '../../utils/publicBasePath.js';
import { uploadSignatureToCloudinary } from '../../integrations/cloudinary/cloudinary.js';

// ─── View counter dedupe ───────────────────────────────────────────────────
//
// `viewCount` is a "people who looked at this tee" number. Naively
// `$inc`-ing on every GET would inflate it to "page loads", not
// people — every curl, every middleware re-fetch, every owner reload
// would tick once. So we dedupe per (teeshareId, ip+ua) pair with a
// short rolling cooldown, and explicitly skip the increment when the
// viewer is the owner themselves (they already know it's their tee).
//
// This is process-local — fine for a small dev server. Production
// would lift this into Redis; until then the dedupe map gets pruned
// on a 60-second sweep so it doesn't grow unbounded.
const VIEW_DEDUPE = new Map<string, number>(); // key → last-seen-ms

// Test-only helper so unit tests can reset the dedupe map between
// cases. Not exported anywhere — guarded with a `process.env.NODE_ENV
// !== 'production'` check so it's only callable in dev/test runs.
export function _resetTeeViewDedup(): void {
  if (process.env.NODE_ENV === 'production') return;
  VIEW_DEDUPE.clear();
}
const VIEW_COOLDOWN_MS = 60_000; // 1 minute — distinct viewers per minute
const VIEW_KEY_PREFIX = 'tee-view:';
const VIEW_SWEEP_INTERVAL_MS = 60_000;

function viewerKey(teeShareId: string, ip: string, ua: string): string {
  // Stable, opaque — never logged. Keys combine shareId so two tees
  // don't share a dedupe slot.
  return `${VIEW_KEY_PREFIX}${teeShareId}:${ip}:${ua}`;
}

function recentSeen(key: string, now: number): boolean {
  const last = VIEW_DEDUPE.get(key);
  if (last == null) return false;
  return now - last < VIEW_COOLDOWN_MS;
}

function markSeen(key: string, now: number): void {
  VIEW_DEDUPE.set(key, now);
}

// Periodic prune so the map doesn't grow forever. We store the
// timer at module level so it's cleared on hot reload in dev.
declare global {
  // eslint-disable-next-line no-var
  var __teeViewSweep: ReturnType<typeof setInterval> | undefined;
}
if (!globalThis.__teeViewSweep) {
  globalThis.__teeViewSweep = setInterval(() => {
    const now = Date.now();
    for (const [key, t] of VIEW_DEDUPE.entries()) {
      if (now - t > VIEW_COOLDOWN_MS * 5) VIEW_DEDUPE.delete(key);
    }
  }, VIEW_SWEEP_INTERVAL_MS);
}

// v1.87.3 — `shouldCountView` decides whether a request bumps the
// view counter. Three guard rails:
//   1. Viewer is NOT the tee owner (no self-views)
//   2. Same IP+UA hasn't already counted in the last minute
//      (dedupes refreshes + the share-button refetch + curl smoke tests)
//   3. There IS at least an IP+UA — missing/empty means a bot or
//      internal probe; we still skip those.
//
// `shareId` is included so two different tees don't share a dedupe
// slot (otherwise a refresh-with-two-tabs on two tees would only
// count once for one of them).
// Exported for unit testing — keeps the dedupe contract pinned in CI.
// See apps/backend/src/__tests__/tee.test.ts.
export function shouldCountView(req: Request, shareId: string, ownerId: unknown): boolean {
  // 1. The owner's own sessions should not inflate their own count.
  if (req.user && String((req.user as any)._id) === String(ownerId)) return false;
  const ip =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
    (req as any).ip ||
    (req.socket as any)?.remoteAddress ||
    '';
  const ua = (req.headers['user-agent'] as string | undefined) || '';
  if (!ip && !ua) return false;
  const now = Date.now();
  const key = viewerKey(shareId, ip, ua);
  if (recentSeen(key, now)) return false;
  markSeen(key, now);
  return true;
}

const SIGNATURES_DIR = path.resolve(process.cwd(), 'uploads', 'tee-signatures');

async function writeSignatureToDisk(
  ownerId: string,
  sigId: string,
  dataUrl: string,
): Promise<string> {
  const base64 = dataUrl.split(',')[1];
  if (!base64) throw new Error('Invalid data URL');
  const buffer = Buffer.from(base64, 'base64');
  const dir = path.join(SIGNATURES_DIR, ownerId);
  await fs.mkdir(dir, { recursive: true });
  const filename = `${sigId}.webp`;
  const filepath = path.join(dir, filename);
  await sharp(buffer).webp({ quality: 85 }).toFile(filepath);
  return filename;
}

// ─── Eligibility (navbar) ─────────────────────────────────────────────────────

export const getMyEligibility = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: 'Not authorized.' });
    return;
  }
  try {
    const user = await User.findById(req.user._id).select('internshipEndDate').lean();
    const hasEndDate = !!(user && (user as any).internshipEndDate);
    const endDate: Date | null = hasEndDate ? new Date((user as any).internshipEndDate) : null;
    const eligible = hasEndDate ? isEligibleForTee(new Date(), endDate) : false;
    const configuredTee = await Tee.findOne({ ownerId: req.user._id }).select('shareId').lean();
    res.status(200).json({
      eligible,
      endDate: endDate ? endDate.toISOString() : null,
      hasConfiguredTee: !!configuredTee,
      requiresInternshipEndDate: !hasEndDate,
      shareId: configuredTee?.shareId ?? null,
    });
  } catch (err) {
    logger.error('[tee] getMyEligibility failed', { error: (err as Error).message });
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── My tee (read / write) ────────────────────────────────────────────────────

export const getMyTee = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: 'Not authorized.' });
    return;
  }
  try {
    const tee = await Tee.findOne({ ownerId: req.user._id }).lean();
    if (!tee) {
      res.status(200).json({ tee: null });
      return;
    }
    res.status(200).json({ tee });
  } catch (err) {
    logger.error('[tee] getMyTee failed', { error: (err as Error).message });
    res.status(500).json({ message: 'Server error' });
  }
};

export const upsertMyTee = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: 'Not authorized.' });
    return;
  }
  const parsed = teeConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Validation failed', errors: parsed.error.issues });
    return;
  }
  try {
    const existing = await Tee.findOne({ ownerId: req.user._id }).select('shareId').lean();
    const shareId = existing?.shareId ?? uuidv4();

    const tee = await Tee.findOneAndUpdate(
      { ownerId: req.user._id },
      {
        $set: {
          ...parsed.data,
          shareId,
        },
        $setOnInsert: { ownerId: req.user._id },
      },
      { new: true, upsert: true, runValidators: true },
    );
    res.status(200).json({ tee });
  } catch (err) {
    logger.error('[tee] upsertMyTee failed', { error: (err as Error).message });
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── Tees this user has signed ───────────────────────────────────────────────

export const getSignedByMe = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: 'Not authorized.' });
    return;
  }
  try {
    // Find all tees that have at least one signature by this user.
    const tees = await Tee.find({
      'signatures.signerUserId': req.user._id,
    })
      .select('shareId shirtColor textColor nameOnBack ownerId signatures')
      .lean();

    // For each tee, attach the owner's public name and only this
    // user's own signatures (to avoid leaking other people's data).
    const ownerIds = [...new Set(tees.map((t) => String(t.ownerId)))];
    const owners = await User.find({ _id: { $in: ownerIds } })
      .select('name avatar')
      .lean();
    const ownerMap = Object.fromEntries(owners.map((o) => [String((o as any)._id), o]));

    const result = tees.map((t) => {
      const mySigs = (t.signatures as any[]).filter(
        (s) => String(s.signerUserId) === String(req.user!._id),
      );
      const owner = ownerMap[String(t.ownerId)];
      return {
        shareId: t.shareId,
        shirtColor: t.shirtColor,
        textColor: t.textColor,
        nameOnBack: t.nameOnBack,
        owner: owner
          ? { name: (owner as any).name, avatar: (owner as any).avatar ?? null }
          : null,
        mySignatures: mySigs.map((s: any) => ({
          id: String(s._id),
          signerDataUrl: s.signerDataUrl,
          face: s.face ?? 'back',
          x: s.x, y: s.y, scale: s.scale, rotation: s.rotation,
          createdAt: s.createdAt,
        })),
      };
    });

    res.status(200).json({ tees: result });
  } catch (err) {
    logger.error('[tee] getSignedByMe failed', { error: (err as Error).message });
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── Public share / signing ──────────────────────────────────────────────────

export const getSharedTee = async (req: Request, res: Response): Promise<void> => {
  try {
    const shareId = String(req.params.shareId || '');
    if (!shareId) {
      res.status(400).json({ message: 'shareId is required' });
      return;
    }
    const tee = await Tee.findOne({ shareId }).lean();
    if (!tee) {
      res.status(404).json({ message: 'Tee not found' });
      return;
    }
    // Increment the view counter only when a real distinct viewer
    // loads the share (dedupe + owner-skip — see `shouldCountView`).
    // Without this, every refresh / curl / middleware re-fetch
    // would tick it once and the number drifts into nonsense.
    //
    // v1.87.3 — atomic increment-with-return so the response we
    // send to the FE carries the post-bump counter even on rapid
    // refreshes. `findOneAndUpdate` with `$inc` + `new: true`
    // returns the doc AFTER applying the increment; we then merge
    // any non-counter fields from the doc the read already gave us
    // (so we don't lose data written between the two calls).
    if (shouldCountView(req, shareId, tee.ownerId)) {
      const bumped = await Tee.findOneAndUpdate(
        { _id: tee._id },
        { $inc: { viewCount: 1 } },
        { new: true, projection: { viewCount: 1 } },
      ).lean().catch(() => null);
      if (bumped && typeof bumped.viewCount === 'number') {
        tee.viewCount = bumped.viewCount;
      }
    }

    const owner = await User.findById(tee.ownerId).select('name avatar role').lean();
    res.status(200).json({
      tee,
      owner: owner
        ? {
            id: String((owner as any)._id),
            name: (owner as any).name,
            role: (owner as any).role,
            avatar: (owner as any).avatar ?? null,
          }
        : null,
    });
  } catch (err) {
    logger.error('[tee] getSharedTee failed', { error: (err as Error).message });
    res.status(500).json({ message: 'Server error' });
  }
};

export const addSignatureToTee = async (req: Request, res: Response): Promise<void> => {
  try {
    const shareId = String(req.params.shareId || '');
    
    // Preprocess fields from multipart/form-data (strings to numbers)
    const body = { ...req.body };
    if (typeof body.x === 'string') body.x = parseFloat(body.x);
    if (typeof body.y === 'string') body.y = parseFloat(body.y);
    if (typeof body.scale === 'string') body.scale = parseFloat(body.scale);
    if (typeof body.rotation === 'string') body.rotation = parseFloat(body.rotation);

    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (file) {
      body.signerDataUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    }

    const parsed = teeSignatureSchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Validation failed', errors: parsed.error.issues });
      return;
    }
    const tee = await Tee.findOne({ shareId });
    if (!tee) {
      res.status(404).json({ message: 'Tee not found' });
      return;
    }
    const sigId = new Types.ObjectId();
    const ownerId = String(tee.ownerId);

    let secureUrl: string = parsed.data.signerDataUrl;
    let diskUrl: string | null = null;
    try {
      const uploadRes = await uploadSignatureToCloudinary(ownerId, String(sigId), parsed.data.signerDataUrl);
      secureUrl = uploadRes.secure_url;
      diskUrl = uploadRes.secure_url;
    } catch (err) {
      logger.error('[tee] Cloudinary signature upload failed, falling back to disk', {
        error: (err as Error).message,
        ownerId,
      });
      try {
        const filename = await writeSignatureToDisk(ownerId, String(sigId), parsed.data.signerDataUrl);
        diskUrl = publicAssetUrl(`/uploads/tee-signatures/${ownerId}/${filename}`);
      } catch (diskErr) {
        logger.warn('[tee] signature disk write fallback failed (keeping inline dataUrl)', {
          error: (diskErr as Error).message,
          ownerId,
        });
      }
    }

    tee.signatures.push({
      _id: sigId,
      signerUserId: req.user ? req.user._id : null,
      signerName: parsed.data.signerName,
      signerDataUrl: secureUrl,
      face: parsed.data.face as 'front' | 'back',
      x: parsed.data.x,
      y: parsed.data.y,
      scale: parsed.data.scale,
      rotation: parsed.data.rotation,
      createdAt: new Date(),
    });
    await tee.save();
    res.status(201).json({
      signature: {
        id: String(sigId),
        signerName: parsed.data.signerName,
        signerUserId: req.user ? String(req.user._id) : null,
        signerDataUrl: secureUrl,
        face: parsed.data.face,
        diskUrl,
        x: parsed.data.x,
        y: parsed.data.y,
        scale: parsed.data.scale,
        rotation: parsed.data.rotation,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    logger.error('[tee] addSignatureToTee failed', { error: (err as Error).message });
    res.status(500).json({ message: 'Server error' });
  }
};

/** PATCH — Owner moves/resizes an existing signature. */
export const updateSignaturePosition = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: 'Not authorized.' });
    return;
  }
  try {
    const shareId = String(req.params.shareId || '');
    const sigId = String(req.params.sigId || '');
    if (!Types.ObjectId.isValid(sigId)) {
      res.status(400).json({ message: 'Invalid signature id' });
      return;
    }
    const parsed = teeSignaturePositionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Validation failed', errors: parsed.error.issues });
      return;
    }
    const tee = await Tee.findOne({ shareId });
    if (!tee) {
      res.status(404).json({ message: 'Tee not found' });
      return;
    }
    if (String(tee.ownerId) !== String(req.user._id)) {
      res.status(403).json({ message: 'Only the tee owner can reposition signatures' });
      return;
    }
    const sig = tee.signatures.find((s) => String(s._id) === sigId);
    if (!sig) {
      res.status(404).json({ message: 'Signature not found on this tee' });
      return;
    }
    sig.x = parsed.data.x;
    sig.y = parsed.data.y;
    sig.scale = parsed.data.scale;
    sig.rotation = parsed.data.rotation;
    await tee.save();
    res.status(200).json({ message: 'Signature updated' });
  } catch (err) {
    logger.error('[tee] updateSignaturePosition failed', { error: (err as Error).message });
    res.status(500).json({ message: 'Server error' });
  }
};

export const removeSignature = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: 'Not authorized.' });
    return;
  }
  try {
    const shareId = String(req.params.shareId || '');
    const sigId = String(req.params.sigId || '');
    if (!Types.ObjectId.isValid(sigId)) {
      res.status(400).json({ message: 'Invalid signature id' });
      return;
    }
    const tee = await Tee.findOne({ shareId });
    if (!tee) {
      res.status(404).json({ message: 'Tee not found' });
      return;
    }
    if (String(tee.ownerId) !== String(req.user._id)) {
      res.status(403).json({ message: 'Only the tee owner can remove signatures' });
      return;
    }
    const before = tee.signatures.length;
    tee.signatures = tee.signatures.filter((s) => String(s._id) !== sigId);
    if (tee.signatures.length === before) {
      res.status(404).json({ message: 'Signature not found on this tee' });
      return;
    }
    await tee.save();
    res.status(200).json({ message: 'Signature removed' });
  } catch (err) {
    logger.error('[tee] removeSignature failed', { error: (err as Error).message });
    res.status(500).json({ message: 'Server error' });
  }
};

