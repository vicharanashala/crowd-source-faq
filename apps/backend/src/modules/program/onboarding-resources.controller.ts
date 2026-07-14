/**
 * onboarding-resources.controller.ts — additive CMS for Onboarding
 * Resource + Onboarding Knowledge Source management.
 *
 * v1.69 — Welcome Package Management: extends the legacy Orientation
 * upload/edit/delete flow with a generalized resource system
 * (video/pdf/pptx/svg/markdown/txt/link), drag-and-drop ordering,
 * visibility controls, and an AI generation tool. The legacy
 * Orientation routes, model, and admin tab continue to work
 * unchanged — these handlers live at /admin/welcome/resources and
 * /admin/welcome/knowledge, separate URLs, separate Mongo
 * collections, separate frontend components.
 *
 * Scoping:
 *   All reads scope by `batchId` (from `req.query.batchId` or
 *   `req.programContext?.batchId`). All writes require a valid
 *   `batchId` and 400 otherwise — the same policy as the rest of
 *   the welcome-kit admin endpoints. This keeps the multi-program
 *   isolation guarantee end-to-end.
 *
 * Permissions:
 * Admin routes live behind `protect` + `adminOnly` middleware at
 * the route definition. User routes are `protect`-only.
 *
 * File upload strategy:
 *   - SVG flowcharts: browser uploads directly to Cloudinary using a
 *     server-signed URL (GET /csfaq/api/upload/sign/cloudinary/svg).
 *     The browser sends the resulting Cloudinary secure_url + public_id
 *     as JSON body fields. The backend stores the URL directly in Mongo.
 *   - All other file kinds (video/pdf/pptx/markdown/txt): multipart
 *     upload via multer disk storage to ./uploads/onboarding-resources/.
 *     Served by the static-file middleware.
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import OnboardingResource, { OnboardingResourceKind } from './onboarding-resource.model.js';
import { publicAssetUrl } from '../../utils/publicBasePath.js';
import {
  default as OnboardingKnowledgeSource,
  OnboardingKnowledgeChunk,
} from './onboarding-knowledge.model.js';

/**
 * Local batchIdFromQuery — same logic as in the welcome controller
 * so admin routes that haven't yet picked up `req.programContext`
 * still work via `?batchId=…`. Also reads the `x-program-id` /
 * `x-batch-id` / `x-workspace-id` headers — those are what the
 * frontend `api` interceptor sets on every authenticated call.
 */
function batchIdFromInput(req: { query: any; body?: any; headers?: any }): string | null {
  const fromHeader =
    (req.headers?.['x-program-id'] as string | undefined) ||
    (req.headers?.['x-batch-id'] as string | undefined) ||
    (req.headers?.['x-workspace-id'] as string | undefined);
  const raw = req.body?.batchId ?? req.query?.batchId ?? fromHeader;
  if (typeof raw !== 'string') return null;
  return Types.ObjectId.isValid(raw) ? raw : null;
}

// ─── Multer disk storage for resource uploads ────────────────────────────
//
// Stored under ./uploads/onboarding-resources/<batchId>/<timestamp>-<safe-name>.<ext>
// so cascade-delete can wipe a program's uploads by directory.
//
// v1.70 — Use import.meta.url to anchor the path to the source file
// location instead of process.cwd(). When the server runs from the
// compiled dist/ folder, cwd may not be the backend root, so a bare
// relative path like './uploads' resolves to the wrong directory.
//
// Depth (same in dev src/ and compiled dist/ because rootDir=src
// outDir=dist mirrors the directory structure):
//   dist/modules/program/ → 3 levels up → apps/backend/
//   so: ../../../uploads/onboarding-resources → apps/backend/uploads/onboarding-resources ✔
const __dirname_ctrl = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.resolve(__dirname_ctrl, '../../../uploads/onboarding-resources');
if (!fs.existsSync(uploadsRoot)) {
  fs.mkdirSync(uploadsRoot, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const batchId = batchIdFromInput(req) ?? 'unscoped';
    const dir = path.join(uploadsRoot, batchId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

export const resourceUpload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB cap; PDF/PPTX/SVG can be sizable
});

const ALLOWED_KINDS: OnboardingResourceKind[] = ['video', 'pdf', 'pptx', 'svg', 'markdown', 'txt', 'link'];
const ALLOWED_MIMES: Record<OnboardingResourceKind, string[]> = {
  video: ['video/mp4', 'video/webm', 'video/quicktime'],
  pdf: ['application/pdf'],
  pptx: [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
  ],
  svg: ['image/svg+xml'],
  markdown: ['text/markdown', 'text/x-markdown', 'text/plain'],
  txt: ['text/plain'],
  link: [],
};

/**
 * Validate that an uploaded file matches the requested kind. Returns
 * a string error message or null when OK.
 */
function validateFileForKind(kind: OnboardingResourceKind, mime: string, originalname: string): string | null {
  if (kind === 'link') return 'kind=link does not accept a file upload';
  const allowed = ALLOWED_MIMES[kind];
  // Allow unknown mime when the file extension matches (some browsers send
  // application/octet-stream for .svg and .md). Fall back to extension.
  if (!allowed.includes(mime)) {
    const ext = path.extname(originalname).toLowerCase();
    const fallbackExts: Record<OnboardingResourceKind, string[]> = {
      video: ['.mp4', '.webm', '.mov'],
      pdf: ['.pdf'],
      pptx: ['.pptx', '.ppt'],
      svg: ['.svg'],
      markdown: ['.md', '.markdown'],
      txt: ['.txt'],
      link: [],
    };
    if (!fallbackExts[kind].includes(ext)) {
      return `File mime "${mime}" and extension "${ext}" do not match kind="${kind}".`;
    }
  }
  return null;
}

// ─── Resource CRUD ──────────────────────────────────────────────────────

/**
 * GET /admin/welcome/resources
 * Lists resources scoped to the active program.
 */
export const listResources = async (req: Request, res: Response): Promise<void> => {
  try {
    const batchId = batchIdFromInput(req) ?? req.programContext?.batchId ?? null;
    if (!batchId) {
      res.status(200).json([]);
      return;
    }
    const filter: Record<string, unknown> = { batchId: new Types.ObjectId(batchId) };
    if (req.query.includeHidden !== 'true') {
      filter.visible = true;
    }
    if (typeof req.query.kind === 'string' && ALLOWED_KINDS.includes(req.query.kind as OnboardingResourceKind)) {
      filter.kind = req.query.kind;
    }
    const resources = await OnboardingResource.find(filter).sort({ order: 1, createdAt: 1 }).lean();
    res.status(200).json(resources);
  } catch (error) {
    res.status(500).json({ message: 'Error listing resources', error });
  }
};

/**
 * POST /admin/welcome/resources
 * Multipart upload for file kinds; JSON body for kind=link.
 */
export const createResource = async (req: Request, res: Response): Promise<void> => {
  try {
    const batchId = batchIdFromInput(req) ?? req.programContext?.batchId ?? null;
    if (!batchId || !Types.ObjectId.isValid(batchId)) {
      res.status(400).json({ message: 'A valid batchId is required to create a resource.' });
      return;
    }
    const kind = String(req.body?.kind ?? '') as OnboardingResourceKind;
    if (!ALLOWED_KINDS.includes(kind)) {
      res.status(400).json({ message: `kind must be one of: ${ALLOWED_KINDS.join(', ')}` });
      return;
    }
    const title = String(req.body?.title ?? '').trim();
    if (!title) {
      res.status(400).json({ message: 'title is required.' });
      return;
    }
    const description = String(req.body?.description ?? '');
    const completionThreshold = Number(req.body?.completionThreshold ?? 90);
    const visible = req.body?.visible === undefined ? true : Boolean(req.body.visible);
    const tags = Array.isArray(req.body?.tags) ? req.body.tags.filter((t: unknown) => typeof t === 'string') : [];

    // Compute order = max(existing) + 1 within the program so the new
    // resource appears at the end of the drag-drop list.
    const last = await OnboardingResource.findOne({ batchId: new Types.ObjectId(batchId) })
      .sort({ order: -1 })
      .select('order')
      .lean();
    const order = (last?.order ?? -1) + 1;

    let url = '';
    let publicId: string | null = null;
    let filePath: string | null = null;
    let fileMime: string | null = null;
    let fileSizeBytes: number | null = null;

    if (kind === 'link') {
      url = String(req.body?.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) {
        res.status(400).json({ message: 'kind=link requires a URL starting with http:// or https://' });
        return;
      }
    } else if (kind === 'svg') {
      // SVG flowcharts are uploaded directly to Cloudinary by the browser.
      // The admin POSTs the JSON metadata (url + publicId) instead of a
      // multipart file. We validate the URL is from our Cloudinary account.
      url = String(req.body?.url ?? '').trim();
      publicId = req.body?.publicId ? String(req.body.publicId) : null;
      if (!url) {
        res.status(400).json({ message: 'kind=svg requires a url (Cloudinary secure_url).' });
        return;
      }
      if (!url.startsWith('https://res.cloudinary.com/')) {
        res.status(400).json({ message: 'kind=svg url must be a Cloudinary secure_url.' });
        return;
      }
      // filePath / fileMime / fileSizeBytes stay null for Cloudinary SVGs.
    } else {
      // All other file kinds (video/pdf/pptx/markdown/txt): multipart upload.
      const file = (req as unknown as { file?: Express.Multer.File }).file;
      if (!file) {
        res.status(400).json({ message: `kind=${kind} requires a file upload.` });
        return;
      }
      const err = validateFileForKind(kind, file.mimetype, file.originalname);
      if (err) {
        // Best-effort cleanup of the just-uploaded file.
        try { fs.unlinkSync(file.path); } catch { /* ignore */ }
        res.status(400).json({ message: err });
        return;
      }
      url = publicAssetUrl(`/uploads/onboarding-resources/${batchId}/${path.basename(file.path)}`);
      filePath = file.path;
      fileMime = file.mimetype;
      fileSizeBytes = file.size;
    }

    const doc = await OnboardingResource.create({
      batchId: new Types.ObjectId(batchId),
      kind,
      title,
      description,
      url,
      publicId,
      filePath,
      fileMime,
      fileSizeBytes,
      completionThreshold,
      order,
      visible,
      tags,
    });
    res.status(201).json(doc);
  } catch (error) {
    res.status(500).json({ message: 'Error creating resource', error });
  }
};

/**
 * PUT /admin/welcome/resources/:id
 * Update metadata (title/description/completionThreshold/visible/tags).
 * Doesn't accept a new file in this endpoint — admins delete + recreate
 * to swap the file.
 */
export const updateResource = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'A valid resource id is required.' });
      return;
    }
    const update: Record<string, unknown> = {};
    if (typeof req.body?.title === 'string') update.title = req.body.title.trim();
    if (typeof req.body?.description === 'string') update.description = req.body.description;
    if (typeof req.body?.completionThreshold === 'number') update.completionThreshold = req.body.completionThreshold;
    if (typeof req.body?.visible === 'boolean') update.visible = req.body.visible;
    if (Array.isArray(req.body?.tags)) update.tags = req.body.tags.filter((t: unknown) => typeof t === 'string');

    const doc = await OnboardingResource.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!doc) {
      res.status(404).json({ message: 'Resource not found.' });
      return;
    }
    res.status(200).json(doc);
  } catch (error) {
    res.status(500).json({ message: 'Error updating resource', error });
  }
};

/**
 * DELETE /admin/welcome/resources/:id
 * Removes the resource row + its uploaded file (if any).
 */
export const deleteResource = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'A valid resource id is required.' });
      return;
    }
    const doc = await OnboardingResource.findById(id);
    if (!doc) {
      res.status(404).json({ message: 'Resource not found.' });
      return;
    }
    if (doc.filePath) {
      try { fs.unlinkSync(doc.filePath); } catch { /* best effort */ }
    }
    await doc.deleteOne();
    res.status(200).json({ message: 'Resource deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting resource', error });
  }
};

/**
 * PUT /admin/welcome/resources/reorder
 * Body: `{ batchId, order: [{ id, order }, ...] }`.
 * Persists a new order in a single transaction (best-effort —
 * OnboardingResource is a small collection).
 */
export const reorderResources = async (req: Request, res: Response): Promise<void> => {
  try {
    const batchId = batchIdFromInput(req) ?? req.programContext?.batchId ?? null;
    if (!batchId || !Types.ObjectId.isValid(batchId)) {
      res.status(400).json({ message: 'A valid batchId is required to reorder resources.' });
      return;
    }
    const order = Array.isArray(req.body?.order) ? req.body.order : [];
    if (!Array.isArray(order) || order.length === 0) {
      res.status(400).json({ message: 'order array is required.' });
      return;
    }
    const updates = await Promise.all(
      order.map((entry: { id?: string; order?: number }) => {
        if (!entry.id || !Types.ObjectId.isValid(entry.id) || typeof entry.order !== 'number') {
          return Promise.resolve(null);
        }
        return OnboardingResource.updateOne(
          { _id: new Types.ObjectId(entry.id), batchId: new Types.ObjectId(batchId) },
          { $set: { order: entry.order } },
        );
      }),
    );
    res.status(200).json({ updated: updates.filter(Boolean).length });
  } catch (error) {
    res.status(500).json({ message: 'Error reordering resources', error });
  }
};

/**
 * PUT /admin/welcome/resources/:id/visibility
 * Quick toggle: `{ visible: boolean }`.
 */
export const setResourceVisibility = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'A valid resource id is required.' });
      return;
    }
    const visible = Boolean(req.body?.visible);
    const doc = await OnboardingResource.findByIdAndUpdate(
      id,
      { $set: { visible } },
      { new: true },
    );
    if (!doc) {
      res.status(404).json({ message: 'Resource not found.' });
      return;
    }
    res.status(200).json(doc);
  } catch (error) {
    res.status(500).json({ message: 'Error updating visibility', error });
  }
};

// ─── Knowledge sources ──────────────────────────────────────────────────

const knowledgeStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const batchId = batchIdFromInput(req) ?? 'unscoped';
    const dir = path.join(uploadsRoot, 'knowledge', batchId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

export const knowledgeUpload = multer({
  storage: knowledgeStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

/**
 * Chunk text into ~800-char windows with a 100-char overlap. This is
 * the same shape used elsewhere in the codebase (DocumentInsight,
 * ZoomTranscriptChunk) so future AI workflows can apply consistent
 * context windows across knowledge sources.
 */
function chunkText(text: string, chunkSize = 800, overlap = 100): string[] {
  if (!text) return [];
  const cleaned = text.replace(/\r\n/g, '\n').trim();
  if (cleaned.length <= chunkSize) return [cleaned];
  const out: string[] = [];
  let i = 0;
  while (i < cleaned.length) {
    const end = Math.min(cleaned.length, i + chunkSize);
    out.push(cleaned.slice(i, end));
    if (end === cleaned.length) break;
    i += chunkSize - overlap;
  }
  return out;
}

/**
 * GET /admin/welcome/knowledge — list knowledge sources for a program.
 */
export const listKnowledgeSources = async (req: Request, res: Response): Promise<void> => {
  try {
    const batchId = batchIdFromInput(req) ?? req.programContext?.batchId ?? null;
    if (!batchId) {
      res.status(200).json([]);
      return;
    }
    const sources = await OnboardingKnowledgeSource.find({ batchId: new Types.ObjectId(batchId) })
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json(sources);
  } catch (error) {
    res.status(500).json({ message: 'Error listing knowledge sources', error });
  }
};

/**
 * POST /admin/welcome/knowledge — create a knowledge source.
 * Body: `{ batchId, kind, title, description?, body?, fileName? }`.
 * File uploads use multipart and additionally accept `file` for the
 * body. We chunk + write embeddings.
 */
export const createKnowledgeSource = async (req: Request, res: Response): Promise<void> => {
  try {
    const batchId = batchIdFromInput(req) ?? req.programContext?.batchId ?? null;
    if (!batchId || !Types.ObjectId.isValid(batchId)) {
      res.status(400).json({ message: 'A valid batchId is required to create a knowledge source.' });
      return;
    }
    const kind = String(req.body?.kind ?? 'pasted');
    if (!['pasted', 'transcript', 'knowledge_base'].includes(kind)) {
      res.status(400).json({ message: 'kind must be one of: pasted, transcript, knowledge_base' });
      return;
    }
    const title = String(req.body?.title ?? '').trim();
    if (!title) {
      res.status(400).json({ message: 'title is required.' });
      return;
    }
    let body = String(req.body?.body ?? '');
    let fileName: string | null = null;
    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (file) {
      // Read uploaded file from disk into body.
      body = fs.readFileSync(file.path, 'utf8');
      fileName = file.originalname;
      try { fs.unlinkSync(file.path); } catch { /* keep uploaded tmp around if cleanup fails */ }
    }
    if (!body.trim()) {
      res.status(400).json({ message: 'body is required (paste text or upload a file).' });
      return;
    }

    const source = await OnboardingKnowledgeSource.create({
      batchId: new Types.ObjectId(batchId),
      kind,
      title,
      description: String(req.body?.description ?? ''),
      body,
      sourceResourceId: req.body?.sourceResourceId && Types.ObjectId.isValid(req.body.sourceResourceId)
        ? new Types.ObjectId(req.body.sourceResourceId)
        : null,
      fileName,
      charCount: body.length,
      indexed: true,
    });

    // Index: chunk + embed. Embedding is best-effort — failures are
    // logged but do not block source creation. The Q&A endpoint will
    // fall back to lexical search if no embeddings exist.
    try {
      const { generateEmbedding } = await import('../../utils/ai/embeddings.js');
      const chunks = chunkText(body);
      const docs = [] as Array<{ sourceId: Types.ObjectId; batchId: Types.ObjectId; index: number; text: string; embedding: number[] }>;
      for (let i = 0; i < chunks.length; i++) {
        const text = chunks[i];
        let embedding: number[] = [];
        try {
          embedding = await generateEmbedding(text);
        } catch {
          embedding = [];
        }
        docs.push({
          sourceId: source._id,
          // source.batchId is ObjectId | null in the model; the chunk
          // schema requires a non-null ObjectId, so fall back to the
          // program's id when the legacy row is missing one.
          batchId: source.batchId ?? new Types.ObjectId(),
          index: i,
          text,
          embedding,
        });
      }
      if (docs.length > 0) {
        await OnboardingKnowledgeChunk.insertMany(docs);
      }
    } catch (err) {
      // Don't fail the source create — just log.
      console.warn('[knowledge-source] embedding failed:', (err as Error).message);
    }

    res.status(201).json(source);
  } catch (error) {
    res.status(500).json({ message: 'Error creating knowledge source', error });
  }
};

/**
 * DELETE /admin/welcome/knowledge/:id — remove a source + its chunks.
 */
export const deleteKnowledgeSource = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'A valid knowledge source id is required.' });
      return;
    }
    await OnboardingKnowledgeChunk.deleteMany({ sourceId: new Types.ObjectId(id) });
    const result = await OnboardingKnowledgeSource.deleteOne({ _id: new Types.ObjectId(id) });
    if (result.deletedCount === 0) {
      res.status(404).json({ message: 'Knowledge source not found.' });
      return;
    }
    res.status(200).json({ message: 'Knowledge source deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting knowledge source', error });
  }
};

/**
 * GET /admin/welcome/knowledge/:id/chunks — return the indexed chunks
 * for a source so admins can preview what the AI sees.
 */
export const getKnowledgeChunks = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'A valid knowledge source id is required.' });
      return;
    }
    const chunks = await OnboardingKnowledgeChunk.find({ sourceId: new Types.ObjectId(id) })
      .select('-embedding') // don't ship the full vector to the admin UI
      .sort({ index: 1 })
      .lean();
    res.status(200).json(chunks);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching chunks', error });
  }
};

// ─── AI generation (admin tools) ────────────────────────────────────────

/**
 * POST /admin/welcome/knowledge/:id/generate
 * Body: `{ kind: 'faqs' | 'quiz' | 'summary' | 'timeline' | 'flashcards', count?: number }`.
 * Returns the generated content as plain text/JSON. The admin can
 * copy it or save it into the appropriate collection.
 *
 * Implementation uses the existing AiClient + a chunk-retrieval
 * fallback. If the source has no embeddings (best-effort indexing
 * failed), we use the full source body. If the source has many
 * chunks, we sample a representative subset to keep prompts under
 * the model context window.
 */
export const generateFromKnowledge = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'A valid knowledge source id is required.' });
      return;
    }
    const source = await OnboardingKnowledgeSource.findById(id).lean();
    if (!source) {
      res.status(404).json({ message: 'Knowledge source not found.' });
      return;
    }
    const kind = String(req.body?.kind ?? '');
    const count = Math.min(50, Math.max(1, Number(req.body?.count ?? 8)));
    if (!['faqs', 'quiz', 'summary', 'timeline', 'flashcards'].includes(kind)) {
      res.status(400).json({ message: 'kind must be one of: faqs, quiz, summary, timeline, flashcards' });
      return;
    }

    // Build the prompt's "context" section. Prefer the most relevant
    // chunks; if embeddings are missing for all chunks, fall back to
    // the full body truncated to a safe size.
    const chunks = await OnboardingKnowledgeChunk.find({ sourceId: source._id })
      .sort({ index: 1 })
      .lean();
    let contextText = '';
    if (chunks.length === 0) {
      contextText = source.body.slice(0, 8000);
    } else {
      // Take the first N chunks plus a sample from the rest so the
      // prompt captures structure + middle of long sources.
      const head = chunks.slice(0, Math.min(8, chunks.length));
      const tail = chunks.length > 8
        ? chunks.slice(Math.floor(chunks.length / 2), Math.floor(chunks.length / 2) + 4)
        : [];
      contextText = [...head, ...tail].map((c) => c.text).join('\n\n---\n\n').slice(0, 12000);
    }

    const AiClient = (await import('../ai/ai-client.service.js')).default;
    const ai = new AiClient();
    const prompt = buildGenerationPrompt(kind, contextText, count, source.title);

    let generated = '';
    try {
      // The AiClient exposes a `chat(messages, feature, overrides)` API.
      // We treat our knowledge generation as a generic text feature.
      const result = await ai.chat(
        [{ role: 'user', content: prompt }],
        'knowledgeExtraction',
        { temperature: 0.4, maxTokens: 2048 },
      );
      generated = typeof result === 'string' ? result : (result?.content ?? '');
    } catch (err) {
      res.status(502).json({ message: 'AI generation failed.', error: (err as Error).message });
      return;
    }

    res.status(200).json({ kind, count, generated });
  } catch (error) {
    res.status(500).json({ message: 'Error generating content', error });
  }
};

function buildGenerationPrompt(kind: string, context: string, count: number, title: string): string {
  const header = `You are generating structured educational content for the onboarding program "${title}". ` +
    `Use ONLY information from the SOURCE below. Output well-formed markdown.`;

  const body = `\n\nSOURCE:\n---\n${context}\n---\n\n`;

  switch (kind) {
    case 'faqs':
      return `${header}${body}Generate ${count} frequently asked questions that a new program member might ask, each followed by a clear, concise answer sourced from the SOURCE. Use a markdown heading per question and a short paragraph for each answer.`;
    case 'quiz':
      return `${header}${body}Generate a ${count}-question multiple-choice quiz. Each question should have exactly 4 options (A/B/C/D), one correct answer, and a one-line explanation that cites the SOURCE. Format as a numbered list with sub-bullets for options and a "Correct: X" line.`;
    case 'summary':
      return `${header}${body}Write a comprehensive summary of the SOURCE, organized into 4–6 named sections with markdown headings. Keep each section to 2–4 sentences. End with a "Key takeaways" bulleted list (5 items max).`;
    case 'timeline':
      return `${header}${body}Build a chronological timeline of the key steps, milestones, or phases described in the SOURCE. Use a markdown bullet list with an ISO date or relative phase marker (e.g. "Week 1") and a 1-sentence description per item.`;
    case 'flashcards':
      return `${header}${body}Generate ${count} flashcards. Each flashcard has a "front" (a question or term) and a "back" (a concise answer) drawn from the SOURCE. Format as a numbered list with ` + "`Front:` / `Back:`" + ` lines.`;
    default:
      return `${header}${body}Summarize the SOURCE.`;
  }
}

// ─── Student-side viewer (read-only) ────────────────────────────────────

/**
 * GET /welcome/resources — students see only visible resources in
 * the active program. Sorted by `order` ascending.
 */
export const listPublicResources = async (req: Request, res: Response): Promise<void> => {
  try {
    const batchId = batchIdFromInput(req) ?? null;
    if (!batchId) {
      res.status(200).json([]);
      return;
    }
    const resources = await OnboardingResource.find({
      batchId: new Types.ObjectId(batchId),
      visible: true,
    })
      .sort({ order: 1, createdAt: 1 })
      .select('-filePath -fileMime -fileSizeBytes')
      .lean();
    res.status(200).json(resources);
  } catch (error) {
    res.status(500).json({ message: 'Error listing resources', error });
  }
};

/**
 * POST /welcome/resources/:id/complete — student marks a resource as
 * completed. Backend records the completion timestamp + duration; the
 * frontend sends the actual time-spent (in seconds). The legacy
 * orientation /welcome/orientation-complete route is unchanged;
 * this is a parallel endpoint.
 *
 * For now we persist completion by upserting a tiny doc into a
 * dedicated collection. That's enough for the audit log; richer
 * analytics can build on this later.
 */
export const completeResource = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'A valid resource id is required.' });
      return;
    }
    const userId = (req as unknown as { user?: { _id?: Types.ObjectId | string } }).user?._id;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    const resource = await OnboardingResource.findById(id).lean();
    if (!resource || !resource.visible) {
      res.status(404).json({ message: 'Resource not found.' });
      return;
    }
    const { default: ResourceCompletion } = await import('./resource-completion.model.js');
    await ResourceCompletion.findOneAndUpdate(
      { resourceId: resource._id, userId: new Types.ObjectId(String(userId)) },
      {
        $set: {
          durationSeconds: Math.max(0, Number(req.body?.durationSeconds ?? 0)),
          completedAt: new Date(),
          batchId: resource.batchId,
          kind: resource.kind,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: 'Error completing resource', error });
  }
};

/**
 * GET /welcome/resources/completions — returns the student's per-
 * resource completion timestamps, keyed by resource id.
 */
export const getMyCompletions = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as unknown as { user?: { _id?: Types.ObjectId | string } }).user?._id;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    const { default: ResourceCompletion } = await import('./resource-completion.model.js');
    const rows = await ResourceCompletion.find({ userId: new Types.ObjectId(String(userId)) })
      .select('resourceId completedAt durationSeconds')
      .lean();
    const map: Record<string, { completedAt: string; durationSeconds: number }> = {};
    for (const row of rows) {
      map[String(row.resourceId)] = {
        completedAt: (row as { completedAt: Date }).completedAt.toISOString(),
        durationSeconds: (row as { durationSeconds: number }).durationSeconds,
      };
    }
    res.status(200).json(map);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching completions', error });
  }
};

/**
 * POST /welcome/resources/ask — student asks a question; the backend
 * retrieves the most relevant chunks across all knowledge sources
 * for the active program and forwards to the AI.
 */
export const askKnowledgeQuestion = async (req: Request, res: Response): Promise<void> => {
  try {
    const batchId = batchIdFromInput(req) ?? null;
    if (!batchId) {
      res.status(400).json({ message: 'No active program.' });
      return;
    }
    const question = String(req.body?.question ?? '').trim();
    if (!question) {
      res.status(400).json({ message: 'question is required.' });
      return;
    }
    // Embed the question and find the top-K similar chunks across
    // every indexed knowledge source in the program.
    const { generateEmbedding } = await import('../../utils/ai/embeddings.js');
    let queryVec: number[] = [];
    try {
      queryVec = await generateEmbedding(question);
    } catch {
      queryVec = [];
    }
    const sources = await OnboardingKnowledgeSource.find({ batchId: new Types.ObjectId(batchId), indexed: true })
      .select('_id')
      .lean();
    const sourceIds = sources.map((s: { _id: Types.ObjectId }) => s._id);
    const allChunks = await OnboardingKnowledgeChunk.find({ sourceId: { $in: sourceIds } })
      .select('text embedding')
      .lean();

    type Scored = { text: string; score: number };
    let topChunks: Scored[] = [];
    if (queryVec.length > 0) {
      topChunks = allChunks
        .map((c): Scored => ({
          text: c.text,
          score: cosineSimilarity(queryVec, (c.embedding as number[]) ?? []),
        }))
        .filter((c) => Number.isFinite(c.score))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    } else {
      // No embedding — fall back to lexical substring match.
      const q = question.toLowerCase();
      topChunks = allChunks
        .map((c): Scored => ({ text: c.text, score: (c.text.toLowerCase().includes(q) ? 1 : 0) }))
        .filter((c) => c.score > 0)
        .slice(0, 5);
    }

    const contextText = topChunks.length > 0
      ? topChunks.map((c) => c.text).join('\n\n---\n\n')
      : '';

    const AiClient = (await import('../ai/ai-client.service.js')).default;
    const ai = new AiClient();
    const prompt = contextText
      ? `Answer the user's question using ONLY the context below. If the answer is not in the context, say you don't know.\n\nCONTEXT:\n---\n${contextText.slice(0, 8000)}\n---\n\nUSER QUESTION: ${question}\n\nANSWER:`
      : `You do not have any indexed knowledge for this program. Tell the user that the program admins haven't indexed any materials yet. Keep the response short.\n\nUSER QUESTION: ${question}`;

    let answer = '';
    try {
      const result = await ai.chat(
        [{ role: 'user', content: prompt }],
        'knowledgeExtraction',
        { temperature: 0.4, maxTokens: 1024 },
      );
      answer = typeof result === 'string' ? result : (result?.content ?? '');
    } catch (err) {
      res.status(502).json({ message: 'AI generation failed.', error: (err as Error).message });
      return;
    }
    res.status(200).json({
      question,
      answer,
      sourcesUsed: topChunks.length,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error answering question', error });
  }
};

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}