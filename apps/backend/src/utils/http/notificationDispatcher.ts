/**
 * notificationDispatcher
 *
 * Text-bank driven notification factory. Selects a random message
 * string from the curated pool for the given event type and dispatches
 * via `services/notifications.service.ts` (which writes to Notification
 * or, on failure, to the NotificationOutbox for retry).
 *
 * Phase 1 R3: the dispatcher now delegates to the service. The
 * service handles durable outbox + drain. This file keeps the
 * text-bank, default titles, and the `dispatchNotification` function
 * signature for back-compat with the ~12 call sites in the codebase.
 *
 * Clients poll /api/notifications/tea (30s) and /api/notifications
 * to read state — there is no real-time push today.
 */

import { Types } from 'mongoose';
import {
  notificationsService,
  type DispatchEventType,
  type NotificationInput,
} from '../../services/notifications.service.js';

// Re-export so existing imports keep working.
export { notificationsService };
export type { DispatchEventType, NotificationInput } from '../../services/notifications.service.js';

// ─── Text Bank ─────────────────────────────────────────────────────────────

const notificationTextBank: Record<DispatchEventType, string[]> = {
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
};

// ─── Dispatcher ──────────────────────────────────────────────────────────

interface DispatchOptions {
  recipientId: Types.ObjectId;
  eventType: DispatchEventType;
  /** Navigable URL — e.g. /community?post=<id> or /faq/<faqId> */
  link: string;
  /**
   * Optional human-readable title override.
   * When omitted a sensible default is derived from eventType.
   */
  title?: string;
}

/**
 * Fire-and-forget notification factory.
 *
 * Usage in a controller:
 *   await dispatchNotification({ recipientId: post.author, eventType: 'upvote', link: `/community?post=${postId}` });
 *
 * Delegates to the notifications service which writes to Notification
 * (or NotificationOutbox on failure). Never throws.
 */
export const dispatchNotification = async ({
  recipientId,
  eventType,
  link,
  title,
}: DispatchOptions): Promise<void> => {
  const bank = notificationTextBank[eventType];
  if (!bank || bank.length === 0) return; // Unknown eventType — no-op silently

  const message = bank[Math.floor(Math.random() * bank.length)];

  await notificationsService.dispatch({
    recipientId,
    eventType,
    link,
    title,
    message,
  });
};
