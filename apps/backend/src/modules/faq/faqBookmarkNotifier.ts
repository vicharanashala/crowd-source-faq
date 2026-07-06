/**
 * faqBookmarkNotifier
 *
 * Background fan-out of "FAQ updated" notifications to all users who bookmarked
 * a given FAQ. Streams the recipient list with a Mongo cursor + chunks
 * inserts so a popular FAQ with thousands of bookmarkers does not block the
 * caller (the original PUT /api/faq/:id that triggered it).
 *
 * v1.72
 */

import { Types } from 'mongoose';
import User from '../auth/user.model.js';
import { dispatchNotification } from '../../utils/http/notificationDispatcher.js';
import { adminLog } from '../../utils/http/logger.js';

/** Number of recipient IDs dispatched per Notification.create batch. */
const CHUNK_SIZE = 200;

interface NotifyBookmarkersOptions {
  faqId: Types.ObjectId;
  /** Override the default link (e.g. for previews of pre-publish edits). */
  link?: string;
}

/**
 * Fire-and-forget fan-out. Returns immediately; the caller should NOT await
 * this in a request handler — pass the returned promise into
 * `.catch(adminLog.warn)` if you want basic error logging.
 *
 * Why background:
 *   - Avoids blocking the admin's PUT /api/faq/:id response on large bookmark lists
 *   - Keeps API latency stable regardless of fan-out size
 *   - Errors surface in logs without poisoning the user's request
 */
export function notifyFaqBookmarkers(opts: NotifyBookmarkersOptions): Promise<void> {
  // Resolve immediately; do work in the background.
  return (async () => {
    const link = opts.link ?? `/faq/${opts.faqId.toString()}`;
    let total = 0;

    try {
      const cursor = User.find({ faqBookmarks: opts.faqId })
        .select('_id')
        .lean()
        .cursor();

      let batch: Types.ObjectId[] = [];
      for await (const u of cursor) {
        batch.push(u._id as Types.ObjectId);
        if (batch.length >= CHUNK_SIZE) {
          await dispatchBatch(batch, link);
          total += batch.length;
          batch = [];
        }
      }
      if (batch.length > 0) {
        await dispatchBatch(batch, link);
        total += batch.length;
      }

      if (total > 0) {
        adminLog.info(`[faqBookmarkNotifier] faq=${opts.faqId.toString()} notified=${total}`);
      }
    } catch (err) {
      adminLog.warn(
        `[faqBookmarkNotifier] fan-out failed for faq=${opts.faqId.toString()}: ${(err as Error).message}`,
      );
    }
  })();
}

async function dispatchBatch(recipients: Types.ObjectId[], link: string): Promise<void> {
  // Best-effort: dispatchNotification itself swallows per-recipient errors
  // and logs them. We still await so cursor streaming remains ordered.
  await Promise.all(
    recipients.map((recipientId) =>
      dispatchNotification({
        recipientId,
        eventType: 'faq_updated',
        link,
        title: 'FAQ Updated',
      }),
    ),
  );
}