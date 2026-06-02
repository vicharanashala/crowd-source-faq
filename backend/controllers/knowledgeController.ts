import { type Request, type Response } from 'express';
import {
  processZoomMeetingForKnowledge,
  processHighUpvotePosts as extractHighUpvoteKnowledge,
  promoteToFAQ as promoteKnowledgeToFAQ,
  embedUnprocessedKnowledge,
} from '../services/knowledgeBase.js';
import { TranscriptKnowledge } from '../models/TranscriptKnowledge.js';

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