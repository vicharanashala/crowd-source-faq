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

    // ─── Relevance thresholds ─────────────────────────────────────────────────
    // RRF formula: 1/(60 + rank). Max score for rank-1 single-list ≈ 0.0164.
    // A result appearing in BOTH vector and text lists at rank-1 scores ≈ 0.033.
    //
    // HIGH_THRESHOLDS → confident direct answer (score ≥ this OR word overlap ≥ 60%)
    // LOW_THRESHOLDS  → show as "related" suggestion (dimmed expandable card)
    const HIGH_THRESHOLDS: Record<string, number> = {
      faq: 0.012,        // rank-1 in either vector OR text list
      community: 0.012,
      knowledge: 0.35,   // meaningful vector cosine similarity
    };
    const LOW_THRESHOLDS: Record<string, number> = {
      faq: 0.005,
      community: 0.005,
      knowledge: 0.15,
    };
    const DEFAULT_HIGH = 0.012;
    const DEFAULT_LOW  = 0.005;

    // ─── Word-overlap ratio ───────────────────────────────────────────────────
    // Count how many of the query's meaningful words appear in the source title.
    // Ratio = matched / total_query_words.
    // If ratio ≥ 60% → treat as a direct answer regardless of RRF score.
    // "get", "upload", "submit" etc. are NOT stop words — they discriminate
    // between "how to GET noc" vs "how to UPLOAD noc".
    const STOP_WORDS = new Set([
      'a', 'an', 'the', 'is', 'it', 'i', 'my', 'do',
      'how', 'what', 'when', 'where', 'why', 'can', 'will', 'to', 'of',
      'in', 'on', 'at', 'for', 'and', 'or', 'not', 'be', 'by', 'are',
      'was', 'has', 'me', 'we', 'up',
    ]);
    const queryWords = question.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

    function wordOverlapRatio(title: string): { count: number; ratio: number } {
      if (!queryWords.length) return { count: 0, ratio: 0 };
      const titleLower = title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
      const count = queryWords.filter((w) => titleLower.includes(w)).length;
      return { count, ratio: count / queryWords.length };
    }

    const t0 = Date.now();
    let result: { answer: string; sources: Array<{ id: string; type: string; title: string; snippet: string; url: string; score: number }>; model: string };
    let aiFailed = false;
    try {
      result = await runRag(question, attachments);
    } catch (ragErr) {
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

    // Translate RagSource → SourceHit shape (with word overlap scores attached).
    const sources = result.sources.map((s) => ({
      kind: s.type,
      title: s.title,
      snippet: s.snippet,
      score: Number(s.score.toFixed(4)),
      href: s.url,
      id: s.id,
      ...wordOverlapRatio(s.title),
    }));

    // ─── Classify each source ─────────────────────────────────────────────────
    // relevant  → score ≥ HIGH threshold OR word overlap ratio ≥ 60% (direct answer)
    // related   → score ≥ LOW threshold only (expandable suggestion card)
    // noise     → below LOW threshold (excluded entirely)
    const WORD_RATIO_THRESHOLD = 0.60;

    const relevantSources = sources.filter((s) => {
      const high = HIGH_THRESHOLDS[s.kind] ?? DEFAULT_HIGH;
      const isWordMatch = s.kind !== 'knowledge' && s.count >= 1 && s.ratio >= WORD_RATIO_THRESHOLD;
      return s.score >= high || isWordMatch;
    });

    const relatedSources = sources.filter((s) => {
      const low  = LOW_THRESHOLDS[s.kind]  ?? DEFAULT_LOW;
      const high = HIGH_THRESHOLDS[s.kind] ?? DEFAULT_HIGH;
      const isWordMatch = s.kind !== 'knowledge' && s.count >= 1 && s.ratio >= WORD_RATIO_THRESHOLD;
      const isRelevant  = s.score >= high || isWordMatch;
      return !isRelevant && s.score >= low;
    });

    // Re-rank relevant sources: highest word ratio first, then score.
    const ranked = [...relevantSources].sort((a, b) =>
      (b.ratio - a.ratio) || (b.score - a.score)
    );

    // Sort related sources: most semantically close card first (auto-expands).
    const sortedRelated = [...relatedSources].sort((a, b) =>
      (b.ratio - a.ratio) || (b.score - a.score)
    );

    // ─── Build answer text ────────────────────────────────────────────────────
    let answer = result.answer;
    let answerType: 'direct' | 'related' | 'none' = 'direct';

    if (relevantSources.length === 0 && relatedSources.length === 0) {
      // Nothing useful found at all
      answerType = 'none';
      answer = "I couldn't find anything matching your question in the FAQs, community, or Zoom knowledge base. Try rephrasing, or post a new community question.";
    } else if (relevantSources.length === 0 && relatedSources.length > 0) {
      // No direct match — show expandable related question cards
      answerType = 'related';
      answer = `Couldn't find a specific match for your question. Here are some related questions that might help — click any to see the answer:`;
    } else if (aiFailed || !result.answer || result.answer.trim().length < 10) {
      // Have a direct match but AI synthesis is unavailable — show snippet
      const top = ranked[0];
      answer = top.snippet + (ranked.length > 1
        ? `\n\n(Showing the most relevant match — ${ranked.length} sources found. AI synthesis is temporarily unavailable; click a source card to read the full answer.)`
        : `\n\n(AI synthesis is temporarily unavailable; click the source below to read the full answer.)`);
    }

    // ─── Build source list for frontend ──────────────────────────────────────
    // For 'related': only the expandable related cards (no direct sources).
    // For 'direct': relevant sources first, then any related ones as extras.
    const allDisplaySources = answerType === 'related'
      ? sortedRelated.map((s) => ({ ...s, aboveThreshold: false }))
      : [
          ...relevantSources.map((s) => ({ ...s, aboveThreshold: true })),
          ...sortedRelated.map((s)  => ({ ...s, aboveThreshold: false })),
        ];

    res.json({
      question,
      answer,
      answerType,
      sources: allDisplaySources,
      relevantCount: ranked.length,
      relatedCount: relatedSources.length,
      sourceCount: sources.length,
      model: result.model,
      aiFailed,
    });
  } catch (err) {
    adminLog.error('[askAI] failed', { error: (err as Error).message });
    res.status(500).json({ message: (err as Error).message });
  }
};
