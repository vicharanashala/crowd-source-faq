/**
 * journey.controller.ts — user-facing Journey Tracks endpoints.
 *
 * v1.76 — Welcome Package: Journey Tracks.
 *
 * Endpoints (mounted under /api/welcome/journeys in welcome.routes.ts):
 *   GET    /journeys                          — list of assigned, published tracks
 *                                              with per-track progress overlay
 *   GET    /journeys/:trackId                 — full track + my progress
 *   POST   /journeys/:trackId/items/:itemId/complete   — mark required task done
 *   DELETE /journeys/:trackId/items/:itemId/complete   — un-mark
 *
 * Assignment resolution mirrors the admin query but on the
 * user's own userId. Tracks that are not yet `published` are
 * NEVER returned to the user.
 */
import { Request, Response } from 'express';
import { Types } from 'mongoose';
import JourneyTrack, {
  IJourneyItem,
  IJourneyTrack,
} from './journey-track.model.js';
import JourneyAssignment from './journey-assignment.model.js';
import JourneyProgress from './journey-progress.model.js';
import ProgramEnrollment from './program-enrollment.model.js';
import { authLog } from '../../utils/http/logger.js';

function asStringParam(v: unknown): string | undefined {
  if (Array.isArray(v)) return typeof v[0] === 'string' ? v[0] : undefined;
  if (typeof v === 'string') return v;
  return undefined;
}

function requireUser(req: Request, res: Response): Types.ObjectId | null {
  const userId = (req as Request & { user?: { _id?: Types.ObjectId } }).user?._id;
  if (!userId) {
    res.status(401).json({ message: 'Not authorized.' });
    return null;
  }
  return userId as Types.ObjectId;
}

/**
 * Compute the user's "current checkpoint" — the first checkpoint
 * that has at least one required task not yet completed.
 * Returns null if everything is done.
 */
function currentCheckpointForUser(
  track: IJourneyTrack,
  completedItemIds: Set<string>,
): string | null {
  for (const cp of track.checkpoints ?? []) {
    for (const it of cp.items ?? []) {
      if (it.type === 'task' && it.required && it._id && !completedItemIds.has(String(it._id))) {
        return String(cp._id);
      }
    }
  }
  return null;
}

function computeProgressForUser(
  track: IJourneyTrack,
  completedItemIds: Set<string>,
): { required: number; done: number; percent: number; currentCheckpointId: string | null } {
  let required = 0;
  let done = 0;
  for (const cp of track.checkpoints ?? []) {
    for (const it of cp.items ?? []) {
      if (it.type === 'task' && it.required) {
        required++;
        if (it._id && completedItemIds.has(String(it._id))) done++;
      }
    }
  }
  return {
    required,
    done,
    percent: required === 0 ? 0 : Math.round((done / required) * 100),
    currentCheckpointId: currentCheckpointForUser(track, completedItemIds),
  };
}

/**
 * Resolve the set of track IDs assigned to this user across
 * the four scopes. The query is intentionally one round trip
 * to ProgramEnrollment (so the "my batches" lookup doesn't
 * re-execute per scope branch).
 *
 * v1.76 hotfix: also include `User.batchId` (the older "primary
 * batch" field on the user record itself) in the lookup. Some
 * users — particularly those onboarded via the legacy
 * onboarding-override flow — have a batchId set on the User
 * document but no ProgramEnrollment row, which caused the
 * program-scope assignment to silently never resolve. Pulling
 * both sources and de-duping covers every path.
 */
async function assignedTrackIdsForUser(userId: Types.ObjectId): Promise<Set<string>> {
  const [enrollments, user] = await Promise.all([
    ProgramEnrollment.find({ userId }).select('batchId').lean(),
    // Defer import to avoid a hard dependency cycle at module load.
    // Cast to `any` for the .lean() shape — IUser is the runtime
    // type but batchId is on the legacy v1 user schema and isn't
    // part of the strict IUser type yet.
    import('../auth/user.model.js').then((m) =>
      m.default.findById(userId).select('batchId').lean() as Promise<any>
    ),
  ]);
  const myBatchIds: Types.ObjectId[] = [];
  const seen = new Set<string>();
  const pushIfNew = (raw: unknown): void => {
    if (!raw) return;
    const oid = new Types.ObjectId(String(raw));
    const key = oid.toString();
    if (seen.has(key)) return;
    seen.add(key);
    myBatchIds.push(oid);
  };
  for (const e of enrollments) {
    if (e.batchId) pushIfNew(e.batchId);
  }
  // `user` is typed `any` (see cast above) so we can read the
  // legacy `batchId` field that lives on the runtime doc but
  // isn't on the strict IUser type yet.
  if ((user as { batchId?: unknown } | null)?.batchId) pushIfNew((user as { batchId?: unknown }).batchId);

  const rows = await JourneyAssignment.find({
    $or: [
      { scope: 'all' },
      ...(myBatchIds.length > 0
        ? [
            { scope: 'batch', batchId: { $in: myBatchIds } },
            { scope: 'program', programId: { $in: myBatchIds } },
          ]
        : []),
      { scope: 'user', userId },
    ],
  })
    .select('trackId')
    .lean();
  const out = new Set<string>();
  for (const r of rows) {
    if (r.trackId) out.add(String(r.trackId));
  }
  return out;
}

// ─── List assigned + published tracks (with progress) ────────────────

export async function listMyJourneys(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const trackIds = await assignedTrackIdsForUser(userId);
    if (trackIds.size === 0) {
      res.json({ journeys: [] });
      return;
    }
    const tracks = await JourneyTrack.find({
      _id: { $in: Array.from(trackIds).map((s) => new Types.ObjectId(s)) },
      status: 'published',
    }).lean();
    // Pull the user's progress rows for these tracks in one shot.
    const progress = await JourneyProgress.find({
      userId,
      trackId: { $in: tracks.map((t) => t._id) },
    }).lean();
    const byTrack = new Map<string, Set<string>>();
    let latest: Date | null = null;
    for (const p of progress) {
      if (!p.completed) continue;
      const t = String(p.trackId);
      const inner = byTrack.get(t) ?? new Set<string>();
      inner.add(String(p.itemId));
      byTrack.set(t, inner);
      const ts = p.completedAt ?? p.updatedAt;
      if (ts && (!latest || ts > latest)) latest = ts;
    }
    const journeys = tracks.map((t) => {
      const completed = byTrack.get(String(t._id)) ?? new Set<string>();
      const { required, done, percent, currentCheckpointId } = computeProgressForUser(
        t as unknown as IJourneyTrack,
        completed,
      );
      return {
        _id: t._id,
        name: t.name,
        description: t.description,
        icon: t.icon,
        accentColor: t.accentColor,
        checkpointCount: (t.checkpoints ?? []).length,
        required,
        done,
        percent,
        currentCheckpointId,
        lastActivityAt: latest ? latest.toISOString() : null,
      };
    });
    res.json({ journeys });
  } catch (err) {
    authLog.error(`[journey] listMyJourneys failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load journeys.' });
  }
}

// ─── Single track with my progress ────────────────────────────────────

export async function getMyJourney(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  const trackId = asStringParam(req.params.trackId);
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
    if (track.status !== 'published') {
      res.status(404).json({ message: 'Journey track is not available.' });
      return;
    }
    // Authorisation — the user must be assigned.
    const assigned = await assignedTrackIdsForUser(userId);
    if (!assigned.has(trackId)) {
      res.status(404).json({ message: 'Journey track is not available.' });
      return;
    }
    const progress = await JourneyProgress.find({
      userId,
      trackId: new Types.ObjectId(trackId),
    }).lean();
    const completedItemIds = new Set<string>();
    let latest: Date | null = null;
    for (const p of progress) {
      if (!p.completed) continue;
      completedItemIds.add(String(p.itemId));
      const ts = p.completedAt ?? p.updatedAt;
      if (ts && (!latest || ts > latest)) latest = ts;
    }
    const { required, done, percent, currentCheckpointId } = computeProgressForUser(
      track as unknown as IJourneyTrack,
      completedItemIds,
    );
    res.json({
      track: {
        ...track,
        _id: String(track._id),
        checkpoints: (track.checkpoints ?? []).map((cp) => ({
          ...cp,
          _id: String(cp._id),
          items: (cp.items ?? []).map((it) => ({
            ...it,
            _id: String(it._id),
          })),
        })),
      },
      progress: {
        required,
        done,
        percent,
        currentCheckpointId,
        lastActivityAt: latest ? latest.toISOString() : null,
        completedItemIds: Array.from(completedItemIds),
      },
    });
  } catch (err) {
    authLog.error(`[journey] getMyJourney failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load journey.' });
  }
}

// ─── Toggle a required task ───────────────────────────────────────────

/**
 * Returns the { track, checkpoint, item } tuple for an itemId
 * across the embedded tree, or null. Used so we can refuse to
 * toggle a non-required item (informational / optional / link).
 */
function locateItem(
  track: IJourneyTrack,
  itemId: string
): { checkpointId: string; item: IJourneyItem; isRequired: boolean } | null {
  for (const cp of track.checkpoints ?? []) {
    for (const it of cp.items ?? []) {
      if (String(it._id) === itemId) {
        return {
          checkpointId: String(cp._id),
          item: it,
          isRequired: it.type === 'task' && it.required,
        };
      }
    }
  }
  return null;
}

export async function completeJourneyItem(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  const trackId = asStringParam(req.params.trackId);
  const itemId = asStringParam(req.params.itemId);
  if (!trackId || !Types.ObjectId.isValid(trackId) || !itemId || !Types.ObjectId.isValid(itemId)) {
    res.status(400).json({ message: 'Invalid ids.' });
    return;
  }
  try {
    const track = await JourneyTrack.findById(trackId).lean();
    if (!track || track.status !== 'published') {
      res.status(404).json({ message: 'Journey track is not available.' });
      return;
    }
    const assigned = await assignedTrackIdsForUser(userId);
    if (!assigned.has(trackId)) {
      res.status(404).json({ message: 'Journey track is not available.' });
      return;
    }
    const located = locateItem(track as unknown as IJourneyTrack, itemId);
    if (!located) {
      res.status(404).json({ message: 'Item not found.' });
      return;
    }
    if (!located.isRequired) {
      res.status(400).json({
        message:
          'Only required tasks can be marked complete. Informational items do not block progress.',
      });
      return;
    }
    await JourneyProgress.findOneAndUpdate(
      { userId, itemId: new Types.ObjectId(itemId) },
      {
        $set: {
          userId,
          trackId: new Types.ObjectId(trackId),
          checkpointId: new Types.ObjectId(located.checkpointId),
          itemId: new Types.ObjectId(itemId),
          completed: true,
          completedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );
    res.json({ ok: true, completed: true });
  } catch (err) {
    authLog.error(`[journey] completeJourneyItem failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to mark item complete.' });
  }
}

export async function uncompleteJourneyItem(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  const trackId = asStringParam(req.params.trackId);
  const itemId = asStringParam(req.params.itemId);
  if (!trackId || !Types.ObjectId.isValid(trackId) || !itemId || !Types.ObjectId.isValid(itemId)) {
    res.status(400).json({ message: 'Invalid ids.' });
    return;
  }
  try {
    const result = await JourneyProgress.updateOne(
      { userId, itemId: new Types.ObjectId(itemId) },
      { $set: { completed: false, completedAt: null } }
    );
    res.json({ ok: true, modified: result.modifiedCount });
  } catch (err) {
    authLog.error(`[journey] uncompleteJourneyItem failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to un-mark item.' });
  }
}

// ─── Ask the AI about my journey ─────────────────────────────────────

/**
 * Build a plain-text "context" from a track. Used as input to
 * the AI for "answer questions about my journey" without
 * requiring embeddings — the context is small enough (a few KB
 * per track) that lexical matching is acceptable. Embeddings
 * are still attempted; if they fail we fall back to substring.
 *
 * Format per checkpoint:
 *   ## {title}
 *   {description}
 *   - [{type}{required?}] {title} — {body}
 *   - ...
 */
function trackToContext(track: IJourneyTrack): string {
  const lines: string[] = [];
  lines.push(`# ${track.name}`);
  if (track.description) lines.push(track.description);
  lines.push('');
  for (const cp of track.checkpoints ?? []) {
    lines.push(`## ${cp.title}`);
    if (cp.description) lines.push(cp.description);
    for (const it of cp.items ?? []) {
      const req = it.required ? ' (required)' : '';
      lines.push(`- [${it.type}${req}] ${it.title}${it.body ? ` — ${it.body}` : ''}`);
      if (it.type === 'external_link' && it.href) lines.push(`  link: ${it.href}`);
    }
    lines.push('');
  }
  return lines.join('\n').slice(0, 12000); // hard cap to fit AI context
}

/**
 * Score a context block against a question by counting
 * overlapping lowercase words. Cheap, deterministic, and good
 * enough for "answer questions about a single trek" since the
 * context per track is tiny.
 */
function lexicalScore(question: string, context: string): number {
  const qTokens = new Set(
    question.toLowerCase().split(/\W+/).filter((w) => w.length >= 3)
  );
  if (qTokens.size === 0) return 0;
  const lower = context.toLowerCase();
  let score = 0;
  for (const t of qTokens) {
    // Count occurrences (capped) — "how do I submit" should match
    // contexts that mention "submit" multiple times more than
    // ones that mention it once.
    const matches = lower.split(t).length - 1;
    if (matches > 0) score += Math.min(matches, 3);
  }
  return score;
}

/**
 * POST /welcome/journeys/ask — student asks a question about
 * their assigned journey tracks. The backend assembles a
 * context from every published, assigned track for the user
 * (checkpoints + items as plain text), scores each track
 * lexically against the question, picks the top 2, and asks
 * the AI to answer.
 *
 * Returns `{ answer, tracksUsed }`.
 */
export async function askJourneyQuestion(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  const question = String((req.body as { question?: unknown })?.question ?? '').trim();
  if (!question) {
    res.status(400).json({ message: 'question is required.' });
    return;
  }
  try {
    const trackIds = await assignedTrackIdsForUser(userId);
    if (trackIds.size === 0) {
      res.json({
        answer:
          'You have no assigned journeys yet, so I cannot answer trek-specific questions. Once an admin assigns you a trek, its checkpoints and items will be searchable here.',
        tracksUsed: 0,
      });
      return;
    }
    const tracks = await JourneyTrack.find({
      _id: { $in: Array.from(trackIds).map((s) => new Types.ObjectId(s)) },
      status: 'published',
    }).lean();

    type Scored = { track: IJourneyTrack; context: string; score: number };
    const scored: Scored[] = tracks.map((t) => {
      const ctx = trackToContext(t as unknown as IJourneyTrack);
      return { track: t as unknown as IJourneyTrack, context: ctx, score: lexicalScore(question, ctx) };
    });
    scored.sort((a, b) => b.score - a.score);
    // Take top 2 with any signal; fall back to the first track
    // if nothing scored (so we always have *some* context for
    // the user to chat against, even on generic questions like
    // "summarise my trek").
    const top = scored.filter((s) => s.score > 0).slice(0, 2);
    const chosen = top.length > 0 ? top : scored.slice(0, 1);

    const contextText = chosen.map((c) => c.context).join('\n\n=====\n\n').slice(0, 16000);
    const tracksUsed = chosen.length;

    const AiClient = (await import('../ai/ai-client.service.js')).default;
    const ai = new AiClient();
    const prompt = `You are answering a question about the user's assigned "journey tracks" — guided onboarding paths with checkpoints and items. Use ONLY the context below. If the answer is not in the context, say so plainly and suggest rephrasing or contacting an admin.

CONTEXT:
---
${contextText}
---

USER QUESTION: ${question}

ANSWER (concise, conversational, cite the checkpoint title in parentheses when relevant):`;

    let answer = '';
    try {
      const result = await ai.chat(
        [{ role: 'user', content: prompt }],
        'knowledgeExtraction',
        { temperature: 0.4, maxTokens: 1024 }
      );
      answer = typeof result === 'string' ? result : (result?.content ?? '');
    } catch (err) {
      res.status(502).json({ message: 'AI generation failed.', error: (err as Error).message });
      return;
    }
    res.json({ answer, tracksUsed });
  } catch (err) {
    authLog.error(`[journey] askJourneyQuestion failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to answer journey question.' });
  }
}
