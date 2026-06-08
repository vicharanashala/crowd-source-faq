/**
 * notificationDispatcher
 *
 * Text-bank driven notification factory.
 * Selects a random message string from the curated pool for the given event type
 * and persists it to MongoDB. Clients poll /api/notifications/tea (30s) and
 * /api/notifications to read state — there is no real-time push today.
 */

import { Types } from 'mongoose';
import Notification, { NotificationType } from '../models/Notification.js';
import { logger } from './logger.js';

// Note: a previous version of this file attempted to emit a real-time Socket.io
// event after persisting a notification. Socket.io is not installed and no
// server is initialized anywhere, so the emit was a no-op. If real-time
// notifications are ever needed, install `socket.io`, create a Server in
// server.ts after `app.listen`, and reintroduce the emit here. For now the
// notification is persisted to MongoDB only — clients poll
// /api/notifications/tea (30s) and /api/notifications to read state.

// ─── Text Bank ─────────────────────────────────────────────────────────────────

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
};

// ─── Dispatcher ───────────────────────────────────────────────────────────────

interface DispatchOptions {
  recipientId: Types.ObjectId;
  eventType: Exclude<NotificationType, 'comment_replied' | 'mention' | 'expert_request'>;
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

  const defaultTitles: Record<string, string> = {
    question_answered: 'New Answer',
    new_question: 'New Question',
    upvote: 'Upvote Received',
    downvote: 'Downvote Received',
    accepted_answer: 'Answer Accepted',
    post_resolved: 'Post Resolved',
    faq_match_found: 'Matching FAQ Found',
  };

  try {
    await Notification.create({
      recipient: recipientId,
      type: eventType,
      title: title ?? defaultTitles[eventType] ?? eventType,
      message,
      link,
      read: false,
    });
  } catch (err) {
    // Notifications are best-effort; surface errors only in environments
    // where you want alerting (staging / canary). In production the error is
    // swallowed to avoid poisoning the parent operation, but we log a warning.
    logger.warn(`[notificationDispatcher] Failed to create notification for ${recipientId}: ${(err as Error).message}`);
  }
};