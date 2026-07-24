/**
 * processRegistry.ts — single source of truth for every automated
 * process the backend runs on a schedule or trigger.
 *
 * Why: cronManager owns only the cron-registered jobs. Several other
 * processes use plain setInterval/setTimeout or are tied to service
 * lifecycles (escalation scheduler, legacy auto-answer, legacy
 * faq-audit, document worker, notification outbox drain). The admin
 * Schedule tab needs to see ALL of them in one place — otherwise an
 * admin looking at the page would miss the ones the cronManager
 * doesn't track.
 *
 * Each entry has a uniform shape so the UI can render them with one
 * table component. 'kind' discriminates between cronManager-managed
 * jobs and ad-hoc trackers.
 *
 * 'trigger' is optional. When present, the admin can fire the
 * process on demand. When absent (e.g. document worker — too expensive
 * to fire casually), the trigger button is hidden.
 */

import type { CronJobStats } from './cronManager.js';

export type ProcessKind =
  | 'cron'               // cronManager.register(...) job
  | 'setInterval'        // legacy self-managed scheduler
  | 'service'            // service-lifecycle background work
  | 'startup-only';      // runs once at boot, no recurring tick

export interface ScheduledProcess {
  /** Stable id used in URLs. For cron jobs this matches cronManager job name. */
  id: string;
  /** Display label. */
  label: string;
  /** One-paragraph description shown in the UI. */
  description: string;
  kind: ProcessKind;
  /** Where this is owned (so admins know where to look in the source). */
  owner: string;
  /** Cadence in ms — used for "next run in" estimation. 0 for non-recurring. */
  intervalMs: number;
  /** Whether the process is currently scheduled/active. */
  isActive: boolean;
  /** Whether the process is currently in-flight. */
  isRunning: boolean;
  /** Last successful run. */
  lastRunAt: Date | null;
  /** Last error message. */
  lastError: string | null;
  /** Last error timestamp. */
  lastErrorAt: Date | null;
  /** Cumulative error count. */
  errorCount: number;
  /** Cumulative skip count (only meaningful for cron jobs). */
  skipCount: number;
  /** Whether the UI should expose a "Run now" button. */
  canTriggerManually: boolean;
  /** Optional metadata (e.g. feature flag gating the process). */
  meta?: Record<string, unknown>;
}

interface ProcessTracker {
  id: string;
  isRunning: () => boolean;
  lastRunAt: () => Date | null;
  lastError: () => string | null;
  lastErrorAt: () => Date | null;
  errorCount: () => number;
  trigger?: () => boolean | Promise<boolean>;
}

/**
 * Registry of all non-cron scheduled processes. cron jobs are
 * populated dynamically from cronManager.listJobs(); everything else
 * registers here.
 */
class ProcessRegistry {
  private trackers = new Map<string, ProcessTracker>();

  register(tracker: ProcessTracker): void {
    this.trackers.set(tracker.id, tracker);
  }

  /**
   * Build the union list of all processes (cron jobs + ad-hoc).
   * Static metadata (label/description/etc.) is supplied by the
   * caller because it lives outside the cronManager.
   */
  listAll(cronJobs: CronJobStats[], metadata: ProcessMetadata[]): ScheduledProcess[] {
    const metaById = new Map(metadata.map((m) => [m.id, m]));
    const out: ScheduledProcess[] = [];

    for (const c of cronJobs) {
      const meta = metaById.get(c.name);
      if (!meta) {
        // Unregistered cron job — still surface it but mark description as unknown
        out.push({
          id: c.name,
          label: c.name,
          description: '(no metadata registered — see cronManager registration)',
          kind: 'cron',
          owner: 'unknown',
          intervalMs: c.intervalMs,
          isActive: c.isScheduled,
          isRunning: c.isRunning,
          lastRunAt: c.lastRunAt,
          lastError: c.lastError,
          lastErrorAt: c.lastErrorAt,
          errorCount: c.errorCount,
          skipCount: c.skipCount,
          canTriggerManually: true,
        });
        continue;
      }
      out.push({
        id: c.name,
        label: meta.label,
        description: meta.description,
        kind: meta.kind ?? 'cron',
        owner: meta.owner,
        intervalMs: c.intervalMs,
        isActive: c.isScheduled,
        isRunning: c.isRunning,
        lastRunAt: c.lastRunAt,
        lastError: c.lastError,
        lastErrorAt: c.lastErrorAt,
        errorCount: c.errorCount,
        skipCount: c.skipCount,
        canTriggerManually: meta.canTriggerManually ?? true,
        meta: meta.meta,
      });
    }

    for (const [id, tracker] of this.trackers) {
      const meta = metaById.get(id);
      if (!meta) continue; // not documented in metadata list — skip
      out.push({
        id,
        label: meta.label,
        description: meta.description,
        kind: meta.kind ?? 'service',
        owner: meta.owner,
        intervalMs: meta.intervalMs ?? 0,
        isActive: true,
        isRunning: tracker.isRunning(),
        lastRunAt: tracker.lastRunAt(),
        lastError: tracker.lastError(),
        lastErrorAt: tracker.lastErrorAt(),
        errorCount: tracker.errorCount(),
        skipCount: 0,
        canTriggerManually: !!tracker.trigger,
        meta: meta.meta,
      });
    }

    return out;
  }

  trigger(id: string): boolean {
    const t = this.trackers.get(id);
    if (!t?.trigger) return false;
    const result = t.trigger();
    return result instanceof Promise ? true : result;
  }
}

export interface ProcessMetadata {
  id: string;
  label: string;
  description: string;
  kind?: ProcessKind;
  owner: string;
  intervalMs?: number;
  canTriggerManually?: boolean;
  meta?: Record<string, unknown>;
}

export const processRegistry = new ProcessRegistry();

/**
 * Master metadata table. Edit here when adding new automated processes.
 * Each entry documents one process the Schedule tab should surface.
 */
export const PROCESS_METADATA: ProcessMetadata[] = [
  // ─── cron jobs ─────────────────────────────────────────────────────────
  {
    id: 'promotion-cycle',
    label: 'Promotion Cycle',
    description: 'Promotes community answers to FAQs based on votes and trust levels.',
    kind: 'cron',
    owner: 'modules/program/promotion.service.ts',
    canTriggerManually: true,
  },
  {
    id: 'freshness-check',
    label: 'FAQ Freshness Check',
    description: 'Flags stale FAQs and moves them through review tiers.',
    kind: 'cron',
    owner: 'modules/faq/freshness.controller.ts',
    canTriggerManually: true,
  },
  {
    id: 'notification-outbox-drain',
    label: 'Notification Outbox Drain',
    description: 'Flushes pending notifications every 60s. Retries failed sends.',
    kind: 'cron',
    owner: 'services/notifications.service.ts',
    intervalMs: 60_000,
    canTriggerManually: true,
  },
  {
    id: 'category-recategorize',
    label: 'LLM FAQ Recategorize',
    description: 'Every 2 days: asks the LLM to re-assign each FAQ to the best category. Creates new categories as needed.',
    kind: 'cron',
    owner: 'utils/ai/categoryAssigner.ts',
    intervalMs: 172_800_000,
    canTriggerManually: true,
  },
  {
    id: 'popularity-recompute',
    label: 'Popularity Recompute',
    description: 'Recomputes popularityScore for every public FAQ every 5 minutes.',
    kind: 'cron',
    owner: 'modules/faq/public-faq.controller.ts',
    canTriggerManually: true,
  },
  {
    id: 'retention-policy',
    label: 'Data Retention Policy',
    description: 'Daily cleanup of stale search logs, notifications, moderation logs, etc.',
    kind: 'cron',
    owner: 'scripts/retentionPolicy.ts',
    canTriggerManually: true,
  },
  {
    id: 'ban-cleanup',
    label: 'Golden Ban Cleanup',
    description: 'Removes expired Golden bans from user accounts every hour.',
    kind: 'cron',
    owner: 'services/ban.service.ts',
    intervalMs: 60 * 60 * 1000,
    canTriggerManually: true,
  },
  {
    id: 'zoom-retry',
    label: 'Zoom Meeting Retry',
    description: 'Retries failed Zoom transcript extractions on a backoff schedule.',
    kind: 'cron',
    owner: 'modules/zoom/retry.service.ts',
    canTriggerManually: true,
  },
  {
    id: 'document-promotion',
    label: 'Document Insight Auto-Promote',
    description: 'Promotes popular document insights to FAQs (only when document pipeline is enabled).',
    kind: 'cron',
    owner: 'modules/knowledge/document-promotion.controller.ts',
    canTriggerManually: false, // too expensive to fire casually
    meta: { featureFlag: 'documentPipeline' },
  },
  {
    id: 'auto-answer-batch',
    label: 'Auto-Answer Batch',
    description: 'Processes unanswered community posts through the AI to suggest responses.',
    kind: 'cron',
    owner: 'services/autoAnswer.ts',
    canTriggerManually: true,
    meta: { featureFlag: 'communityAutoAnswer' },
  },
  {
    id: 'embedding-warm',
    label: 'Embedding Warm',
    description: 'Hourly backfill of missing knowledge-base embeddings.',
    kind: 'cron',
    owner: 'modules/knowledge/knowledge-base.service.ts',
    intervalMs: 60 * 60 * 1000,
    canTriggerManually: true,
    meta: { featureFlag: 'embeddingWarmCron' },
  },
  {
    id: 'web-auto-discover',
    label: 'Web Auto-Discover',
    description: 'Every 6 hours: fetches configured seed URLs, follows same-domain links, queues new pages for admin approval.',
    kind: 'cron',
    owner: 'services/webCrawler.ts',
    intervalMs: 6 * 60 * 60 * 1000,
    canTriggerManually: true,
    meta: { featureFlag: 'webAutoDiscover' },
  },

  // ─── legacy setInterval-based schedulers ────────────────────────────────
  {
    id: 'escalation-scheduler',
    label: 'Community Escalation Check',
    description: 'Detects unanswered community posts past the escalation threshold and pings moderators.',
    kind: 'setInterval',
    owner: 'modules/community/escalation.controller.ts',
    canTriggerManually: false, // legacy setInterval, no trigger handle
  },
  {
    id: 'auto-answer-legacy-scheduler',
    label: 'Auto-Answer (legacy scheduler)',
    description: 'DEPRECATION SHIM — the old setInterval-based auto-answer runner. Now handled by cronManager.auto-answer-batch.',
    kind: 'setInterval',
    owner: 'modules/ai/auto-answer.controller.ts',
    canTriggerManually: false,
  },
  {
    id: 'faq-audit-scheduler',
    label: 'FAQ Audit (legacy scheduler)',
    description: 'DEPRECATION SHIM — the old setInterval-based FAQ freshness audit. Replaced by cronManager.freshness-check.',
    kind: 'setInterval',
    owner: 'modules/faq/faq-audit.controller.ts',
    canTriggerManually: false,
  },

  // ─── service-lifecycle work ────────────────────────────────────────────
  {
    id: 'document-worker',
    label: 'Document Pipeline Worker',
    description: 'Background worker that processes document-insight extraction jobs from the queue.',
    kind: 'service',
    owner: 'utils/jobs/documentQueue.ts',
    canTriggerManually: false,
    meta: { featureFlag: 'documentPipeline' },
  },
  {
    id: 'discord-bot',
    label: 'Discord Bot',
    description: 'Long-lived Discord bot connection. Manages slash command listeners and admin handlers.',
    kind: 'service',
    owner: 'integrations/discord/discordBot.ts',
    canTriggerManually: false,
  },
  {
    id: 'bot-manager',
    label: 'Discord Bot Manager',
    description: 'Per-program Discord bots (one per active batch that opts in).',
    kind: 'service',
    owner: 'integrations/discord/botManager.ts',
    canTriggerManually: false,
  },

  // ─── startup-only work ─────────────────────────────────────────────────
  {
    id: 'startup-bookmarks-sync',
    label: 'Startup Bookmarks Sync',
    description: 'Idempotent backfill of user bookmarks into community post bookmark arrays. Runs once at boot.',
    kind: 'startup-only',
    owner: 'bootstrap/startup.ts',
    intervalMs: 0,
    canTriggerManually: false,
  },
  {
    id: 'feature-flag-registry-sync',
    label: 'Feature Flag Registry Sync',
    description: 'Seeds missing feature flags into MongoDB at boot. Logs orphans (no crash on partial deploy).',
    kind: 'startup-only',
    owner: 'services/featureFlags.ts',
    intervalMs: 0,
    canTriggerManually: false,
  },
  {
    id: 'zoom-settings-migration',
    label: 'Zoom Settings Migration',
    description: 'One-shot data migration for Zoom OAuth settings at boot.',
    kind: 'startup-only',
    owner: 'utils/zoomMigration.ts',
    intervalMs: 0,
    canTriggerManually: false,
  },
  {
    id: 'registration-config-bootstrap',
    label: 'Registration Config Bootstrap',
    description: 'Lazy-init the RegistrationConfig singleton at boot.',
    kind: 'startup-only',
    owner: 'modules/program/registration-config.model.ts',
    intervalMs: 0,
    canTriggerManually: false,
  },
];