/**
 * admin-journey.controller.ts — admin Journey Tracks CRUD +
 * assignment + progress monitoring.
 *
 * v1.76 — Welcome Package: Journey Tracks.
 *
 * Endpoints (mounted under /api/admin/welcome/tracks in
 * admin-welcome.routes.ts):
 *   GET    /tracks
 *   POST   /tracks
 *   GET    /tracks/:id
 *   PATCH  /tracks/:id
 *   DELETE /tracks/:id                       (draft only)
 *   POST   /tracks/:id/duplicate
 *   PATCH  /tracks/:id/status                (publish / unpublish / archive)
 *   PUT    /tracks/:id/checkpoints           (replace ordered list)
 *   POST   /tracks/:id/checkpoints           (append one)
 *   PATCH  /tracks/:id/checkpoints/:cpId
 *   DELETE /tracks/:id/checkpoints/:cpId
 *   PUT    /tracks/:id/checkpoints/:cpId/items
 *   POST   /tracks/:id/checkpoints/:cpId/items
 *   PATCH  /tracks/:id/checkpoints/:cpId/items/:itemId
 *   DELETE /tracks/:id/checkpoints/:cpId/items/:itemId
 *   GET    /tracks/:id/assignments
 *   POST   /tracks/:id/assignments
 *   DELETE /tracks/:id/assignments/:assignmentId
 *   GET    /tracks/:id/progress
 *   GET    /progress                         (cross-track filter view)
 */
import { Request, Response } from 'express';
import { Types } from 'mongoose';
import JourneyTrack, {
  IJourneyCheckpoint,
  IJourneyItem,
  IJourneyTrack,
  JourneyItemType,
  JourneyTrackStatus,
} from '../program/journey-track.model.js';
import JourneyAssignment, {
  JourneyAssignmentScope,
} from '../program/journey-assignment.model.js';
import JourneyProgress from '../program/journey-progress.model.js';
import ProgramEnrollment from '../program/program-enrollment.model.js';
import User from '../auth/user.model.js';
import { adminLog } from '../../utils/http/logger.js';
import { AuthedRequest } from '../../middleware/authShared.js';

// ─── Helpers ────────────────────────────────────────────────────────────

function asStringParam(v: unknown): string | undefined {
  if (Array.isArray(v)) return typeof v[0] === 'string' ? v[0] : undefined;
  if (typeof v === 'string') return v;
  return undefined;
}

function requireAdmin(
  req: Request,
  res: Response
): { userId: Types.ObjectId; name: string } | null {
  const ar = req as AuthedRequest;
  const userId = ar.user?._id;
  if (!userId) {
    res.status(401).json({ message: 'Not authorized.' });
    return null;
  }
  const name = ar.user?.name ?? 'Admin';
  return { userId: userId as Types.ObjectId, name };
}

const VALID_ITEM_TYPES: JourneyItemType[] = [
  'task', 'note', 'warning', 'external_link', 'internal_link', 'action', 'divider',
];

const VALID_TRACK_STATUSES: JourneyTrackStatus[] = [
  'draft', 'published', 'unpublished', 'archived',
];

function cleanItem(raw: unknown): IJourneyItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const type = (typeof r.type === 'string' ? r.type : '') as JourneyItemType;
  if (!VALID_ITEM_TYPES.includes(type)) return null;
  const title = typeof r.title === 'string' ? r.title : '';
  const body = typeof r.body === 'string' ? r.body : '';
  const required = r.required === true && type === 'task';
  const href =
    typeof r.href === 'string'
      ? r.href.slice(0, 2000)
      : '';
  const action = typeof r.action === 'string' ? r.action.slice(0, 100) : '';
  const actionLabel =
    typeof r.actionLabel === 'string' ? r.actionLabel.slice(0, 100) : '';
  const icon = typeof r.icon === 'string' ? r.icon.slice(0, 50) : '';
  const accentColor =
    typeof r.accentColor === 'string' ? r.accentColor.slice(0, 30) : '';
  // metadata is opaque — coerce to a plain object. Skip arrays.
  let metadata: Record<string, unknown> = {};
  if (r.metadata && typeof r.metadata === 'object' && !Array.isArray(r.metadata)) {
    metadata = r.metadata as Record<string, unknown>;
  }
  // v1.76 — preserve a client-generated `_id` when it's a valid
  // 24-hex string. This lets the frontend generate IDs locally,
  // POST them, and have them round-trip without a second save
  // pass to reconcile. Items without a usable `_id` get a fresh
  // ObjectId assigned by Mongoose.
  const incomingId =
    typeof r._id === 'string' && /^[a-f0-9]{24}$/i.test(r._id)
      ? new Types.ObjectId(r._id)
      : new Types.ObjectId();
  return {
    _id: incomingId,
    type,
    title: title.slice(0, 200),
    body: body.slice(0, 4000),
    required,
    href,
    action,
    actionLabel,
    metadata,
    icon,
    accentColor,
  };
}

function cleanCheckpoint(raw: unknown): IJourneyCheckpoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === 'string' ? r.title : '';
  if (!title.trim()) return null;
  const description =
    typeof r.description === 'string' ? r.description.slice(0, 2000) : '';
  const icon = typeof r.icon === 'string' ? r.icon.slice(0, 50) : '';
  const itemsRaw = Array.isArray(r.items) ? r.items : [];
  const items: IJourneyItem[] = [];
  for (const it of itemsRaw) {
    const cleaned = cleanItem(it);
    if (cleaned) items.push(cleaned);
  }
  // v1.76 — preserve a client-generated checkpoint `_id` when
  // valid 24-hex, so replaceCheckpoints can round-trip the local
  // state without creating duplicates on every save. New
  // checkpoints (no client `_id`) get a fresh ObjectId assigned
  // by Mongoose.
  const incomingId =
    typeof r._id === 'string' && /^[a-f0-9]{24}$/i.test(r._id)
      ? new Types.ObjectId(r._id)
      : new Types.ObjectId();
  return {
    _id: incomingId,
    title: title.slice(0, 200),
    description,
    icon,
    items,
  };
}

// ─── Track CRUD ─────────────────────────────────────────────────────────

export async function listTracks(req: Request, res: Response): Promise<void> {
  try {
    const filter: Record<string, unknown> = {};
    const status = String(req.query.status ?? '');
    if (VALID_TRACK_STATUSES.includes(status as JourneyTrackStatus)) {
      filter.status = status;
    }
    const tracks = await JourneyTrack.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ tracks });
  } catch (err) {
    adminLog.error(`[adminJourney] listTracks failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load Journey tracks.' });
  }
}

export async function createTrack(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req, res);
  if (!auth) return;

  const body = (req.body ?? {}) as { name?: string; description?: string; icon?: string; accentColor?: string };
  const name = (body.name ?? '').trim();
  if (!name) {
    res.status(400).json({ message: 'Track name is required.' });
    return;
  }
  try {
    const track = await JourneyTrack.create({
      name: name.slice(0, 200),
      description: (body.description ?? '').slice(0, 2000),
      icon: (body.icon ?? '🛤️').slice(0, 50),
      accentColor: (body.accentColor ?? 'accent').slice(0, 30),
      createdBy: auth.userId,
    });
    res.json({ track });
  } catch (err) {
    adminLog.error(`[adminJourney] createTrack failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to create Journey track.' });
  }
}

export async function getTrack(req: Request, res: Response): Promise<void> {
  const id = asStringParam(req.params.id);
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid track id.' });
    return;
  }
  try {
    const track = await JourneyTrack.findById(id).lean();
    if (!track) {
      res.status(404).json({ message: 'Journey track not found.' });
      return;
    }
    res.json({ track });
  } catch (err) {
    adminLog.error(`[adminJourney] getTrack failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load Journey track.' });
  }
}

export async function updateTrack(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req, res);
  if (!auth) return;
  const id = asStringParam(req.params.id);
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid track id.' });
    return;
  }
  const body = (req.body ?? {}) as {
    name?: string; description?: string; icon?: string; accentColor?: string;
  };
  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string') patch.name = body.name.trim().slice(0, 200);
  if (typeof body.description === 'string') patch.description = body.description.slice(0, 2000);
  if (typeof body.icon === 'string') patch.icon = body.icon.slice(0, 50);
  if (typeof body.accentColor === 'string') patch.accentColor = body.accentColor.slice(0, 30);
  if (Object.keys(patch).length === 0) {
    res.status(400).json({ message: 'Nothing to update.' });
    return;
  }
  try {
    const track = await JourneyTrack.findByIdAndUpdate(id, patch, { new: true });
    if (!track) {
      res.status(404).json({ message: 'Journey track not found.' });
      return;
    }
    res.json({ track });
  } catch (err) {
    adminLog.error(`[adminJourney] updateTrack failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to update Journey track.' });
  }
}

export async function deleteTrack(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req, res);
  if (!auth) return;
  const id = asStringParam(req.params.id);
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid track id.' });
    return;
  }
  try {
    const track = await JourneyTrack.findById(id);
    if (!track) {
      res.status(404).json({ message: 'Journey track not found.' });
      return;
    }
    if (track.status !== 'draft') {
      res.status(409).json({
        message: 'Only draft tracks can be deleted. Archive published tracks instead.',
      });
      return;
    }
    await JourneyTrack.deleteOne({ _id: id });
    // Cascade: remove assignments + progress for this track.
    await JourneyAssignment.deleteMany({ trackId: id });
    await JourneyProgress.deleteMany({ trackId: id });
    res.json({ deleted: true });
  } catch (err) {
    adminLog.error(`[adminJourney] deleteTrack failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to delete Journey track.' });
  }
}

export async function duplicateTrack(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req, res);
  if (!auth) return;
  const id = asStringParam(req.params.id);
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid track id.' });
    return;
  }
  try {
    const src = await JourneyTrack.findById(id).lean();
    if (!src) {
      res.status(404).json({ message: 'Journey track not found.' });
      return;
    }
    const dup = await JourneyTrack.create({
      name: `${src.name} (Copy)`.slice(0, 200),
      description: src.description,
      icon: src.icon,
      accentColor: src.accentColor,
      status: 'draft',
      checkpoints: src.checkpoints.map((cp) => ({
        title: cp.title,
        description: cp.description,
        icon: cp.icon,
        items: (cp.items ?? []).map((it) => ({ ...it })),
      })),
      createdBy: auth.userId,
    });
    res.json({ track: dup });
  } catch (err) {
    adminLog.error(`[adminJourney] duplicateTrack failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to duplicate Journey track.' });
  }
}

export async function updateTrackStatus(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req, res);
  if (!auth) return;
  const id = asStringParam(req.params.id);
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid track id.' });
    return;
  }
  const body = (req.body ?? {}) as { status?: string };
  const next = body.status as JourneyTrackStatus;
  if (!VALID_TRACK_STATUSES.includes(next)) {
    res.status(400).json({ message: 'Invalid status.' });
    return;
  }
  try {
    const now = new Date();
    const track = await JourneyTrack.findByIdAndUpdate(
      id,
      {
        status: next,
        publishedAt: next === 'published' ? now : null,
        archivedAt: next === 'archived' ? now : null,
      },
      { new: true }
    );
    if (!track) {
      res.status(404).json({ message: 'Journey track not found.' });
      return;
    }
    res.json({ track });
  } catch (err) {
    adminLog.error(`[adminJourney] updateTrackStatus failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to update status.' });
  }
}

// ─── Checkpoint CRUD ────────────────────────────────────────────────────

export async function replaceCheckpoints(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req, res);
  if (!auth) return;
  const id = asStringParam(req.params.id);
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid track id.' });
    return;
  }
  const body = (req.body ?? {}) as { checkpoints?: unknown };
  const raw = Array.isArray(body.checkpoints) ? body.checkpoints : [];
  const cleaned: IJourneyCheckpoint[] = [];
  for (const cp of raw) {
    const c = cleanCheckpoint(cp);
    if (c) cleaned.push(c);
  }
  try {
    const track = await JourneyTrack.findByIdAndUpdate(
      id,
      { checkpoints: cleaned },
      { new: true }
    );
    if (!track) {
      res.status(404).json({ message: 'Journey track not found.' });
      return;
    }
    res.json({ track });
  } catch (err) {
    adminLog.error(`[adminJourney] replaceCheckpoints failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to save checkpoints.' });
  }
}

export async function appendCheckpoint(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req, res);
  if (!auth) return;
  const id = asStringParam(req.params.id);
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid track id.' });
    return;
  }
  const c = cleanCheckpoint(req.body);
  if (!c) {
    res.status(400).json({ message: 'Invalid checkpoint body.' });
    return;
  }
  try {
    const track = await JourneyTrack.findByIdAndUpdate(
      id,
      { $push: { checkpoints: c } },
      { new: true }
    );
    if (!track) {
      res.status(404).json({ message: 'Journey track not found.' });
      return;
    }
    res.json({ track });
  } catch (err) {
    adminLog.error(`[adminJourney] appendCheckpoint failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to append checkpoint.' });
  }
}

export async function updateCheckpoint(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req, res);
  if (!auth) return;
  const trackId = asStringParam(req.params.id);
  const cpId = asStringParam(req.params.cpId);
  if (!trackId || !Types.ObjectId.isValid(trackId) || !cpId || !Types.ObjectId.isValid(cpId)) {
    res.status(400).json({ message: 'Invalid ids.' });
    return;
  }
  const body = (req.body ?? {}) as { title?: string; description?: string; icon?: string; items?: unknown };
  // Re-clean the whole checkpoint from the new body so we
  // can update title/description AND items in one shot.
  const c = cleanCheckpoint({
    title: body.title,
    description: body.description,
    icon: body.icon,
    items: body.items,
  });
  if (!c) {
    res.status(400).json({ message: 'Invalid checkpoint body.' });
    return;
  }
  try {
    const track = await JourneyTrack.findOneAndUpdate(
      { _id: trackId, 'checkpoints._id': cpId },
      {
        $set: {
          'checkpoints.$.title': c.title,
          'checkpoints.$.description': c.description,
          'checkpoints.$.icon': c.icon,
          'checkpoints.$.items': c.items,
        },
      },
      { new: true }
    );
    if (!track) {
      res.status(404).json({ message: 'Checkpoint not found.' });
      return;
    }
    res.json({ track });
  } catch (err) {
    adminLog.error(`[adminJourney] updateCheckpoint failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to update checkpoint.' });
  }
}

export async function deleteCheckpoint(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req, res);
  if (!auth) return;
  const trackId = asStringParam(req.params.id);
  const cpId = asStringParam(req.params.cpId);
  if (!trackId || !Types.ObjectId.isValid(trackId) || !cpId || !Types.ObjectId.isValid(cpId)) {
    res.status(400).json({ message: 'Invalid ids.' });
    return;
  }
  try {
    const track = await JourneyTrack.findByIdAndUpdate(
      trackId,
      { $pull: { checkpoints: { _id: cpId } } },
      { new: true }
    );
    if (!track) {
      res.status(404).json({ message: 'Journey track not found.' });
      return;
    }
    res.json({ track });
  } catch (err) {
    adminLog.error(`[adminJourney] deleteCheckpoint failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to delete checkpoint.' });
  }
}

// ─── Item CRUD (within a checkpoint) ────────────────────────────────────

export async function replaceItems(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req, res);
  if (!auth) return;
  const trackId = asStringParam(req.params.id);
  const cpId = asStringParam(req.params.cpId);
  if (!trackId || !Types.ObjectId.isValid(trackId) || !cpId || !Types.ObjectId.isValid(cpId)) {
    res.status(400).json({ message: 'Invalid ids.' });
    return;
  }
  const body = (req.body ?? {}) as { items?: unknown };
  const raw = Array.isArray(body.items) ? body.items : [];
  const items: IJourneyItem[] = [];
  for (const it of raw) {
    const cleaned = cleanItem(it);
    if (cleaned) items.push(cleaned);
  }
  try {
    const track = await JourneyTrack.findOneAndUpdate(
      { _id: trackId, 'checkpoints._id': cpId },
      { $set: { 'checkpoints.$.items': items } },
      { new: true }
    );
    if (!track) {
      res.status(404).json({ message: 'Checkpoint not found.' });
      return;
    }
    res.json({ track });
  } catch (err) {
    adminLog.error(`[adminJourney] replaceItems failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to save items.' });
  }
}

export async function appendItem(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req, res);
  if (!auth) return;
  const trackId = asStringParam(req.params.id);
  const cpId = asStringParam(req.params.cpId);
  if (!trackId || !Types.ObjectId.isValid(trackId) || !cpId || !Types.ObjectId.isValid(cpId)) {
    res.status(400).json({ message: 'Invalid ids.' });
    return;
  }
  const item = cleanItem(req.body);
  if (!item) {
    res.status(400).json({ message: 'Invalid item body.' });
    return;
  }
  try {
    const track = await JourneyTrack.findOneAndUpdate(
      { _id: trackId, 'checkpoints._id': cpId },
      { $push: { 'checkpoints.$.items': item } },
      { new: true }
    );
    if (!track) {
      res.status(404).json({ message: 'Checkpoint not found.' });
      return;
    }
    res.json({ track });
  } catch (err) {
    adminLog.error(`[adminJourney] appendItem failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to append item.' });
  }
}

export async function updateItem(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req, res);
  if (!auth) return;
  const trackId = asStringParam(req.params.id);
  const cpId = asStringParam(req.params.cpId);
  const itemId = asStringParam(req.params.itemId);
  if (
    !trackId || !Types.ObjectId.isValid(trackId) ||
    !cpId || !Types.ObjectId.isValid(cpId) ||
    !itemId || !Types.ObjectId.isValid(itemId)
  ) {
    res.status(400).json({ message: 'Invalid ids.' });
    return;
  }
  const item = cleanItem(req.body);
  if (!item) {
    res.status(400).json({ message: 'Invalid item body.' });
    return;
  }
  try {
    // Find the track + checkpoint + item position, then update by index.
    // This avoids a positional-operator limitation with multiple
    // nested array filters.
    const track = await JourneyTrack.findById(trackId);
    if (!track) {
      res.status(404).json({ message: 'Journey track not found.' });
      return;
    }
    const cp = track.checkpoints.find((c) => String(c._id) === cpId);
    if (!cp) {
      res.status(404).json({ message: 'Checkpoint not found.' });
      return;
    }
    const idx = cp.items.findIndex((i) => String(i._id) === itemId);
    if (idx === -1) {
      res.status(404).json({ message: 'Item not found.' });
      return;
    }
    cp.items[idx] = { ...item, _id: new Types.ObjectId(itemId) } as IJourneyItem;
    await track.save();
    res.json({ track });
  } catch (err) {
    adminLog.error(`[adminJourney] updateItem failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to update item.' });
  }
}

export async function deleteItem(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req, res);
  if (!auth) return;
  const trackId = asStringParam(req.params.id);
  const cpId = asStringParam(req.params.cpId);
  const itemId = asStringParam(req.params.itemId);
  if (
    !trackId || !Types.ObjectId.isValid(trackId) ||
    !cpId || !Types.ObjectId.isValid(cpId) ||
    !itemId || !Types.ObjectId.isValid(itemId)
  ) {
    res.status(400).json({ message: 'Invalid ids.' });
    return;
  }
  try {
    const track = await JourneyTrack.findById(trackId);
    if (!track) {
      res.status(404).json({ message: 'Journey track not found.' });
      return;
    }
    const cp = track.checkpoints.find((c) => String(c._id) === cpId);
    if (!cp) {
      res.status(404).json({ message: 'Checkpoint not found.' });
      return;
    }
    const idx = cp.items.findIndex((i) => String(i._id) === itemId);
    if (idx === -1) {
      res.status(404).json({ message: 'Item not found.' });
      return;
    }
    cp.items.splice(idx, 1);
    await track.save();
    res.json({ track });
  } catch (err) {
    adminLog.error(`[adminJourney] deleteItem failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to delete item.' });
  }
}

// ─── Assignments ───────────────────────────────────────────────────────

export async function listAssignments(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req, res);
  if (!auth) return;
  const trackId = asStringParam(req.params.id);
  if (!trackId || !Types.ObjectId.isValid(trackId)) {
    res.status(400).json({ message: 'Invalid track id.' });
    return;
  }
  try {
    const assignments = await JourneyAssignment.find({ trackId })
      .populate('userId', 'name email')
      .populate('batchId', 'name')
      .sort({ assignedAt: -1 })
      .lean();
    res.json({ assignments });
  } catch (err) {
    adminLog.error(`[adminJourney] listAssignments failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load assignments.' });
  }
}

export async function createAssignments(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req, res);
  if (!auth) return;
  const trackId = asStringParam(req.params.id);
  if (!trackId || !Types.ObjectId.isValid(trackId)) {
    res.status(400).json({ message: 'Invalid track id.' });
    return;
  }
  const body = (req.body ?? {}) as {
    scope?: string; batchIds?: string[]; userIds?: string[];
  };
  const scope = body.scope as JourneyAssignmentScope;
  if (!['user', 'batch', 'program', 'all'].includes(scope)) {
    res.status(400).json({ message: 'Invalid scope.' });
    return;
  }
  try {
    const track = await JourneyTrack.findById(trackId).lean();
    if (!track) {
      res.status(404).json({ message: 'Journey track not found.' });
      return;
    }

    // Resolve the (userId, batchId, programId) tuples to write.
    const writes: Array<{ userId: Types.ObjectId; batchId: Types.ObjectId | null; programId: Types.ObjectId | null }> = [];

    if (scope === 'user') {
      const ids = (body.userIds ?? []).filter((s) => Types.ObjectId.isValid(s));
      for (const s of ids) {
        writes.push({ userId: new Types.ObjectId(s), batchId: null, programId: null });
      }
    } else if (scope === 'batch') {
      const batchIds = (body.batchIds ?? []).filter((s) => Types.ObjectId.isValid(s));
      // Pull everyone enrolled in the listed batches. The
      // ProgramEnrollment model is the source of truth for
      // "who is in batch X".
      const enrollments = await ProgramEnrollment.find({
        batchId: { $in: batchIds.map((b) => new Types.ObjectId(b)) },
      })
        .select('userId batchId')
        .lean();
      for (const e of enrollments) {
        writes.push({
          userId: e.userId as Types.ObjectId,
          batchId: e.batchId as Types.ObjectId,
          programId: null,
        });
      }
    } else if (scope === 'program') {
      // Program = a parent that owns batches. The frontend
      // sends `batchIds`; we mark them as scope:'program' so
      // the admin can filter by program on the monitor page.
      const programBatchIds = (body.batchIds ?? []).filter((s) => Types.ObjectId.isValid(s));
      const enrollments = await ProgramEnrollment.find({
        batchId: { $in: programBatchIds.map((b) => new Types.ObjectId(b)) },
      })
        .select('userId batchId')
        .lean();
      for (const e of enrollments) {
        writes.push({
          userId: e.userId as Types.ObjectId,
          batchId: null,
          programId: e.batchId as Types.ObjectId,
        });
      }
    } else {
      // scope='all' — every user. Skip admins/moderators to
      // avoid clutter (admins don't take their own journeys).
      const users = await User.find({ role: 'user' })
        .select('_id')
        .lean();
      for (const u of users) {
        writes.push({ userId: u._id as Types.ObjectId, batchId: null, programId: null });
      }
    }

    if (writes.length === 0) {
      res.json({ assigned: 0, assignments: [] });
      return;
    }

    // Upsert — the unique (userId, trackId) index means
    // duplicate inserts become no-ops, so this is safe to
    // retry. We use bulkWrite with `updateOne` + upsert to
    // also pick up scope/batchId/programId if the user is
    // re-assigned.
    const ops = writes.map((w) => ({
      updateOne: {
        filter: { userId: w.userId, trackId: new Types.ObjectId(trackId) },
        update: {
          $setOnInsert: {
            userId: w.userId,
            trackId: new Types.ObjectId(trackId),
            scope,
            batchId: w.batchId,
            programId: w.programId,
            assignedAt: new Date(),
            assignedBy: auth.userId,
          },
        },
        upsert: true,
      },
    }));
    const result = await JourneyAssignment.bulkWrite(ops, { ordered: false });
    res.json({
      assigned: (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0),
      total: writes.length,
    });
  } catch (err) {
    adminLog.error(`[adminJourney] createAssignments failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to create assignments.' });
  }
}

export async function deleteAssignment(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req, res);
  if (!auth) return;
  const id = asStringParam(req.params.assignmentId);
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid assignment id.' });
    return;
  }
  try {
    const result = await JourneyAssignment.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      res.status(404).json({ message: 'Assignment not found.' });
      return;
    }
    res.json({ deleted: true });
  } catch (err) {
    adminLog.error(`[adminJourney] deleteAssignment failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to delete assignment.' });
  }
}

// ─── Progress monitoring ───────────────────────────────────────────────

/**
 * Compute the % complete for a user against a single track.
 * Only `task` items with `required: true` count. Optional tasks
 * and informational items are not in the denominator.
 */
function computeRequiredCounts(track: IJourneyTrack): { required: number } {
  let required = 0;
  for (const cp of track.checkpoints ?? []) {
    for (const it of cp.items ?? []) {
      if (it.type === 'task' && it.required) required++;
    }
  }
  return { required };
}

export async function getTrackProgress(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req, res);
  if (!auth) return;
  const trackId = asStringParam(req.params.id);
  if (!trackId || !Types.ObjectId.isValid(trackId)) {
    res.status(400).json({ message: 'Invalid track id.' });
    return;
  }
  try {
    const track = await JourneyTrack.findById(trackId).lean();
    if (!track) {
      res.status(404).json({ message: 'Journey track not found.' });
      return;
    }
    const { required } = computeRequiredCounts(track as unknown as IJourneyTrack);
    const assignments = await JourneyAssignment.find({ trackId })
      .populate('userId', 'name email')
      .populate('batchId', 'name')
      .lean();
    const userIds = assignments
      .map((a) => a.userId)
      .filter((u): u is Types.ObjectId => Boolean(u));
    const progressRows = await JourneyProgress.find({
      userId: { $in: userIds },
      trackId: new Types.ObjectId(trackId),
    }).lean();
    // Group progress rows by user.
    const byUser = new Map<string, { done: number; latest: Date | null }>();
    for (const p of progressRows) {
      if (!p.completed) continue;
      const key = String(p.userId);
      const cur = byUser.get(key) ?? { done: 0, latest: null };
      cur.done += 1;
      const ts = p.completedAt ?? p.updatedAt;
      if (ts && (!cur.latest || ts > cur.latest)) cur.latest = ts;
      byUser.set(key, cur);
    }
    // Find the "current checkpoint" — the first checkpoint with
    // any incomplete required task.
    const checkpoints = track.checkpoints ?? [];
    const rows = assignments.map((a) => {
      const key = String(a.userId);
      const u = a.userId as unknown as { name?: string; email?: string } | null;
      const b = a.batchId as unknown as { name?: string } | null;
      const prog = byUser.get(key) ?? { done: 0, latest: null };
      const percent = required === 0 ? 0 : Math.round((prog.done / required) * 100);
      const currentCheckpoint =
        checkpoints.find((cp) =>
          (cp.items ?? []).some(
            (it) => it.type === 'task' && it.required && !byUser.get(`${key}:${String(it._id)}`)
          )
        )?.title ??
        (percent === 100
          ? 'All checkpoints complete'
          : checkpoints[0]?.title ?? '—');
      return {
        userId: key,
        userName: u?.name ?? null,
        userEmail: u?.email ?? null,
        batchName: b?.name ?? null,
        completedRequired: prog.done,
        requiredTotal: required,
        percent,
        currentCheckpoint,
        lastActivityAt: prog.latest ? prog.latest.toISOString() : null,
        assignmentId: String(a._id),
        scope: a.scope,
      };
    });
    res.json({ rows, requiredTotal: required });
  } catch (err) {
    adminLog.error(`[adminJourney] getTrackProgress failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load progress.' });
  }
}

export async function getCrossProgress(req: Request, res: Response): Promise<void> {
  const auth = requireAdmin(req, res);
  if (!auth) return;
  try {
    const trackId = asStringParam(req.query.trackId);
    const batchId = asStringParam(req.query.batchId);
    const programId = asStringParam(req.query.programId);
    const status = asStringParam(req.query.status);

    const trackFilter: Record<string, unknown> = {};
    if (status && VALID_TRACK_STATUSES.includes(status as JourneyTrackStatus)) {
      trackFilter.status = status;
    }
    const tracks = await JourneyTrack.find(trackFilter).lean();
    const trackMap = new Map<string, IJourneyTrack>();
    for (const t of tracks) trackMap.set(String(t._id), t as unknown as IJourneyTrack);

    const assignFilter: Record<string, unknown> = {};
    if (trackId && Types.ObjectId.isValid(trackId)) {
      assignFilter.trackId = new Types.ObjectId(trackId);
    }
    if (batchId && Types.ObjectId.isValid(batchId)) {
      assignFilter.batchId = new Types.ObjectId(batchId);
    }
    if (programId && Types.ObjectId.isValid(programId)) {
      assignFilter.programId = new Types.ObjectId(programId);
    }
    const assignments = await JourneyAssignment.find(assignFilter)
      .populate('userId', 'name email')
      .populate('batchId', 'name')
      .lean();

    const progressFilter: Record<string, unknown> = {};
    if (trackId && Types.ObjectId.isValid(trackId)) {
      progressFilter.trackId = new Types.ObjectId(trackId);
    }
    const progressRows = await JourneyProgress.find(progressFilter).lean();
    const progressByUser = new Map<string, Map<string, boolean>>();
    for (const p of progressRows) {
      const u = String(p.userId);
      const t = String(p.trackId);
      const key = `${u}:${t}`;
      const inner = progressByUser.get(key) ?? new Map<string, boolean>();
      inner.set(String(p.itemId), p.completed);
      progressByUser.set(key, inner);
    }

    const rows = assignments.map((a) => {
      const t = trackMap.get(String(a.trackId));
      const required = t ? computeRequiredCounts(t).required : 0;
      const inner = progressByUser.get(`${String(a.userId)}:${String(a.trackId)}`) ?? new Map();
      let done = 0;
      for (const v of inner.values()) if (v) done++;
      const percent = required === 0 ? 0 : Math.round((done / required) * 100);
      const u = a.userId as unknown as { name?: string; email?: string } | null;
      const b = a.batchId as unknown as { name?: string } | null;
      return {
        assignmentId: String(a._id),
        userId: String(a.userId),
        userName: u?.name ?? null,
        userEmail: u?.email ?? null,
        trackId: String(a.trackId),
        trackName: t?.name ?? '—',
        batchName: b?.name ?? null,
        completedRequired: done,
        requiredTotal: required,
        percent,
      };
    });

    res.json({ rows });
  } catch (err) {
    adminLog.error(`[adminJourney] getCrossProgress failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load progress.' });
  }
}
