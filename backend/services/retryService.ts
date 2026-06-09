/**
 * retryService.ts
 *
 * Retry & Dead-Letter Queue (DLQ) logic for the Zoom transcript pipeline.
 *
 * Responsibilities:
 *   scheduleRetry()        — called on failure: classify error, compute backoff, update meeting
 *   retryFailedMeetings()  — called by setInterval cron: find retryable meetings, re-run pipeline
 *   manualRetry()          — admin-triggered retry of a failed or DLQ'd meeting
 *   isRetryableError()     — classify errors as transient (retry) vs permanent (DLQ)
 *
 * Design:
 *   - Exponential backoff: BASE_DELAY * 4^retryCount → 5 min, 20 min, 80 min
 *   - Max 5 meetings per cron tick to avoid overwhelming AI/Zoom APIs
 *   - Reuses error classification patterns from zoomFallback.ts
 *   - Circuit breaker errors are retryable (will recover when circuit closes)
 */

import mongoose from 'mongoose';
import { ZoomMeeting } from '../models/ZoomMeeting.js';
import { logger } from '../utils/logger.js';
import { recordZoomError } from '../utils/zoomHealth.js';

// ─── Config ───────────────────────────────────────────────────────────────────

/** Base retry delay in ms (5 minutes). Backoff: 5m → 20m → 80m */
const BASE_DELAY_MS = 5 * 60 * 1000;

/** Max meetings to retry per cron tick */
const CONCURRENCY_LIMIT = 5;

/** Default max retries before moving to DLQ */
const DEFAULT_MAX_RETRIES = parseInt(process.env['ZOOM_MAX_RETRIES'] ?? '3', 10);

// ─── Error Classification ─────────────────────────────────────────────────────

/**
 * Classify an error message as retryable (transient) or permanent.
 *
 * Retryable errors:
 *   - HTTP 429 (rate limit)
 *   - HTTP 5xx (server error)
 *   - Network errors (fetch, ECONNREFUSED, ETIMEDOUT, timeout)
 *   - Circuit breaker open (will recover)
 *   - AI API errors (provider outage)
 *
 * Permanent errors (skip directly to DLQ):
 *   - HTTP 401/403 (auth — needs manual reconnect)
 *   - Empty/short transcript
 *   - Parsing failures
 *   - User has no Zoom access token
 *   - Token decryption failures
 */
export function isRetryableError(errorMessage: string): boolean {
  const msg = errorMessage.toLowerCase();

  // ── Permanent errors — no point retrying ────────────────────────────────
  if (msg.includes('transcript is empty') || msg.includes('too short to process')) return false;
  if (msg.includes('has not connected their zoom account')) return false;
  if (msg.includes('needs to reconnect zoom')) return false;
  if (msg.includes('token may be corrupted')) return false;
  if (msg.includes('no refresh token')) return false;

  // HTTP 401/403 — auth error, manual intervention needed
  const statusMatch = msg.match(/\b([45]\d{2})\b/);
  if (statusMatch) {
    const status = parseInt(statusMatch[1]);
    if (status === 401 || status === 403) return false;
    // 429 = rate limit, 5xx = server error — retry
    if (status === 429) return true;
    if (status >= 500 && status < 600) return true;
  }

  // ── Retryable errors ────────────────────────────────────────────────────
  if (msg.includes('circuit') && msg.includes('open')) return true;
  if (msg.includes('rate limit')) return true;
  if (msg.includes('ai api error')) return true;
  if (msg.includes('fetch') || msg.includes('econnrefused') ||
      msg.includes('etimedout') || msg.includes('network') ||
      msg.includes('timeout')) return true;

  // Default: treat unknown errors as retryable (safer to retry than lose data)
  return true;
}

// ─── Schedule Retry ───────────────────────────────────────────────────────────

/**
 * Called from processTranscriptPayloadInternal's catch block.
 * Classifies the error, appends to failureHistory, and either
 * schedules a retry with backoff or moves the meeting to DLQ.
 */
export async function scheduleRetry(
  meetingId: mongoose.Types.ObjectId | string,
  errorMessage: string,
  stage: string,
): Promise<void> {
  const meeting = await ZoomMeeting.findById(meetingId);
  if (!meeting) {
    logger.error(`[Retry] Meeting ${meetingId} not found — cannot schedule retry`);
    return;
  }

  const attempt = meeting.retryCount + 1;
  const maxRetries = meeting.maxRetries ?? DEFAULT_MAX_RETRIES;

  // Append to failure history
  const historyEntry = {
    attempt,
    error: errorMessage.slice(0, 500), // cap error message length
    timestamp: new Date(),
    stage,
  };

  const isRetryable = isRetryableError(errorMessage);

  if (!isRetryable || attempt > maxRetries) {
    // ── Move to Dead-Letter Queue ─────────────────────────────────────────
    await moveToDLQ(meeting, historyEntry, errorMessage);
    return;
  }

  // ── Schedule retry with exponential backoff ─────────────────────────────
  const delayMs = BASE_DELAY_MS * Math.pow(4, meeting.retryCount); // 5m, 20m, 80m
  const nextRetryAt = new Date(Date.now() + delayMs);

  await ZoomMeeting.findByIdAndUpdate(meetingId, {
    status: 'failed',
    errorMessage,
    retryCount: attempt,
    nextRetryAt,
    processingCompletedAt: new Date(),
    progress: {
      stage: 'failed',
      percent: 0,
      message: `Retry ${attempt}/${maxRetries} scheduled for ${nextRetryAt.toISOString()}`,
    },
    $push: { failureHistory: historyEntry },
  });

  logger.info(
    `[Retry] Meeting ${meetingId} retry ${attempt}/${maxRetries} scheduled at ${nextRetryAt.toISOString()} ` +
    `(delay: ${Math.round(delayMs / 1000)}s, stage: ${stage})`,
  );
}

// ─── Move to DLQ ──────────────────────────────────────────────────────────────

async function moveToDLQ(
  meeting: InstanceType<typeof ZoomMeeting>,
  historyEntry: { attempt: number; error: string; timestamp: Date; stage: string },
  errorMessage: string,
): Promise<void> {
  const reason = isRetryableError(errorMessage)
    ? `Exhausted all ${meeting.maxRetries ?? DEFAULT_MAX_RETRIES} retries`
    : `Permanent error (non-retryable): ${errorMessage.slice(0, 200)}`;

  await ZoomMeeting.findByIdAndUpdate(meeting._id, {
    status: 'dead_letter',
    errorMessage,
    processingCompletedAt: new Date(),
    progress: {
      stage: 'failed',
      percent: 0,
      message: `Moved to dead-letter queue: ${reason}`,
    },
    $push: { failureHistory: historyEntry },
  });

  logger.warn(
    `[DLQ] Meeting ${meeting._id} moved to dead-letter queue. ` +
    `Reason: ${reason}. Topic: "${meeting.topic}". ` +
    `Total attempts: ${historyEntry.attempt}.`,
  );
}

// ─── Retry Failed Meetings (cron) ─────────────────────────────────────────────

/**
 * Called by the setInterval cron every 15 minutes.
 * Finds meetings eligible for retry and re-runs the appropriate pipeline.
 *
 * Returns the number of meetings that were attempted.
 */
export async function retryFailedMeetings(): Promise<number> {
  const now = new Date();

  // Find meetings ready for retry:
  // - status = 'failed' (not dead_letter, not processing)
  // - nextRetryAt exists and is in the past
  // - retryCount < maxRetries (belt-and-suspenders; scheduleRetry should have DLQ'd them)
  const meetings = await ZoomMeeting.find({
    status: 'failed',
    nextRetryAt: { $exists: true, $lte: now },
  })
    .sort({ nextRetryAt: 1 }) // oldest retry first
    .limit(CONCURRENCY_LIMIT);

  if (meetings.length === 0) return 0;

  logger.info(`[Retry Cron] Found ${meetings.length} meetings eligible for retry`);

  let attempted = 0;

  for (const meeting of meetings) {
    // Double-check retry count (maxRetries may have been changed)
    const maxRetries = meeting.maxRetries ?? DEFAULT_MAX_RETRIES;
    if (meeting.retryCount >= maxRetries) {
      // Should have been DLQ'd already, but fix it now
      await moveToDLQ(
        meeting,
        { attempt: meeting.retryCount, error: 'Retry count exceeded (cron safety check)', timestamp: now, stage: 'retry_cron' },
        meeting.errorMessage ?? 'Retry count exceeded',
      );
      continue;
    }

    try {
      // Mark as processing
      await ZoomMeeting.findByIdAndUpdate(meeting._id, {
        status: 'processing',
        lastRetryAt: now,
        progress: {
          stage: 'queued',
          percent: 5,
          message: `Retry attempt ${meeting.retryCount}/${maxRetries}…`,
        },
      });

      // Determine which pipeline to use based on sourcing
      if (meeting.sourcing === 'webhook' && meeting.rawTranscriptUrl) {
        // Webhook-sourced: re-download transcript using user's token
        const { processTranscriptForUser } = await import('../controllers/zoomController.js');
        await processTranscriptForUser(meeting, meeting.userId.toString());
      } else if (meeting.rawTranscriptText) {
        // Manual upload or already-downloaded: re-process from stored text
        const { processTranscriptPayloadInternal } = await import('../controllers/zoomController.js');
        const sourceType = meeting.sourcing === 'manual_vtt' ? 'vtt_file' as const
          : meeting.sourcing === 'manual_txt' ? 'txt_file' as const
          : meeting.sourcing === 'manual_raw' ? 'manual_upload' as const
          : 'zoom_transcript' as const;
        await processTranscriptPayloadInternal(meeting, meeting.rawTranscriptText, meeting.sourcing, sourceType);
      } else {
        // No transcript URL and no stored text — unrecoverable
        await moveToDLQ(
          meeting,
          { attempt: meeting.retryCount + 1, error: 'No transcript URL or stored text available for retry', timestamp: now, stage: 'retry_cron' },
          'No transcript URL or stored text available for retry',
        );
        continue;
      }

      logger.info(`[Retry Cron] Successfully retried meeting ${meeting._id} (attempt ${meeting.retryCount}/${maxRetries})`);
      attempted++;
    } catch (err) {
      // scheduleRetry() is called internally by processTranscriptPayloadInternal's catch block,
      // so the meeting's retry state is already updated. We just log here.
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[Retry Cron] Retry failed for meeting ${meeting._id}: ${msg}`);
      recordZoomError(msg);
      attempted++;
    }
  }

  return attempted;
}

// ─── Manual Retry (admin) ─────────────────────────────────────────────────────

/**
 * Admin-triggered retry of a specific meeting.
 * Resets retry state and re-queues the meeting for immediate processing.
 */
export async function manualRetry(meetingId: string): Promise<void> {
  const meeting = await ZoomMeeting.findById(meetingId);
  if (!meeting) throw new Error('Meeting not found');
  if (!['failed', 'dead_letter'].includes(meeting.status)) {
    throw new Error(`Cannot retry meeting with status '${meeting.status}'`);
  }

  // Reset retry state — give the meeting a fresh set of retries
  await ZoomMeeting.findByIdAndUpdate(meetingId, {
    status: 'pending',
    retryCount: 0,
    nextRetryAt: new Date(), // eligible for immediate pickup
    lastRetryAt: null,
    errorMessage: null,
    processingCompletedAt: null,
    progress: {
      stage: 'queued',
      percent: 0,
      message: 'Manually re-queued by admin',
    },
    $push: {
      failureHistory: {
        attempt: 0,
        error: 'Manually re-queued by admin',
        timestamp: new Date(),
        stage: 'manual_retry',
      },
    },
  });

  logger.info(`[Retry] Meeting ${meetingId} manually re-queued by admin (previous status: ${meeting.status})`);

  // Fire-and-forget: immediately attempt processing
  try {
    if (meeting.sourcing === 'webhook' && meeting.rawTranscriptUrl) {
      const { processTranscriptForUser } = await import('../controllers/zoomController.js');
      processTranscriptForUser(meeting, meeting.userId.toString()).catch((err) => {
        logger.error(`[Retry] Manual retry background processing failed for ${meetingId}: ${err instanceof Error ? err.message : err}`);
      });
    } else if (meeting.rawTranscriptText) {
      const { processTranscriptPayloadInternal } = await import('../controllers/zoomController.js');
      const sourceType = meeting.sourcing === 'manual_vtt' ? 'vtt_file' as const
        : meeting.sourcing === 'manual_txt' ? 'txt_file' as const
        : meeting.sourcing === 'manual_raw' ? 'manual_upload' as const
        : 'zoom_transcript' as const;
      processTranscriptPayloadInternal(meeting, meeting.rawTranscriptText, meeting.sourcing, sourceType).catch((err) => {
        logger.error(`[Retry] Manual retry background processing failed for ${meetingId}: ${err instanceof Error ? err.message : err}`);
      });
    } else {
      logger.warn(`[Retry] Manual retry for ${meetingId}: no transcript URL or stored text — will wait for cron`);
    }
  } catch (err) {
    logger.error(`[Retry] Manual retry dispatch failed for ${meetingId}: ${err instanceof Error ? err.message : err}`);
  }
}
