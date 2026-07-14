/**
 * AI First Responder — takes a student's question, tries to answer it
 * with the peer-tutor persona (AiClient.answerAsPeerTutor), and falls
 * back to a human admin queue whenever the AI can't be trusted:
 *   - the request errors or times out
 *   - the model itself signals `confident: false`
 *
 * The fail-safe is intentionally "silent" from the user's point of view
 * — they always get a 200 with either a real answer or a friendly
 * fallback message, never a raw error. The failure is recorded in
 * EscalationQueue for an admin to pick up.
 */

import { Request, Response } from 'express';
import AiClient from './ai-client.service.js';
import EscalationQueue, { type EscalationReason } from './escalation-queue.model.js';
import { adminLog } from '../../utils/http/logger.js';

const RESPONSE_TIMEOUT_MS = parseInt(process.env['FIRST_RESPONDER_TIMEOUT_MS'] ?? '15000');

const FALLBACK_MESSAGE =
  "I'm not confident enough in an answer to this one, so I've forwarded it to an admin for a proper look. " +
  "They'll follow up soon — thanks for your patience!";

class TimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(`AI response timed out after ${ms}ms`)), ms);
    promise
      .then((val) => { clearTimeout(timer); resolve(val); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

/** Best-effort escalation write — a failure here must never surface to the user. */
async function escalate(
  question: string,
  userId: string | null,
  batchId: string | null,
  reason: EscalationReason,
  debugDetail: string
): Promise<void> {
  try {
    await EscalationQueue.create({
      question,
      userId,
      batchId,
      reason,
      debugDetail: debugDetail.slice(0, 1000),
    });
  } catch (err) {
    // Even the escalation write failing must not break the response —
    // log loudly so it's visible in ops, but the user still gets the
    // friendly fallback message from the caller.
    adminLog.error('[firstResponder] Failed to write EscalationQueue entry', {
      error: (err as Error).message,
      question: question.slice(0, 200),
    });
  }
}

/**
 * POST /api/ai/first-responder
 * Body: { question: string }
 */
export const askFirstResponder = async (req: Request, res: Response): Promise<void> => {
  const question = String((req.body ?? {}).question ?? '').trim();
  const userId = (req.user as any)?._id ? String((req.user as any)._id) : null;
  const batchId = req.programContext?.batchId ?? null;

  if (!question) {
    res.status(400).json({ message: 'question is required.' });
    return;
  }
  if (question.length > 2000) {
    res.status(400).json({ message: 'question must be 2000 characters or fewer.' });
    return;
  }

  try {
    const client = new AiClient();
    const { answer, confident } = await withTimeout(
      client.answerAsPeerTutor(question),
      RESPONSE_TIMEOUT_MS
    );

    if (!confident) {
      await escalate(question, userId, batchId, 'low_confidence', answer || '(empty answer)');
      res.json({ answer: FALLBACK_MESSAGE, escalated: true });
      return;
    }

    res.json({ answer, escalated: false });
  } catch (err) {
    const isTimeout = err instanceof TimeoutError;
    const reason: EscalationReason = isTimeout ? 'ai_timeout' : 'ai_error';

    // Silently caught — the user never sees this exception. Logged for
    // ops visibility, then routed to a human via EscalationQueue.
    adminLog.warn(`[firstResponder] ${reason} for question: ${(err as Error).message}`);
    await escalate(question, userId, batchId, reason, (err as Error).message);

    res.json({ answer: FALLBACK_MESSAGE, escalated: true });
  }
};

/**
 * GET /api/ai/first-responder/queue — admin view of pending escalations.
 * Query: ?status=pending_admin_review (default) &page=1&limit=20
 */
export const getEscalationQueue = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = String(req.query.status ?? 'pending_admin_review');
    const page = Math.max(1, parseInt(String(req.query.page ?? '1')) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20')) || 20));

    const [items, total] = await Promise.all([
      EscalationQueue.find({ status })
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      EscalationQueue.countDocuments({ status }),
    ]);

    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    adminLog.error('[firstResponder] getEscalationQueue failed', { error: (err as Error).message });
    res.status(500).json({ message: 'Failed to load escalation queue.' });
  }
};

/**
 * PATCH /api/ai/first-responder/queue/:id — admin marks an escalation resolved/dismissed.
 * Body: { status: 'resolved' | 'dismissed' }
 */
export const updateEscalationStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status } = req.body as { status?: string };
    if (status !== 'resolved' && status !== 'dismissed') {
      res.status(400).json({ message: "status must be 'resolved' or 'dismissed'." });
      return;
    }

    const updated = await EscalationQueue.findByIdAndUpdate(
      req.params.id,
      { status, resolvedBy: (req.user as any)._id, resolvedAt: new Date() },
      { new: true }
    );
    if (!updated) {
      res.status(404).json({ message: 'Escalation not found.' });
      return;
    }

    res.json({ item: updated });
  } catch (err) {
    adminLog.error('[firstResponder] updateEscalationStatus failed', { error: (err as Error).message });
    res.status(500).json({ message: 'Failed to update escalation.' });
  }
};
