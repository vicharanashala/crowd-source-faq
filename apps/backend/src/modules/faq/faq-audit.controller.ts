/**
 * faqAuditController.ts — AI-powered FAQ correctness audit engine.
 *
 * How it works:
 *  For each approved FAQ, the auditor:
 *  1. Extracts the core question topic
 *  2. Searches the knowledge base (TranscriptKnowledge + recent ZoomInsights) for
 *     current information on that topic
 *  3. Uses GPT-4o mini to compare the FAQ answer against the found knowledge
 *  4. Assigns a correctness score (0–1) and flags if score < threshold
 *
 *  Flags:    reviewStatus → 'pending_review', reviewCycle++, flagType: 'auto'
 *  Findings: stored in PipelineResult (unified result log, 30-day TTL)
 *
 *  Admins see flagged FAQs in the existing review queue at /admin/faqs/review
 *  with an "AI Audit" badge and the audit reason visible.
 *
 *  Scheduler runs every 6 hours (configurable).
 *  Admins can trigger manually via POST /admin/audit/faqs (with ?dry_run=true).
 */
import { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import FAQ from './faq.model.js';
import { cronLog } from '../../utils/http/logger.js';
import { searchKnowledge } from '../knowledge/knowledge-base.service.js';
import { chatWithConfig } from '../../utils/ai/aiProvider.js';
import { getPipelineProviderConfig } from '../../utils/ai/aiProvider.js';
import { stripAllWrappers, extractJsonSubstring } from '../../utils/ai/aiResponseParsers.js';
import { PipelineResult } from '../ai/pipeline-result.model.js';
import {
  searchKnowledgeWithFallback,
  triageByScore,
  buildAuditMetaUpdate,
  logPipelineEvent,
  isSensitiveContent,
} from '../../utils/ai/pipelineCommon.js';

// ─── Config ──────────────────────────────────────────────────────────────────
// v1.68 — M5: read interval fresh on every tick.
const AUDIT_BATCH_SIZE = parseInt(process.env['FAQ_AUDIT_BATCH_SIZE'] || '20', 10);
function readAuditIntervalH(): number {
  return parseInt(process.env['FAQ_AUDIT_readAuditIntervalH()OURS'] || '6', 10);
}
const _FLAG_THRESHOLD   = parseFloat(process.env['FAQ_AUDIT_FLAG_THRESHOLD'] || '0.65');
const MIN_CONFIDENCE   = 0.35; // Below this confidence in AI's judgment → skip flagging
const MAX_SOURCE_CHARS = 3000; // Max knowledge context sent to AI for comparison

// ─── Audit result model (in-memory schema — see bottom of file) ──────────────

interface AuditFinding {
  faqId: Types.ObjectId;
  score: number;          // 0–1 correctness score
  verdict: 'correct' | 'drift_detected' | 'contradiction' | 'stale';
  reason: string;
  sources: { id: string; title: string; type: string }[];
  checkedAt: Date;
}

// ─── Core audit logic ─────────────────────────────────────────────────────────

/**
 * Audit a single FAQ for correctness against the knowledge base.
 * Returns an AuditFinding or null if the FAQ should not be audited now.
 */
async function auditFAQ(faq: {
  _id: Types.ObjectId;
  question: string;
  answer: string;
  reviewStatus?: string;
  lastVerifiedDate?: Date;
}): Promise<AuditFinding | null> {
  const { _id, question, answer, reviewStatus } = faq;

  // Skip if already under active review (don't re-flag repeatedly)
  if (reviewStatus === 'pending_review' || reviewStatus === 'update_requested') {
    return null;
  }

  // ── 1. Search knowledge base for current information on this topic ──────
  let knowledgeContext = '';
  const sourceSummaries: { id: string; title: string; type: string }[] = [];

  try {
    const rawMatches = await searchKnowledgeWithFallback(question, 5);
    const matches = (rawMatches ?? []) as Exclude<Awaited<ReturnType<typeof searchKnowledge>>, null>;

    if (matches.length > 0) {
      for (const match of matches) {
        sourceSummaries.push({ id: match._id, title: match.sourceTitle ?? match.question, type: 'knowledge_base' });
      }
      knowledgeContext = matches
        .map((m) => `Source: ${m.question}\n${m.answer}`)
        .join('\n\n')
        .slice(0, MAX_SOURCE_CHARS);
    }
  } catch (err) {
    cronLog.warn(`[faqAudit] Knowledge search failed for FAQ ${_id}: ${(err as Error).message}`);
  }

  // ── 2. Also check ZoomInsights (unprocessed/approved) ───────────────────
  try {
    const insights = await mongoose.model('ZoomInsight').find({
      status: { $in: ['pending_review', 'approved'] },
    })
      .select('title insight audioUrl')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    // Filter to insights that share tags or keywords with the FAQ question
    const faqKeywords = question.toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
    const relevantInsights = insights.filter((ins: Record<string, unknown>) => {
      const title = String(ins.title ?? '').toLowerCase();
      return faqKeywords.some((kw) => title.includes(kw));
    });

    for (const ins of relevantInsights) {
      sourceSummaries.push({ id: String(ins._id), title: String(ins.title), type: 'zoom_insight' });
      const insightText = String(ins.insight ?? '').slice(0, 500);
      if (insightText) {
        knowledgeContext += `\n\n[Zoom Insight] ${ins.title}\n${insightText}`;
      }
    }
  } catch (err) {
    // ZoomInsight model may not exist in all deployments — log warning and skip
    cronLog.warn(`[faqAudit] ZoomInsight retrieval skipped or model not registered: ${(err as Error).message}`);
  }

  // ── 3. Have GPT-4o mini compare FAQ answer against knowledge ────────────
  if (!knowledgeContext) {
    // No external knowledge to compare against — check if FAQ was verified recently
    const daysSinceVerify = faq.lastVerifiedDate
      ? Math.floor((Date.now() - faq.lastVerifiedDate.getTime()) / 86400000)
      : 999;
    if (daysSinceVerify > 60) {
      // Old FAQ with no knowledge context and never verified → flag as potentially stale
      return {
        faqId: _id,
        score: 0.5,
        verdict: 'stale',
        reason: `No current knowledge found and FAQ not verified in ${daysSinceVerify} days.`,
        sources: [],
        checkedAt: new Date(),
      };
    }
    return null; // Nothing to compare against and recent enough — skip
  }

  const systemPrompt = `You are Yaksha's FAQ accuracy auditor. Your job is to compare an existing FAQ answer against the current knowledge base and rate how accurate and up-to-date the answer is.

Rate each of these dimensions 0–1:
- ACCURACY: Is the answer factually correct based on the provided knowledge?
- COMPLETENESS: Does the answer cover what the knowledge base says is important?
- CURRENCY: Is the answer consistent with current information, or does it contradict newer knowledge?

Then decide:
- "correct" — score ≥ 0.80: FAQ answer is accurate and consistent
- "drift_detected" — score 0.60–0.79: FAQ has minor gaps or outdated framing
- "contradiction" — score < 0.60: FAQ contradicts current knowledge (factual error or missing critical info)
- "stale" — no specific contradiction but knowledge is substantially more detailed

Respond with ONLY a valid JSON object (no markdown, no explanation outside the JSON):
{
  "accuracy": 0.0-1.0,
  "completeness": 0.0-1.0,
  "currency": 0.0-1.0,
  "overall": 0.0-1.0,
  "verdict": "correct|drift_detected|contradiction|stale",
  "reason": "1-2 sentence explanation of why",
  "confidence": 0.0-1.0
}`;

  const userPrompt = `FAQ Question: ${question}

FAQ Answer:
${answer}

Current Knowledge Base:
${knowledgeContext}

Respond with ONLY a valid JSON object:`;

  let raw: string | undefined;
  try {
    const cfg = await getPipelineProviderConfig('faq_audit');
    raw = await chatWithConfig(cfg, [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ]);
  } catch (err) {
    cronLog.warn(`[faqAudit] AI comparison failed for FAQ ${_id}: ${(err as Error).message}`);
    return null;
  }

  if (!raw) return null;

  let parsed: {
    overall?: number;
    verdict?: string;
    reason?: string;
    confidence?: number;
  };
  try {
    // MiniMax-M3 (and most chain-of-thought models) wraps the
    // answer in `<think>…</think>` blocks before the actual JSON.
    // stripAllWrappers also handles ```json fences and leading
    // prose. extractJsonSubstring is the catch-all that finds the
    // outermost {…} when nothing else matches.
    const cleaned = stripAllWrappers(raw);
    parsed = JSON.parse(cleaned);
  } catch {
    const recovered = extractJsonSubstring(stripAllWrappers(raw));
    if (recovered !== null) {
      try {
        parsed = JSON.parse(recovered);
        cronLog.info(`[faqAudit] recovered JSON from substring extraction (${recovered.length} chars) for FAQ ${_id}`);
      } catch (err2) {
        cronLog.warn(`[faqAudit] Failed to parse AI response for FAQ ${_id}: ${raw.slice(0, 100)}`);
        return null;
      }
    } else {
      cronLog.warn(`[faqAudit] Failed to parse AI response for FAQ ${_id}: ${raw.slice(0, 100)}`);
      return null;
    }
  }

  const { overall = 0.5, verdict = 'correct', reason = 'No reason provided', confidence = 0.5 } = parsed;

  // Skip low-confidence judgments
  if (confidence < MIN_CONFIDENCE) {
    cronLog.info(`[faqAudit] Skipping FAQ ${_id} — low confidence ${confidence}`);
    return null;
  }

  return {
    faqId: _id,
    score: overall,
    verdict: verdict as AuditFinding['verdict'],
    reason: reason.slice(0, 300),
    sources: sourceSummaries,
    checkedAt: new Date(),
  };
}

/**
 * Apply an audit finding: update the FAQ and store the result.
 * Flags the FAQ if verdict is not "correct".
 */
async function applyFinding(faq: { _id: Types.ObjectId }, finding: AuditFinding): Promise<void> {
  const update: Record<string, unknown> = {
    lastCheckedAt: finding.checkedAt,
  };

  if (finding.verdict !== 'correct') {
    const newCycle = ((faq as unknown as { reviewCycle?: number }).reviewCycle ?? 0) + 1;
    Object.assign(update, {
      reviewStatus: 'pending_review',
      flaggedAt: finding.checkedAt,
      flagType: 'auto',
      flagReason: `[AI Audit] ${finding.verdict}: ${finding.reason}`,
      flaggedBy: new mongoose.Types.ObjectId('000000000000000000000000'), // System user
      reviewCycle: newCycle,
    });
  }

  await FAQ.findByIdAndUpdate(faq._id, update);

  // Store in unified pipeline result log
  await PipelineResult.create({
    pipeline:    'faq_audit',
    targetModel: 'FAQ',
    targetId:    finding.faqId,
    batchId:     (faq as unknown as { batchId?: mongoose.Types.ObjectId }).batchId,
    targetTitle: (faq as unknown as { question?: string }).question ?? 'Unknown FAQ',
    score:       finding.score,
    verdict:     finding.verdict,
    confidence:  1,
    reason:      finding.reason,
    sources:     finding.sources,
    flagged:     finding.verdict !== 'correct',
    checkedAt:   finding.checkedAt,
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * POST /admin/audit/faqs
 * Manually trigger FAQ audit (admin only).
 * Query: ?dry_run=true → returns findings without flagging
 * Query: ?faq_id=<id>  → audit only that specific FAQ
 * Query: ?all=true     → audit all (up to AUDIT_BATCH_SIZE, default 20)
 */
export const runFAQAudit = async (req: Request, res: Response): Promise<void> => {
  const isDryRun = req.query.dry_run === 'true';
  const specificFaqId = req.query.faq_id as string | undefined;
  const auditAll = req.query.all === 'true';

  try {
    const query: Record<string, unknown> = { status: 'approved' };

    let faqs;
    if (specificFaqId) {
      const found = await FAQ.findById(specificFaqId);
      faqs = found ? [found] : [];
    } else {
      faqs = await FAQ.find(query)
        .select('question answer reviewStatus reviewCycle flaggedAt lastVerifiedDate lastCheckedAt')
        .sort({ lastCheckedAt: 1 }) // Oldest-checked first
        .limit(auditAll ? 200 : AUDIT_BATCH_SIZE);
    }

    if (faqs.length === 0) {
      res.json({ message: 'No FAQs to audit', audited: 0 });
      return;
    }

    const results: {
      faqId: string;
      question: string;
      score?: number;
      verdict?: string;
      reason?: string;
      flagged: boolean;
    }[] = [];

    for (const faq of faqs) {
      const finding = await auditFAQ({
        _id:                faq._id as Types.ObjectId,
        question:           faq.question,
        answer:             faq.answer,
        reviewStatus:       faq.reviewStatus,
        lastVerifiedDate:   faq.lastVerifiedDate as Date | undefined,
      });

      if (!finding) continue; // Skip (already under review or no context)

      results.push({
        faqId:    faq._id.toString(),
        question: faq.question.slice(0, 80),
        score:    finding.score,
        verdict:  finding.verdict,
        reason:   finding.reason,
        flagged:  finding.verdict !== 'correct',
      });

      if (!isDryRun && finding.verdict !== 'correct') {
        await applyFinding(faq, finding);
      }
    }

    const flagged = results.filter((r) => r.flagged).length;
    cronLog.info(`[faqAudit] Audit run: ${results.length} FAQs, ${flagged} flagged`);
    res.json({
      message: isDryRun ? 'Dry run complete' : 'Audit complete',
      audited: results.length,
      flagged,
      dry_run: isDryRun,
      results,
    });
  } catch (err) {
    cronLog.error(`[faqAudit] Audit failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * GET /admin/audit/faqs/results
 * Return audit history for display in the admin UI.
 * Query: ?limit=20, ?faq_id=<id>
 */
export const getAuditResults = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '50')), 200);
    const faqId = req.query.faq_id as string | undefined;

    const filter: Record<string, unknown> = {};
    if (faqId) filter.targetId = new Types.ObjectId(faqId);

    const results = await PipelineResult.find({ ...filter, pipeline: 'faq_audit' })
      .sort({ checkedAt: -1 })
      .limit(limit)
      .lean();

    // Enrich with FAQ question
    const faqIds = results.map((r) => r.targetId);
    const faqs = await FAQ.find({ _id: { $in: faqIds } }).select('_id question').lean();
    const faqMap = new Map(faqs.map((f) => [f._id.toString(), f.question]));

    const enriched = results.map((r) => ({
      _id:       r._id,
      faqId:     r.targetId,
      question:  faqMap.get(r.targetId.toString()) ?? r.targetTitle,
      score:     r.score,
      verdict:   r.verdict,
      reason:    r.reason,
      sources:   r.sources,
      checkedAt: r.checkedAt,
    }));

    res.json({ results: enriched, total: enriched.length });
  } catch (err) {
    cronLog.error(`[faqAudit] Results fetch failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * GET /admin/audit/stats
 * Return aggregate audit statistics for the admin dashboard.
 */
export const getAuditStats = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [totalFaqs, flaggedFaqs, lastRun, recentFlags] = await Promise.all([
      FAQ.countDocuments({ status: 'approved' }),
      FAQ.countDocuments({ status: 'approved', reviewStatus: { $in: ['pending_review', 'update_requested'] }, flagType: 'auto' }),
      PipelineResult.findOne({ pipeline: 'faq_audit' }).sort({ checkedAt: -1 }).select('checkedAt').lean(),
      FAQ.countDocuments({ flaggedAt: { $gte: new Date(Date.now() - 7 * 86400000) }, flagType: 'auto' }),
    ]);

    // Average score from last 50 audit results
    const recentResults = await PipelineResult.find({ pipeline: 'faq_audit' })
      .sort({ checkedAt: -1 })
      .limit(50)
      .select('score verdict')
      .lean();

    const avgScore = recentResults.length
      ? recentResults.reduce((s, r) => s + r.score, 0) / recentResults.length
      : null;

    const verdictBreakdown = {
      correct:         recentResults.filter((r) => r.verdict === 'correct').length,
      drift_detected:  recentResults.filter((r) => r.verdict === 'drift_detected').length,
      contradiction:   recentResults.filter((r) => r.verdict === 'contradiction').length,
      stale:           recentResults.filter((r) => r.verdict === 'stale').length,
    };

    res.json({
      totalFaqs,
      flaggedFaqs,
      flaggedLast7Days: recentFlags,
      avgScore: avgScore != null ? Math.round(avgScore * 100) / 100 : null,
      lastAuditAt: lastRun?.checkedAt ?? null,
      verdictBreakdown,
      totalAudited: recentResults.length,
    });
  } catch (err) {
    cronLog.error(`[faqAudit] Stats failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── Scheduler ───────────────────────────────────────────────────────────────
let auditIntervalHandle: ReturnType<typeof setInterval> | null = null;

export async function runScheduledFAQAudit(): Promise<void> {
  const intervalH = readAuditIntervalH();
  const ms = intervalH * 60 * 60 * 1000;

  if (auditIntervalHandle) clearInterval(auditIntervalHandle);

  auditIntervalHandle = setInterval(() => {
    runAuditInternal().catch((err) => {
      cronLog.error(`[faqAudit] Scheduler error: ${(err as Error).message}`);
    });
  }, ms);

  cronLog.info(`[faqAudit] Scheduler started — running every ${readAuditIntervalH()}h`);

  // Run once on startup after 60s warmup
  setTimeout(() => {
    runAuditInternal().catch((err) => {
      cronLog.error(`[faqAudit] Startup run error: ${(err as Error).message}`);
    });
  }, 60_000);
}

export function stopFAQAuditScheduler(): void {
  if (auditIntervalHandle) {
    clearInterval(auditIntervalHandle);
    auditIntervalHandle = null;
    cronLog.info('[faqAudit] Scheduler stopped.');
  }
}

async function runAuditInternal(): Promise<void> {
  const faqs = await FAQ.find({ status: 'approved' })
    .select('question answer reviewStatus reviewCycle lastVerifiedDate lastCheckedAt')
    .sort({ lastCheckedAt: 1 })
    .limit(AUDIT_BATCH_SIZE);

  if (faqs.length === 0) {
    cronLog.info('[faqAudit] No FAQs to audit in scheduled run.');
    return;
  }

  cronLog.info(`[faqAudit] Starting scheduled run — ${faqs.length} FAQs to audit.`);
  let audited = 0, flagged = 0, errors = 0;

  for (const faq of faqs) {
    try {
      const finding = await auditFAQ({
        _id:              faq._id as Types.ObjectId,
        question:         faq.question,
        answer:           faq.answer,
        reviewStatus:     faq.reviewStatus,
        lastVerifiedDate: faq.lastVerifiedDate as Date | undefined,
      });
      if (!finding) continue;
      audited++;
      if (finding.verdict !== 'correct') {
        await applyFinding(faq, finding);
        flagged++;
      }
    } catch (err) {
      errors++;
      cronLog.error(`[faqAudit] FAQ ${faq._id} error: ${(err as Error).message}`);
    }
  }

  cronLog.info(`[faqAudit] Scheduled run complete: audited=${audited}, flagged=${flagged}, errors=${errors}`);
}