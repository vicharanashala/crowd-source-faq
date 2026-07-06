/**
 * services/notifications.service.ts — Phase 1 R3.
 *
 * Single entry point for notification dispatch. Wraps the existing
 * `utils/http/notificationDispatcher.ts` logic (text-bank selection +
 * Notification.create) and adds a Mongo-backed outbox so a transient
 * blip doesn't permanently lose a notification. The audit (§2.4 R3)
 * flagged three call sites where notifications were silently swallowed:
 *   - notificationDispatcher.ts:127-130
 *   - notification.controller.ts:18-22
 *   - tea-notification.controller.ts:31-34
 *
 * This service replaces that pattern with: try happy path; on
 * failure, enqueue an outbox row; a periodic drain retries. The
 * dispatch call is best-effort from the caller's perspective (returns
 * void) but durably scheduled for delivery.
 *
 * Existing controllers that call `dispatchNotification` keep working
 * (re-exported from the dispatcher module). New code should call
 * `notificationsService.dispatch` directly.
 */
import { Types } from 'mongoose';
import Notification from '../modules/notification/notification.model.js';
import NotificationOutbox from '../models/NotificationOutbox.js';
import { logger } from '../utils/http/logger.js';
import { startSession } from 'mongoose';

// ─── Public types ─────────────────────────────────────────────────────────

export type DispatchEventType =
  | 'question_answered'
  | 'new_question'
  | 'upvote'
  | 'downvote'
  | 'accepted_answer'
  | 'post_resolved'
  | 'faq_match_found'
  // v1.72 — FAQ bookmark notifications
  | 'faq_bookmarked'
  | 'faq_updated';

export interface NotificationInput {
  recipientId: Types.ObjectId | string;
  eventType: DispatchEventType;
  link: string;
  title?: string;
  message: string;
}

export interface DispatchResult {
  delivered: boolean;
  /** True if the notification landed directly. False if it went to the
   *  outbox (will be retried by the drain). */
  viaOutbox: boolean;
  notificationId?: Types.ObjectId;
  outboxId?: Types.ObjectId;
}

// ─── Text bank (verbatim from the previous dispatcher) ───────────────────

const notificationTextBank: Record<string, string[]> = {
  question_answered: [
    'Unread Wisdom: 1 new response to your question.',
    'Console Log Update: A user has responded to your question.',
    'Clarity is here. Check out the new answer to your query',
    'You asked, they delivered. Tap to view the latest answer!',
    'Bug resolved? Check out the new response to your question.',
  ],
  new_question: [
    "New doubt spotted on the radar. Go clear it up!",
    'Stack Overflow Mode: A peer just dropped an unhandled question.',
    'New puzzle dropped! Tap to solve the latest mystery on the board.',
    'Your expertise has been summoned, new query dropped',
    'Fresh question, fresh opportunity for glory',
  ],
  upvote: [
    'Knowledge shared. Appreciation received.',
    'Someone totally loved your answer and smashed the upvote button.',
    'Your response just picked up another round of applause.',
    'Your explanation resonated perfectly with the community.',
    'Your answer is scaling up! Clean execution recognized by the cluster.',
  ],
  downvote: [
    'Oof, tough crowd! Someone disagreed with your answer.',
    "Plot twist! Your response didn't quite work for everyone.",
    'Constructive feedback time: A peer feels this answer could use a bit more depth',
    'Oof. The crowd threw a tomato 🍅, your answer got downvoted.',
  ],
  accepted_answer: [
    '👑 Case closed. You just solved a mystery.',
    '👑 Your answer got the crown your highness',
    '👑 Your answer understood the assignment.',
    '👑 Status: Closed. Your answer was verified as the ultimate working solution.',
    '👑 We have a winner! The author picked your solution out of the entire crowd.',
  ],
  post_resolved: [
    '✅ Your question just got answered. Tap to see the response.',
    '✅ Solved! A teammate or admin has closed the loop on your post.',
    '✅ Your community post is now answered — check out the solution.',
    '✅ Mystery solved. Your post has a verified answer waiting.',
    '✅ Resolution found! Your question just got the answer it needed.',
  ],
  faq_match_found: [
    '💡 Heads up — a similar question already has an answer in the FAQ.',
    '💡 FYI: the knowledge base has a relevant FAQ for this topic.',
    '💡 Look here — a related FAQ was found that might help.',
    '💡 Pro tip: a matching FAQ is sitting in the knowledge base.',
    '💡 Quick match: we found an existing FAQ that covers your topic.',
  ],
  // v1.72 — FAQ bookmark notifications
  faq_bookmarked: [
    "🔖 FAQ bookmarked. You'll be notified when this answer gets updated.",
    "🔖 Saved! We'll ping you if this FAQ changes.",
    "🔖 Bookmarked. We'll let you know when this FAQ is updated.",
    "🔖 Got it. Updates to this FAQ will land in your inbox.",
    "🔖 Bookmark set. We'll alert you on changes.",
  ],
  faq_updated: [
    '📝 Update alert! A FAQ you bookmarked has been updated.',
    '📝 New content alert. A FAQ you saved just changed.',
    '📝 Heads up — a saved FAQ was refreshed.',
    '📝 Edit landed. A FAQ you bookmarked just got refreshed.',
    '📝 Change spotted. Tap to see what is new in a bookmarked FAQ.',
  ],
};

const defaultTitles: Record<string, string> = {
  question_answered: 'New Answer',
  new_question: 'New Question',
  upvote: 'Upvote Received',
  downvote: 'Downvote Received',
  accepted_answer: 'Answer Accepted',
  post_resolved: 'Post Resolved',
  faq_match_found: 'Matching FAQ Found',
  // v1.72 — FAQ bookmark notifications
  faq_bookmarked: 'FAQ Bookmarked',
  faq_updated: 'FAQ Updated',
};

// ─── Outbox caps ─────────────────────────────────────────────────────────

const OUTBOX_MAX_ROWS = 10_000; // belt-and-braces cap; on overflow we drop the oldest pending
const OUTBOX_BACKOFF_MS = 60_000; // 1 minute — exponential backoff applied to nextAttemptAt
const OUTBOX_MAX_ATTEMPTS = 24;  // after 24 attempts (~24 minutes total) we drop the row + log a hard error

// ─── Service ──────────────────────────────────────────────────────────────

class NotificationsService {
  /**
   * Dispatch a notification. Best-effort from the caller's perspective
   * (returns void) — the result is structured for tests + observability.
   *
   *   - On success: Notification is created, return { delivered: true, viaOutbox: false }.
   *   - On failure (Mongo blip, validation, etc.): row goes to NotificationOutbox.
   *     The periodic drain will retry. Return { delivered: true, viaOutbox: true }.
   *
   * The caller's operation never throws. A 500 from the controller should
   * never mean a notification was lost.
   */
  async dispatch(input: NotificationInput): Promise<DispatchResult> {
    const recipientId = new Types.ObjectId(String(input.recipientId));
    const title = input.title ?? defaultTitles[input.eventType] ?? input.eventType;
    const message = input.message;

    try {
      const doc = await Notification.create({
        recipient: recipientId,
        type: input.eventType,
        title,
        message,
        link: input.link,
        read: false,
      });
      return { delivered: true, viaOutbox: false, notificationId: doc._id };
    } catch (err) {
      const error = err as Error;
      logger.warn(
        `[notifications] direct dispatch failed for ${String(recipientId)}: ${error.message}. ` +
          `Routing to outbox.`,
      );
      // Direct dispatch failed — schedule for the drain.
      try {
        const outbox = await NotificationOutbox.create({
          recipient: recipientId,
          type: input.eventType,
          title,
          message,
          link: input.link,
          attempts: 0,
          nextAttemptAt: new Date(),
        });
        // Cap-check: if over the cap, drop oldest pending row.
        await this.enforceOutboxCap();
        return { delivered: true, viaOutbox: true, outboxId: outbox._id };
      } catch (outboxErr) {
        // Outbox write also failed — log a hard error. The notification
        // is genuinely lost at this point. We do not throw — the
        // caller's operation must continue.
        logger.error(
          `[notifications] OUTBOX write also failed for ${String(recipientId)}: ` +
            `${(outboxErr as Error).message}. Notification permanently lost.`,
        );
        return { delivered: false, viaOutbox: false };
      }
    }
  }

  /**
   * If the outbox has more than OUTBOX_MAX_ROWS pending rows, delete
   * the oldest (lowest priority) pending ones. Called after every
   * enqueue so the cap is enforced proactively.
   */
  private async enforceOutboxCap(): Promise<void> {
    const total = await NotificationOutbox.countDocuments();
    if (total <= OUTBOX_MAX_ROWS) return;
    const excess = total - OUTBOX_MAX_ROWS;
    // Sort ascending by createdAt — drop the oldest.
    const oldest = await NotificationOutbox.find()
      .sort({ createdAt: 1 })
      .limit(excess)
      .select('_id')
      .lean();
    const ids = oldest.map((d) => d._id);
    if (ids.length === 0) return;
    await NotificationOutbox.deleteMany({ _id: { $in: ids } });
    logger.warn(
      `[notifications] outbox cap exceeded (${total} > ${OUTBOX_MAX_ROWS}). ` +
        `Dropped ${ids.length} oldest pending rows.`,
    );
  }

  /**
   * Drain pending outbox rows. Called by bootstrap/startup.ts on a
   * setInterval (default 60s) AND on app start.
   *
   * For each due row:
   *   - Bump attempts
   *   - Try to write to Notification
   *   - On success: delete the outbox row
   *   - On failure: schedule next attempt with exponential backoff
   *     (nextAttemptAt = now + OUTBOX_BACKOFF_MS * 2^attempts, capped at 1h)
   *   - After OUTBOX_MAX_ATTEMPTS: drop the row + log a hard error
   *
   * Returns counts for observability + the drain CLI script.
   */
  async drain(maxRows = 100): Promise<{
    attempted: number;
    delivered: number;
    rescheduled: number;
    dropped: number;
  }> {
    const now = new Date();
    const due = await NotificationOutbox.find({ nextAttemptAt: { $lte: now } })
      .sort({ nextAttemptAt: 1, _id: 1 })
      .limit(maxRows)
      .lean();

    let attempted = 0;
    let delivered = 0;
    let rescheduled = 0;
    let dropped = 0;

    for (const row of due) {
      attempted++;
      try {
        await Notification.create({
          recipient: row.recipient,
          type: row.type,
          title: row.title,
          message: row.message,
          link: row.link,
          read: false,
        });
        // Success — delete the outbox row.
        await NotificationOutbox.deleteOne({ _id: row._id });
        delivered++;
      } catch (err) {
        const attempts = (row.attempts ?? 0) + 1;
        if (attempts >= OUTBOX_MAX_ATTEMPTS) {
          // Give up — log a hard error and drop the row.
          logger.error(
            `[notifications] outbox row ${String(row._id)} exceeded ${OUTBOX_MAX_ATTEMPTS} attempts. ` +
              `Dropping. Last error: ${(err as Error).message}`,
          );
          await NotificationOutbox.deleteOne({ _id: row._id });
          dropped++;
          continue;
        }
        // Exponential backoff: OUTBOX_BACKOFF_MS * 2^(attempts-1), capped at 1h.
        const delayMs = Math.min(
          OUTBOX_BACKOFF_MS * 2 ** (attempts - 1),
          60 * 60 * 1000,
        );
        await NotificationOutbox.updateOne(
          { _id: row._id },
          {
            $set: {
              attempts,
              lastError: (err as Error).message,
              nextAttemptAt: new Date(Date.now() + delayMs),
            },
          },
        );
        rescheduled++;
      }
    }

    if (delivered > 0 || dropped > 0) {
      logger.info(
        `[notifications] drain: ${attempted} attempted, ${delivered} delivered, ` +
          `${rescheduled} rescheduled, ${dropped} dropped`,
      );
    }
    return { attempted, delivered, rescheduled, dropped };
  }

  /**
   * Stats for the admin queue view. Returns the count of pending
   * outbox rows + the oldest pending timestamp. Admin pages can use
   * this to surface "X notifications stuck" in the dashboard.
   */
  async outboxStats(): Promise<{ pending: number; oldestPendingAt: Date | null }> {
    const total = await NotificationOutbox.countDocuments();
    if (total === 0) return { pending: 0, oldestPendingAt: null };
    const oldest = await NotificationOutbox.findOne()
      .sort({ createdAt: 1 })
      .select('createdAt')
      .lean();
    return {
      pending: total,
      oldestPendingAt: oldest?.createdAt ?? null,
    };
  }
}

export const notificationsService = new NotificationsService();
