import { type Request, type Response } from 'express';
import mongoose from 'mongoose';
import {
  processZoomMeetingForKnowledge,
  processHighUpvotePosts as extractHighUpvoteKnowledge,
  promoteToFAQ as promoteKnowledgeToFAQ,
  embedUnprocessedKnowledge,
  searchKnowledge,
} from './knowledge-base.service.js';
import { runRag } from '../ai/rag.service.js';
import { TranscriptKnowledge } from './transcript-knowledge.model.js';
import { adminLog } from '../../utils/http/logger.js';

// ─── List all knowledge entries ──────────────────────────────────────────────

export const listKnowledge = async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1')));
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '20'))));
  const status = req.query.status as string | undefined;
  const source = req.query.source as string | undefined;

  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (source) filter.source = source;

  const [entries, total] = await Promise.all([
    TranscriptKnowledge.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    TranscriptKnowledge.countDocuments(filter),
  ]);

  res.json({ entries, page, limit, total, pages: Math.ceil(total / limit) });
};

// ─── Trigger knowledge extraction from a Zoom meeting ────────────────────────

export const triggerMeetingProcess = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const count = await processZoomMeetingForKnowledge(id);
    const embedded = await embedUnprocessedKnowledge();
    res.json({ message: `Processed ${count} entries, embedded ${embedded} new vectors` });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
};

// ─── Process high-upvote community posts ─────────────────────────────────────

export const processHighUpvotePosts = async (_req: Request, res: Response): Promise<void> => {
  try {
    const count = await extractHighUpvoteKnowledge();
    res.json({ message: `Processed ${count} high-upvote posts` });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
};

// ─── Approve a knowledge entry ────────────────────────────────────────────────

export const approveKnowledge = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const id = String(req.params.id);
    const entry = await TranscriptKnowledge.findByIdAndUpdate(
      id,
      { status: 'approved', reviewedBy: req.user._id, reviewedAt: new Date() },
      { new: true }
    );
    if (!entry) { res.status(404).json({ message: 'Not found' }); return; }
    res.json({ entry });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
};

// ─── Reject a knowledge entry ─────────────────────────────────────────────────

export const rejectKnowledge = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const id = String(req.params.id);
    const entry = await TranscriptKnowledge.findByIdAndUpdate(
      id,
      { status: 'rejected', reviewedBy: req.user._id, reviewedAt: new Date() },
      { new: true }
    );
    if (!entry) { res.status(404).json({ message: 'Not found' }); return; }
    res.json({ entry });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
};

// ─── Promote a knowledge entry to FAQ ────────────────────────────────────────

export const promoteToFAQ = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const id = String(req.params.id);
    // Null-check before promoting — matches the pattern in approveKnowledge /
    // rejectKnowledge. Without this, a bogus id hits the service's
    // "Knowledge entry not found" throw and surfaces as a misleading 500.
    const existing = await TranscriptKnowledge.findById(id).select('_id').lean();
    if (!existing) { res.status(404).json({ message: 'Knowledge entry not found' }); return; }
    const faqId = await promoteKnowledgeToFAQ(id, req.user._id.toString());
    const entry = await TranscriptKnowledge.findById(id);
    res.json({ message: `Promoted to FAQ ${faqId}`, faqId, entry });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
};

// ─── Answer a community post from the knowledge base ─────────────────────────

export const answerFromKnowledgeController = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const { answerFromKnowledge } = await import('./knowledge-base.service.js');
    // Express 5 types req.params values as `string | string[]` — coerce to string.
    const postId = String(req.params.postId);
    const result = await answerFromKnowledge(postId);
    if (!result.answered) { res.status(404).json({ message: 'No matching knowledge found' }); return; }
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
};

// ─── Ask AI: thin wrapper over the proper RAG pipeline ────────────────────────
//
// Delegates to services/rag.ts (runRag) which does vector + text + RRF fusion
// across FAQs, Community, and TranscriptKnowledge. We only translate the
// result into the shape the frontend AskAIButton consumes (sources → { kind,
// title, snippet, score, href, id }).

// Public — anonymous users get 5 free searches per browser (enforced on
// the client via localStorage); logged-in users are unlimited. Backend abuse
// protection lives in the per-IP rate limiter mounted on this route.
//
// Multipart uploads (file/image attachments) are accepted; multer runs on
// this route only when Content-Type is multipart/form-data, so plain JSON
// requests pass through unchanged. Attachments are read into memory
// (capped at 10 MB each, max 4 files) and passed to runRag() as multi-part
// content — text files inlined into the prompt, images sent as vision input.
export const askAIController = async (req: Request, res: Response): Promise<void> => {
  try {
    // For multipart requests, the question is a form field; for JSON, it's in body.
    // Accept the question from any of these (precedence order):
    //   body.question    — frontend AskAIButton uses this
    //   body.query       — Discord /ask bot (and a few test clients) use this
    //   ?q= / ?query=    — URL fallback for browser address bar / curl / proxies
    // Body wins over URL when both are present.
    const body = (req.body ?? {}) as { question?: string; query?: string };
    const fromBody = String(body.question ?? body.query ?? '').trim();
    const fromUrl = String(req.query.q ?? req.query.query ?? '').trim();
    const question = fromBody || fromUrl;
    if (question.length < 3) {
      res.status(400).json({ message: 'Question must be at least 3 characters' });
      return;
    }

    // Parse uploaded files (if any) into RagAttachment shape. The multer
    // fileFilter in routes/askAi.ts has already validated mime types; we
    // just translate to the structure runRag expects.
    type MulterFile = { fieldname: string; originalname: string; mimetype: string; buffer: Buffer; size: number };
    const files: MulterFile[] = (req as Request & { files?: MulterFile[] }).files ?? [];
    const attachments: { kind: 'image' | 'text'; mimeType: string; data: string; filename: string }[] = [];
    for (const f of files) {
      if (f.mimetype.startsWith('image/')) {
        attachments.push({
          kind: 'image',
          mimeType: f.mimetype,
          data: f.buffer.toString('base64'),
          filename: f.originalname,
        });
      } else {
        // Text-ish: read as UTF-8. Cap at 50 KB of inlined text per file
        // to keep the prompt bounded; the rest is dropped with a marker.
        const MAX_TEXT = 50 * 1024;
        const raw = f.buffer.toString('utf-8');
        const truncated = raw.length > MAX_TEXT;
        const data = truncated ? `${raw.slice(0, MAX_TEXT)}\n[...truncated...]` : raw;
        attachments.push({ kind: 'text', mimeType: f.mimetype, data, filename: f.originalname });
      }
    }

    // Minimum-relevance thresholds per source type, because RRF scores (FAQ /
    // community) max out around 0.020 while vector-search scores (knowledge)
    // go up to 1.0. A single threshold either lets too much FAQ noise through
    // or filters out the real KB hits. The numbers below are tuned against
    // the live RRF and `searchKnowledge` ranges observed in practice.
    const THRESHOLDS: Record<string, number> = {
      faq: 0.025,        // top-rank RRF hit
      community: 0.025,  // top-rank RRF hit
      knowledge: 0.35,   // meaningful vector similarity
    };
    const DEFAULT_THRESHOLD = 0.05;

    const t0 = Date.now();
    let result: { answer: string; sources: Array<{ id: string; type: string; title: string; snippet: string; url: string; score: number }>; model: string };
    let aiFailed = false;
    try {
      result = await runRag(question, attachments);
    } catch (ragErr) {
      // AI provider is down / rate-limited / unauthorized. The vector + text
      // searches inside runRag also failed because they're the same call.
      // Fall back to keyword search only (knowledge base), which doesn't
      // depend on the AI provider. This way the user still sees relevant
      // sources and can click through to the full FAQ/post.
      adminLog.warn('[askAI] runRag failed, falling back to KB-only search', { error: (ragErr as Error).message });
      const kbMatches = await searchKnowledge(question, 6);
      result = {
        answer: '',
        model: 'fallback',
        sources: kbMatches.map((m) => ({
          id: m._id,
          type: 'knowledge',
          title: m.question,
          snippet: m.answer,
          url: `/faq?from-knowledge=${m._id}`,
          score: m.score,
        })),
      };
      aiFailed = true;
    }
    adminLog.info('[askAI] rag.completed', { ms: Date.now() - t0, sourceCount: result.sources.length, attachments: attachments.length, aiFailed });

    // Translate RagSource → SourceHit shape for the frontend.
    const sources = result.sources.map((s) => ({
      kind: s.type,
      title: s.title,
      snippet: s.snippet,
      score: Number(s.score.toFixed(4)),
      href: s.url,
      id: s.id,
    }));

    // Per-source-type threshold filter — strip the noise so the user (and
    // the fallback snippet) see only genuinely relevant matches.
    const relevantSources = sources.filter((s) => {
      const t = (THRESHOLDS[s.kind] ?? DEFAULT_THRESHOLD);
      return s.score >= t;
    });

    // Re-rank: only the relevant sources, sorted by score desc.
    const ranked = [...relevantSources].sort((a, b) => b.score - a.score);

    let answer = result.answer;
    if (relevantSources.length === 0) {
      answer = "I couldn't find anything in the FAQs, community, or your team's Zoom knowledge base that clearly answers this. Try rephrasing the question, or post a new community question.";
    } else if (aiFailed || !result.answer || result.answer.trim().length < 10) {
      // AI synthesis unavailable — show the top source's snippet directly
      // and let the user click through to read the full entry.
      const top = ranked[0];
      answer = top.snippet + (ranked.length > 1
        ? `\n\n(Showing the most relevant match — ${ranked.length} sources found. AI synthesis is temporarily unavailable; click a source card to read the full answer.)`
        : `\n\n(AI synthesis is temporarily unavailable; click the source below to read the full answer.)`);
    }

    // Mark each source as relevant (above per-type threshold) so the
    // frontend can dim/grey-out the noise.
    res.json({
      question,
      answer,
      sources: sources.map((s) => {
        const t = (THRESHOLDS[s.kind] ?? DEFAULT_THRESHOLD);
        return { ...s, aboveThreshold: s.score >= t };
      }),
      relevantCount: ranked.length,
      sourceCount: sources.length,
      model: result.model,
      aiFailed,
    });
  } catch (err) {
    adminLog.error('[askAI] failed', { error: (err as Error).message });
    res.status(500).json({ message: (err as Error).message });
  }
};