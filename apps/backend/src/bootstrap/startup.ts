import { logger, startupLog } from '../utils/http/logger.js';
import connectDB from '../config/db.js';
import { migrateZoomSettingsToSessions } from '../utils/zoomMigration.js';
import { backfillDashboardMetrics } from '../modules/admin/dashboard-metric.service.js';
import { startBot, stopBot } from '../integrations/discord/discordBot.js';
import { botManager } from '../integrations/discord/botManager.js';
import { startEscalationScheduler, stopEscalationScheduler } from '../modules/community/escalation.controller.js';
// Note: runScheduledAutoAnswer() / stopAutoAnswerScheduler() (auto-answer.controller.ts)
// and runScheduledFAQAudit() / stopFAQAuditScheduler() (faq-audit.controller.ts)
// are no-op shims kept for backwards compat. The real scheduling happens in
// cronManager (see below: 'auto-answer-batch' + 'freshness-check' registrations).
import { startDocumentWorker, stopDocumentWorker } from '../utils/jobs/documentQueue.js';
import { notificationsService } from '../services/notifications.service.js';
import { banService } from '../services/ban.service.js';
import { cronManager } from '../core/scheduler/cronManager.js';
import mongoose from 'mongoose';
import { jobQueue } from '../utils/http/jobQueue.js';

// Cron job handlers
import { runPromotionCycle } from '../modules/program/promotion.service.js';
import { runFreshnessCheck } from '../modules/faq/freshness.controller.js';
// Note: `clusterAllActiveBatches` (utils/ai/categoryClusterer.ts) is the v1.70
// embedding-based clusterer. It called a local ONNX embedder that this
// deployment doesn't have, which surfaced as a burst of
// `[categoryClusterer] embed failed for X: Connection error` warnings on every
// boot. The v1.71 LLM-based replacement (utils/ai/categoryAssigner.ts →
// `recategorizeAllActiveBatches`) is registered below, gated by the
// `categoryRecategorize` feature flag in /admin/features.
import { recomputePopularity } from '../modules/faq/public-faq.controller.js';
import { retryFailedMeetings } from '../modules/zoom/retry.service.js';
import { runPromotePopularDocumentInsights } from '../modules/knowledge/document-promotion.controller.js';
import { flushSearchLogs } from '../modules/search/search.controller.js';

const runRetention = async () => {
  try {
    const { cleanSearchLogs, cleanNotifications, cleanFreshReviewLogs, cleanModerationLogs, cleanAdminLogs } = await import('../scripts/retentionPolicy.js');
    await cleanSearchLogs();
    await cleanNotifications();
    await cleanFreshReviewLogs();
    await cleanModerationLogs();
    await cleanAdminLogs();
  } catch (e: unknown) {
    logger.error(`[retention] Policy execution failed: ${(e as Error).message}`);
  }
};

export async function startup(config: any): Promise<void> {
  // Ensure DB connection and migration
  try {
    await connectDB();
    await migrateZoomSettingsToSessions();
    await backfillDashboardMetrics();
  } catch (e) {
    startupLog.error('startup DB connect / migrate / backfill failed', { error: (e as Error).message });
  }

  // Lazy-init the RegistrationConfig singleton
  try {
    const { ensureRegistrationConfig } = await import('../modules/program/registration-config.model.js');
    await ensureRegistrationConfig();
  } catch (e) {
    startupLog.warn(`[registrationConfig] ensure failed at startup: ${(e as Error).message}`);
  }

  // Synchronize existing bookmarks (idempotent backfill)
  try {
    const { default: User } = await import('../modules/auth/user.model.js');
    const { default: CommunityPost } = await import('../modules/community/community-post.model.js');
    const users = await User.find({ bookmarks: { $exists: true, $not: { $size: 0 } } }).select('_id bookmarks');
    if (users.length > 0) {
      logger.info(`[startup] Syncing bookmarks for ${users.length} users to community posts...`);
      for (const user of users) {
        for (const postId of user.bookmarks) {
          await CommunityPost.updateOne(
            { _id: postId },
            { $addToSet: { bookmarks: user._id } }
          );
        }
      }
      logger.info(`[startup] Completed bookmarks synchronization.`);
    }
  } catch (err) {
    logger.error(`[startup] Bookmarks sync failed: ${(err as Error).message}`);
  }

  // Start schedulers & bots
  // Note: runScheduledAutoAnswer() / runScheduledFAQAudit() are no longer
  // called here — both are registered via cronManager in this same file
  // (names: 'auto-answer-batch' and 'freshness-check'). The shim functions
  // still exist for external callers but emit a deprecation WARN.
  startEscalationScheduler();

  // Phase 1 R3 — drain any pending notification outbox rows on startup
  // so a restart doesn't sit on unsent notifications. Best-effort.
  notificationsService.drain().catch((err) =>
    logger.error(`[notifications] Startup drain failed: ${(err as Error).message}`),
  );

  void startBot().catch((err) => logger.error(`[bot] startup: ${(err as Error).message}`));
  void botManager.startAll().catch((err) => logger.error(`[botManager] startAll: ${(err as Error).message}`));

  // Register cron tasks
  cronManager.register({
    name: 'promotion-cycle',
    handler: runPromotionCycle,
    intervalMs: config.cron.promotionCycleIntervalMs,
    runOnStartup: true,
  });

  cronManager.register({
    name: 'freshness-check',
    handler: runFreshnessCheck,
    intervalMs: config.cron.freshnessCheckIntervalMs,
    runOnStartup: true,
  });

  // Phase 1 R3 — drain the notification outbox every 60s. Retries
  // any notifications that failed to persist on the original call.
  cronManager.register({
    name: 'notification-outbox-drain',
    handler: () => notificationsService.drain(),
    intervalMs: 60_000,
    runOnStartup: false,
  });

  cronManager.register({
    name: 'popularity-recompute',
    handler: recomputePopularity,
    intervalMs: config.cron.popularityRecomputeIntervalMs,
    runOnStartup: true,
    startupDelayMs: 15_000,
  });

  cronManager.register({
    name: 'retention-policy',
    handler: runRetention,
    intervalMs: config.cron.retentionPolicyIntervalMs,
    runOnStartup: true,
  });

  // Phase 1 R4 — clear expired Golden-bans on a schedule. The
  // existing ad-hoc call inside escalationController still fires
  // (every escalation-check tick) — that's fine, the function is
  // idempotent — but registering it with cronManager here means a
  // future refactor of the escalation scheduler can't silently
  // drop the ban-cleanup schedule. Audit context:
  // docs/redesign-plan.md §2.4 R4.
  cronManager.register({
    name: 'ban-cleanup',
    handler: () => banService.clearExpiredGoldenBans(),
    intervalMs: 60 * 60 * 1000, // 1h, matches escalation cadence
    runOnStartup: true,
  });

  cronManager.register({
    name: 'zoom-retry',
    handler: retryFailedMeetings,
    intervalMs: config.cron.zoomRetryIntervalMs,
    runOnStartup: false,
  });

  const { featureFlags, syncFeatureFlagRegistry } = await import('../services/featureFlags.js');
  // Phase 1 R1: fail-closed boot check. Seed any registry flags that
  // are missing from MongoDB and warn about orphans. Crashing here
  // would prevent the server from booting after a partial deploy;
  // logging is the right level — we don't want to brick prod over
  // an off-by-one in the seed step.
  try {
    await syncFeatureFlagRegistry();
  } catch (e) {
    startupLog.error(`[featureFlags] registry sync failed at startup: ${(e as Error).message}`);
  }

  const pipelineEnabled = await featureFlags.isEnabled('documentPipeline');

  let documentWorkerStarted = false;
  if (pipelineEnabled) {
    documentWorkerStarted = startDocumentWorker();
  } else {
    const { setQueueDisabledByAdmin } = await import('../utils/jobs/documentQueue.js');
    setQueueDisabledByAdmin(true);
  }

  if (documentWorkerStarted) {
    cronManager.register({
      name: 'document-promotion',
      handler: runPromotePopularDocumentInsights,
      intervalMs: config.documents.autoPromote.intervalMs,
      runOnStartup: false,
    });
    logger.info(`[server] document pipeline online (worker + auto-promote every ${config.documents.autoPromote.intervalMs / 1000}s)`);
  } else {
    logger.info('[server] document pipeline offline (disabled by feature flag or not configured)');
  }

// Phase 3 R12 — auto-answer cron registration. Gated by the
  // community.autoAnswer.enabled feature flag (kill switch). Uses
  // the new services/autoAnswer.ts orchestrator; the legacy
  // setInterval-based scheduler in auto-answer.controller.ts is now
  // a no-op deprecation shim.
  if (await featureFlags.isEnabled('communityAutoAnswer')) {
    const { runAutoAnswerBatch } = await import('../services/autoAnswer.js');
    const autoAnswerIntervalMs = config.cron?.autoAnswerIntervalMs ?? 24 * 60 * 60 * 1000;
    cronManager.register({
      name: 'auto-answer-batch',
      handler: () => runAutoAnswerBatch({}),
      intervalMs: autoAnswerIntervalMs,
      runOnStartup: false,
    });
    logger.info(
      `[server] auto-answer cron registered (every ${autoAnswerIntervalMs / 1000}s, concurrency-locked)`,
    );
  } else {
    logger.info('[server] auto-answer cron disabled (communityAutoAnswer feature flag off)');
  }

  // v1.71 — hourly embedding-warm cron. Replaces the old per-request
  // embed path that was timing out against the Hugging Face / local
  // model. Now: cronManager ticks every 60 minutes and calls
  // `embedUnprocessedKnowledge()` which back-fills any
  // TranscriptKnowledge rows that are still missing an embedding
  // (limit: KNOWLEDGE_EMBEDDING_BATCH * 5 per tick). The actual
  // `/csfaq/api/search?q=...` endpoint no longer touches the embedder
  // on the hot path — it degrades to text-only matching when the
  // vector search can't run (see `search.controller.ts`). Manual
  // trigger via `POST /csfaq/api/warm` still works.
  // 7 * 24 * 60 * 60 * 1000 = weekly. The auto-answer pipeline is
  // text-based and doesn't depend on fresh embeddings, so weekly is
  // enough. If embedding infra ever comes back online, the warm pass
  // catches up any docs that were written since the last tick.
  if (await featureFlags.isEnabled('embeddingWarmCron')) {
    const { embedUnprocessedKnowledge } = await import('../modules/knowledge/knowledge-base.service.js');
    const embeddingWarmIntervalMs = 7 * 24 * 60 * 60 * 1000;
    cronManager.register({
      name: 'embedding-warm',
      handler: async () => {
        try {
          const count = await embedUnprocessedKnowledge();
          if (count > 0) {
            logger.info(`[embedding-warm] cron embedded ${count} knowledge entries`);
          }
          // count === 0 is the common steady-state; stay quiet.
        } catch (e: unknown) {
          // Don't crash the cron loop — log and let the next tick retry.
          logger.warn(`[embedding-warm] cron failed: ${(e as Error).message}`);
        }
      },
      intervalMs: embeddingWarmIntervalMs,
      runOnStartup: false, // opt-out of running on boot — first tick is 1h later
    });
    logger.info(
      `[server] embedding-warm cron registered (every ${embeddingWarmIntervalMs / 1000}s)`,
    );
  } else {
    logger.info('[server] embedding-warm cron disabled (embeddingWarmCron feature flag off)');
  }

  // Phase 8 — webAutoDiscover cron. Fetches each configured seed URL
  // every 6 hours, follows same-domain links to depth 1, and upserts
  // the results as `source='auto_discovered'` WebPage rows with
  // `approved: false`. An admin then has to explicitly PATCH
  // /admin/web-pages/:id/approve each row before it surfaces in the
  // retrieval fan-out. Default off (see FEATURE_FLAGS) so the cron
  // never runs without an explicit opt-in.
  if (await featureFlags.isEnabled('webAutoDiscover')) {
    const { runAutoDiscover } = await import('../services/webCrawler.js');
    const webAutoDiscoverIntervalMs = 6 * 60 * 60 * 1000; // 6h
    cronManager.register({
      name: 'web-auto-discover',
      handler: () => runAutoDiscover(),
      intervalMs: webAutoDiscoverIntervalMs,
      runOnStartup: false, // opt-in only — don't surprise the operator on first boot
      startupDelayMs: 30_000, // small startup grace so other crons start first
    });
    logger.info(
      `[server] web auto-discover cron registered (every ${webAutoDiscoverIntervalMs / 1000}s, concurrency-locked)`,
    );
  } else {
    logger.info('[server] web auto-discover cron disabled (webAutoDiscover feature flag off)');
  }

  // v1.71 — LLM-based FAQ recategorize. Replaces the deprecated embedding
  // clusterer above. Off by default; flip `categoryRecategorize` in
  // /admin/features to enable. Mirrors the `webAutoDiscover` opt-in pattern:
  // don't surprise the operator on first boot, don't run without an
  // explicit acknowledgement that the LLM will rewrite `category` fields.
  if (await featureFlags.isEnabled('categoryRecategorize')) {
    const { recategorizeAllActiveBatches } = await import('../utils/ai/categoryAssigner.js');
    const categoryRecategorizeIntervalMs = 2 * 24 * 60 * 60 * 1000; // 2 days
    cronManager.register({
      name: 'category-recategorize',
      handler: () => recategorizeAllActiveBatches(),
      intervalMs: categoryRecategorizeIntervalMs,
      runOnStartup: false,
      startupDelayMs: 30_000,
    });
    logger.info(
      `[server] category-recategorize cron registered (every ${categoryRecategorizeIntervalMs / 1000}s, categoryRecategorize feature flag on)`,
    );
  } else {
    logger.info('[server] category-recategorize cron disabled (categoryRecategorize feature flag off)');
  }

  // Drift-Guard — weekly FAQ drift check
  const driftGuardIntervalMs = 7 * 24 * 60 * 60 * 1000; // 7 days
  cronManager.register({
    name: 'faq-drift-guard',
    handler: async () => {
      const { runFaqDriftGuard } = await import('../modules/faq/faq-drift-guard.service.js');
      await runFaqDriftGuard();
    },
    intervalMs: driftGuardIntervalMs,
    runOnStartup: false,
    startupDelayMs: 60_000, // 1 min grace delay
  });
  logger.info(`[server] faq-drift-guard cron registered (every ${driftGuardIntervalMs / 1000}s)`);

  // Start cron manager
  cronManager.startAll();
}

export async function stopAllSchedulers(): Promise<void> {
  // Stop cron intervals
  cronManager.stopAll();

  // Stop escalation scheduler
  stopEscalationScheduler();

  // Stop AI schedulers.
  // Note: stopAutoAnswerScheduler() / stopFAQAuditScheduler() are no-op
  // shims — the real work is in cronManager.stopAll() above. Kept as
  // imports for backwards compat with any code that still references
  // them; they emit a deprecation WARN.
  // (intentionally not called here — see the comment above)


  // Stop Discord bots
  await stopBot();
  await botManager.stopAll();

  // Stop the document queue worker
  await stopDocumentWorker();

  // Flush pending queues & buffered logs
  await jobQueue.flush(15_000);
  await flushSearchLogs();

  // Close MongoDB connection
  await mongoose.connection.close();
}
