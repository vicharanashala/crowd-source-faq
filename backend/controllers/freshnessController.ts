import { Request, Response } from 'express';
import { Types } from 'mongoose';
import FAQ from '../models/FAQ.js';
import FreshReviewVote from '../models/FreshReviewVote.js';
import FreshReviewLog, { type FreshReviewEventType } from '../models/FreshReviewLog.js';

// Configurable thresholds from env (with defaults)
const VERIFY_THRESHOLD = parseInt(process.env['FAQ_VERIFY_THRESHOLD'] || '3');
const ESCALATION_DAYS  = parseInt(process.env['FAQ_ESCALATION_DAYS']  || '3');
const SEASONAL_DEFAULT = parseInt(process.env['FAQ_SEASONAL_DAYS']   || '15');
const VOLATILE_DEFAULT = parseInt(process.env['FAQ_VOLATILE_DAYS']   || '4');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

async function logEvent(
  event: FreshReviewEventType,
  faqId: Types.ObjectId,
  metadata: Record<string, unknown>
) {
  try {
    await FreshReviewLog.create({ event, faqId, metadata });
  } catch (e) {
    console.warn('FreshReviewLog failed:', (e as Error).message);
  }
}

// ─── PATCH /api/faq/:id/flag — Manual flag as outdated ───────────────────────
export const flagFAQ = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { reason } = req.body as { reason?: string };
    const faq = await FAQ.findById(req.params.id);
    if (!faq) {
      res.status(404).json({ message: 'FAQ not found.' });
      return;
    }

    if (faq.reviewStatus === 'pending_review') {
      res.status(409).json({ message: 'This FAQ is already under review.' });
      return;
    }

    const newCycle = faq.reviewCycle + 1;
    await FAQ.findByIdAndUpdate(faq._id, {
      reviewStatus: 'pending_review',
      flaggedAt: new Date(),
      flagType: 'manual',
      flagReason: reason?.trim().slice(0, 200) || null,
      flaggedBy: req.user!._id,
      reviewCycle: newCycle,
    });

    await logEvent('manual_flag', faq._id, {
      flaggedBy: req.user!._id.toString(),
      reason: reason?.trim(),
      reviewCycle: newCycle,
    });

    res.json({ message: 'FAQ flagged for review.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// ─── POST /api/faq/:id/vote-review — Peer vote on flagged FAQ ────────────────
export const voteReview = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { verdict, suggestion } = req.body as {
      verdict?: 'still_accurate' | 'needs_update';
      suggestion?: string;
    };
    if (!verdict) {
      res.status(400).json({ message: 'Verdict is required.' });
      return;
    }

    const faq = await FAQ.findById(req.params.id);
    if (!faq) {
      res.status(404).json({ message: 'FAQ not found.' });
      return;
    }
    if (faq.reviewStatus !== 'pending_review') {
      res.status(409).json({ message: 'This FAQ is not open for review.' });
      return;
    }

    const cycle = faq.reviewCycle;

    // Upsert vote — toggle off if same verdict, switch if different
    const existing = await FreshReviewVote.findOne({
      faqId: faq._id,
      reviewCycle: cycle,
      voterId: req.user!._id,
    });

    if (existing) {
      if (existing.verdict === verdict) {
        // Toggle off
        await existing.deleteOne();
        await logEvent('freshness_vote', faq._id, {
          voterId: req.user!._id.toString(),
          verdict,
          action: 'removed',
          reviewCycle: cycle,
        });
        res.json({ message: 'Vote removed.', currentVote: null });
        return;
      } else {
        // Switch verdict
        existing.verdict = verdict;
        if (verdict === 'needs_update') {
          existing.suggestion = suggestion?.trim().slice(0, 300) || undefined;
        } else {
          existing.suggestion = undefined;
        }
        await existing.save();
        await logEvent('freshness_vote', faq._id, {
          voterId: req.user!._id.toString(),
          verdict,
          action: 'switched',
          reviewCycle: cycle,
        });
      }
    } else {
      // New vote
      await FreshReviewVote.create({
        faqId: faq._id,
        reviewCycle: cycle,
        voterId: req.user!._id,
        verdict,
        suggestion: verdict === 'needs_update' ? (suggestion?.trim().slice(0, 300) || null) : null,
      });
      await logEvent('freshness_vote', faq._id, {
        voterId: req.user!._id.toString(),
        verdict,
        action: 'cast',
        reviewCycle: cycle,
      });
    }

    // Count votes for this cycle
    const accurate = await FreshReviewVote.countDocuments({
      faqId: faq._id, reviewCycle: cycle, verdict: 'still_accurate',
    });
    const needsUpdate = await FreshReviewVote.countDocuments({
      faqId: faq._id, reviewCycle: cycle, verdict: 'needs_update',
    });

    // ── Escalation: any "needs_update" vote ──────────────────────────────────
    if (needsUpdate > 0) {
      await FAQ.findByIdAndUpdate(faq._id, { reviewStatus: 'update_requested' });
      await logEvent('escalated', faq._id, {
        reason: 'needs_update',
        accurateVotes: accurate,
        needsUpdateVotes: needsUpdate,
        escalatedBy: req.user!._id.toString(),
      });
      res.json({
        message: 'FAQ escalated to moderator.',
        reviewStatus: 'update_requested',
        accurateVotes: accurate,
        needsUpdateVotes: needsUpdate,
      });
      return;
    }

    // ── Auto-verify: threshold met with zero needs_update ────────────────────
    if (accurate >= VERIFY_THRESHOLD && needsUpdate === 0) {
      await FAQ.findByIdAndUpdate(faq._id, {
        reviewStatus: 'verified',
        lastVerifiedDate: new Date(),
        flaggedAt: null,
        flagType: null,
        flagReason: null,
        flaggedBy: null,
      });
      // Clean up votes for this cycle
      await FreshReviewVote.deleteMany({ faqId: faq._id, reviewCycle: cycle });
      await logEvent('auto_verified', faq._id, {
        voteCount: accurate,
        reviewCycle: cycle,
      });
      res.json({
        message: `FAQ verified by community — ${accurate} votes.`,
        reviewStatus: 'verified',
        accurateVotes: accurate,
      });
      return;
    }

    res.json({
      message: 'Vote recorded.',
      reviewStatus: 'pending_review',
      accurateVotes: accurate,
      needsUpdateVotes: needsUpdate,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// ─── GET /api/community/review-queue — FAQs pending peer review ──────────────
export const getReviewQueue = async (_req: Request, res: Response): Promise<void> => {
  try {
    const faqs = await FAQ.find({ reviewStatus: 'pending_review' })
      .select('question category freshnessTier flaggedAt flagType flagReason reviewCycle lastVerifiedDate')
      .sort({ flaggedAt: 1 })
      .lean();

    // Gather vote counts per faq/cycle
    const faqIds = faqs.map((f) => f._id);
    const votes = await FreshReviewVote.aggregate([
      { $match: { faqId: { $in: faqIds } } },
      { $group: { _id: { faqId: '$faqId', verdict: '$verdict' }, count: { $sum: 1 } } },
    ]);

    const voteMap = new Map<string, { accurate: number; needsUpdate: number }>();
    for (const v of votes) {
      const id = (v._id.faqId as Types.ObjectId).toString();
      if (!voteMap.has(id)) voteMap.set(id, { accurate: 0, needsUpdate: 0 });
      const entry = voteMap.get(id)!;
      if (v._id.verdict === 'still_accurate') entry.accurate = v.count;
      else entry.needsUpdate = v.count;
    }

    const queue = faqs.map((f) => {
      const id = (f._id as Types.ObjectId).toString();
      const v = voteMap.get(id) ?? { accurate: 0, needsUpdate: 0 };
      const daysAgo = f.flaggedAt ? daysSince(f.flaggedAt as Date) : 0;
      return {
        _id: f._id,
        question: f.question,
        category: f.category,
        freshnessTier: f.freshnessTier,
        flaggedAt: f.flaggedAt,
        flagType: f.flagType,
        flagReason: f.flagReason,
        reviewCycle: f.reviewCycle,
        lastVerifiedDate: f.lastVerifiedDate,
        daysAgo,
        accurateVotes: v.accurate,
        needsUpdateVotes: v.needsUpdate,
      };
    });

    res.json({ queue });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// ─── GET /api/admin/escalated — FAQs with update_requested status ────────────
export const getEscalated = async (_req: Request, res: Response): Promise<void> => {
  try {
    const faqs = await FAQ.find({ reviewStatus: 'update_requested' })
      .select('question answer category freshnessTier flaggedAt flagType flagReason flaggedBy reviewCycle lastVerifiedDate')
      .sort({ flaggedAt: 1 })
      .lean();

    // Gather votes + suggestions for each FAQ, scoped to the FAQ's current reviewCycle
    const faqIds = faqs.map((f) => f._id);
    const votes = await FreshReviewVote.aggregate([
      {
        $match: {
          faqId: { $in: faqIds },
          // Only count votes from the current review cycle (ignore stale votes from previous cycles)
          reviewCycle: { $in: faqs.map((f) => f.reviewCycle) },
        },
      },
      {
        $group: {
          _id: { faqId: '$faqId', reviewCycle: '$reviewCycle', verdict: '$verdict' },
          count: { $sum: 1 },
        },
      },
    ]);

    const suggestions = await FreshReviewVote.find({
      faqId: { $in: faqIds },
      suggestion: { $ne: null },
      // Include suggestions from all cycles for admin visibility (current + historical)
    })
      .select('faqId reviewCycle verdict suggestion')
      .lean();

    const voteMap = new Map<string, { accurate: number; needsUpdate: number }>();
    for (const v of votes) {
      const id = (v._id.faqId as Types.ObjectId).toString();
      if (!voteMap.has(id)) voteMap.set(id, { accurate: 0, needsUpdate: 0 });
      const entry = voteMap.get(id)!;
      if (v._id.verdict === 'still_accurate') entry.accurate = v.count;
      else entry.needsUpdate = v.count;
    }

    const suggMap = new Map<string, string[]>();
    for (const s of suggestions) {
      const id = (s.faqId as Types.ObjectId).toString();
      if (!suggMap.has(id)) suggMap.set(id, []);
      if (s.suggestion) suggMap.get(id)!.push(s.suggestion);
    }

    const escalated = faqs.map((f) => {
      const id = (f._id as Types.ObjectId).toString();
      const v = voteMap.get(id) ?? { accurate: 0, needsUpdate: 0 };
      return {
        _id: f._id,
        question: f.question,
        answer: f.answer,
        category: f.category,
        freshnessTier: f.freshnessTier,
        flaggedAt: f.flaggedAt,
        flagType: f.flagType,
        flagReason: f.flagReason,
        flaggedBy: f.flaggedBy,
        reviewCycle: f.reviewCycle,
        lastVerifiedDate: f.lastVerifiedDate,
        accurateVotes: v.accurate,
        needsUpdateVotes: v.needsUpdate,
        suggestions: suggMap.get(id) ?? [],
      };
    });

    res.json({ escalated });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// ─── POST /api/admin/escalated/:id/verify — Mod: edit-and-verify ─────────────
export const verifyEscalatedFAQ = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const faq = await FAQ.findById(req.params.id);
    if (!faq) {
      res.status(404).json({ message: 'FAQ not found.' });
      return;
    }
    if (faq.reviewStatus !== 'update_requested') {
      res.status(409).json({ message: 'FAQ is not in escalated status.' });
      return;
    }

    // Admin editing while escalated = re-verification
    const { question, answer, category } = req.body as {
      question?: string;
      answer?: string;
      category?: string;
    };
    if (question) faq.question = question;
    if (answer) faq.answer = answer;
    if (category) faq.category = category;

    // Regenerate embedding if content changed
    if (question || answer || category) {
      try {
        const { generateEmbedding } = await import('../utils/embeddings.js');
        faq.embedding = await generateEmbedding(
          `Section: ${faq.category}. Question: ${faq.question}. Answer: ${faq.answer}`
        );
      } catch {
        // Non-fatal — keep old embedding
      }
    }

    const newCycle = faq.reviewCycle + 1;
    faq.reviewStatus = 'verified';
    faq.lastVerifiedDate = new Date();
    faq.flaggedAt = null;
    faq.flagType = null;
    faq.flagReason = null;
    faq.flaggedBy = null;
    faq.reviewCycle = newCycle;
    await faq.save();

    // Clean up votes for the old cycle
    await FreshReviewVote.deleteMany({ faqId: faq._id });
    await logEvent('mod_verified', faq._id, {
      moderatorId: req.user!._id.toString(),
      reviewCycle: newCycle,
    });

    res.json({ message: 'FAQ re-verified and updated.', faq });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// ─── POST /api/admin/escalated/:id/dismiss — Mod: dismiss flag ───────────────
export const dismissEscalatedFAQ = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const faq = await FAQ.findById(req.params.id);
    if (!faq) {
      res.status(404).json({ message: 'FAQ not found.' });
      return;
    }
    if (faq.reviewStatus !== 'update_requested') {
      res.status(409).json({ message: 'FAQ is not in escalated status.' });
      return;
    }

    const newCycle = faq.reviewCycle + 1;
    faq.reviewStatus = 'verified';
    faq.lastVerifiedDate = new Date();
    faq.flaggedAt = null;
    faq.flagType = null;
    faq.flagReason = null;
    faq.flaggedBy = null;
    faq.reviewCycle = newCycle;
    await faq.save();

    await FreshReviewVote.deleteMany({ faqId: faq._id });
    await logEvent('mod_dismissed', faq._id, {
      moderatorId: req.user!._id.toString(),
      reviewCycle: newCycle,
    });

    res.json({ message: 'Flag dismissed.', faq });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// ─── Cron: daily freshness check ──────────────────────────────────────────────
export const runFreshnessCheck = async (): Promise<void> => {
  try {
    const seasonalDays = SEASONAL_DEFAULT;
    const volatileDays  = VOLATILE_DEFAULT;

    // Find all non-evergreen, verified FAQs whose interval has expired
    const staleFAQs = await FAQ.find({
      freshnessTier: { $ne: 'evergreen' },
      reviewStatus: 'verified',
      reviewIntervalDays: { $gt: 0 },
    }).lean();

    const due = staleFAQs.filter((f) => {
      const daysSinceVerified = daysSince(f.lastVerifiedDate as Date);
      return daysSinceVerified >= (f.reviewIntervalDays ?? seasonalDays);
    });

    if (due.length === 0) {
      console.log('[freshness] No FAQs due for review.');
      return;
    }

    for (const f of due) {
      const newCycle = f.reviewCycle + 1;
      await FAQ.findByIdAndUpdate(f._id, {
        reviewStatus: 'pending_review',
        flaggedAt: new Date(),
        flagType: 'auto',
        reviewCycle: newCycle,
      });
      await logEvent('auto_flag', f._id as Types.ObjectId, {
        freshnessTier: f.freshnessTier,
        reviewIntervalDays: f.reviewIntervalDays,
        reviewCycle: newCycle,
      });
      console.log(`[freshness] Auto-flagged FAQ ${f._id} (tier: ${f.freshnessTier})`);
    }

    // ── Auto-escalation: pending_review with no votes after ESCALATION_DAYS ───
    const inactiveFAQs = await FAQ.find({
      reviewStatus: 'pending_review',
      flaggedAt: {
        $lt: new Date(Date.now() - ESCALATION_DAYS * 24 * 60 * 60 * 1000),
      },
    }).lean();

    for (const f of inactiveFAQs) {
      // Check zero votes for this cycle
      const voteCount = await FreshReviewVote.countDocuments({
        faqId: f._id,
        reviewCycle: f.reviewCycle,
      });
      if (voteCount === 0) {
        await FAQ.findByIdAndUpdate(f._id, { reviewStatus: 'update_requested' });
        await logEvent('escalated', f._id as Types.ObjectId, {
          reason: 'inactivity',
          reviewCycle: f.reviewCycle,
        });
        console.log(`[freshness] Auto-escalated (inactive) FAQ ${f._id}`);
      }
    }

    console.log(`[freshness] Processed ${due.length} stale FAQs, ${inactiveFAQs.length} auto-escalated.`);
  } catch (err) {
    console.error('[freshness] Cron error:', (err as Error).message);
  }
};