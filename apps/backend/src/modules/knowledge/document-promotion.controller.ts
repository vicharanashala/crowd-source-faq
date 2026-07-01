/**
 * documentPromotionController — the auto-promote cron.
 *
 * Runs periodically (see `server.ts` registration) and once
 * immediately after each UnresolvedSearch log is written. Scans
 * `DocumentInsight` rows in `pending_review` whose
 * `searchMatchCount >= DOCUMENT_INSIGHT_AUTO_PROMOTE_THRESHOLD`,
 * promotes them to `approved` + creates a real `FAQ`, and stamps
 * the match count so the admin queue can see *why* it was
 * promoted.
 *
 * Promotion trigger is configured by env (default 3 matches). Set
 * `DOCUMENT_INSIGHT_AUTO_PROMOTE=0` to disable the cron.
 *
 * Manual trigger: `POST /api/admin/documents/insights/promote-popular`
 * (see `documentController.promotePopularNow`).
 */

import DocumentInsight, { type IDocumentInsight } from './document-insight.model.js';
import { queueLog } from '../../utils/http/logger.js';
import { promoteInsightToFaq } from '../../utils/documentPromotion.js';

const THRESHOLD = (() => {
  const v = Number(process.env.DOCUMENT_INSIGHT_AUTO_PROMOTE_THRESHOLD);
  return Number.isFinite(v) && v > 0 ? v : 3;
})();

export interface PromotionRunResult {
  scanned: number;
  promoted: number;
  skipped: number;
  errors: number;
  threshold: number;
}

/**
 * Run the cron once. Idempotent — safe to call from a scheduler
 * AND from the manual admin endpoint.
 */
export async function runPromotePopularDocumentInsights(): Promise<PromotionRunResult> {
  const result: PromotionRunResult = {
    scanned: 0,
    promoted: 0,
    skipped: 0,
    errors: 0,
    threshold: THRESHOLD,
  };

  // Find all pending insights with at least one match
  const candidates = await DocumentInsight.find({
    status: 'pending_review',
    searchMatchCount: { $gte: THRESHOLD },
  })
    .sort({ searchMatchCount: -1, createdAt: 1 })
    .limit(50)
    .exec();

  result.scanned = candidates.length;
  queueLog.info(`[documentPromotion] scanning ${result.scanned} candidate insights (threshold=${THRESHOLD})`);

  for (const insight of candidates) {
    try {
      // Re-read inside the loop to avoid touching stale snapshots
      const fresh = await DocumentInsight.findById(insight._id);
      if (!fresh || fresh.status !== 'pending_review') {
        result.skipped++;
        continue;
      }
      const systemUserId = undefined; // system-initiated, no admin
      const out = await promoteInsightToFaq(fresh, systemUserId, 'auto-popular');
      if (out.faq) {
        result.promoted++;
        queueLog.info(
          `[documentPromotion] promoted insight ${insight._id} → FAQ ${out.faq._id} (matchCount=${fresh.searchMatchCount})`,
        );
      } else {
        result.skipped++;
      }
    } catch (err) {
      result.errors++;
      queueLog.warn(`[documentPromotion] failed to promote ${insight._id}: ${(err as Error).message}`);
    }
  }

  queueLog.info(
    `[documentPromotion] run complete: scanned=${result.scanned} promoted=${result.promoted} skipped=${result.skipped} errors=${result.errors}`,
  );
  return result;
}

/** Re-export so the manual-trigger endpoint can use the same function. */
export { THRESHOLD as DOCUMENT_INSIGHT_AUTO_PROMOTE_THRESHOLD };
